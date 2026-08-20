// 발주 계산 — 창고별 일 예상판매량(Daily, 선적 엔진과 동일 로직) 기반
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, trendAdjustedNewProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { WH_GROUPS, type WhKey, manualTargetYm, type ForecastMap, type LyWindowMap } from "./shipCalc";
import { RATIO_WAREHOUSES, type RatioWh, type ActualRatio } from "./rebalance";

const PO_NEED_DAYS = 45;
export const PO_HORIZON_DAYS = 120;

export type PoCalcRow = {
    key: string;
    sku: string;
    wh: WhKey;
    oh: number;
    it: number;
    shipPlan: number;
    daily: number;
    /** Manual 계산모드에서 매뉴얼 예측치 기반으로 환산한 일 예상판매량. 매뉴얼 데이터가 없으면 null(daily로 폴백). */
    manualDaily: number | null;
    /** SKU의 84일 실제 출고 비율 중 이 창고 몫 (합계=1, RATIO_WAREHOUSES 대상 외에는 null) */
    actualRatio: number | null;
    poPred120: number;
    need45d: number;
    projected120d: number;
    finalPoQty: number;
};

function sumParts(r: SummaryRow, parts: string[], suffix: string): number {
    return parts.reduce((acc, p) => {
        const key = `${p}_${suffix}` as keyof SummaryRow;
        return acc + ((r[key] as number) ?? 0);
    }, 0);
}

export function computePoCalc(
    rows: SummaryRow[],
    logicMode: LogicMode,
    shipRatio84d: Record<string, ActualRatio> = {},
    forecastMap: ForecastMap = {},
    lyBackward14d: LyWindowMap = {},
    lyForward14d: LyWindowMap = {},
): PoCalcRow[] {
    const result: PoCalcRow[] = [];
    const useManual = logicMode === "manual" || logicMode === "default_manual";
    // 발주는 창고 리드타임(lt)이 아니라 PO_HORIZON_DAYS(120일) 기준으로 미래를 내다보므로,
    // 매뉴얼 예측치 대상월도 lt가 아니라 PO_HORIZON_DAYS로 계산해야 한다(선적 엔진과는 기준이 다름).
    const manualYm = useManual ? manualTargetYm(PO_HORIZON_DAYS, true) : null;

    for (const r of rows) {
        if (isDrop(r.SKU)) continue;

        // 매뉴얼 예측치(FRCST_STOCK)는 SKU 전체 기준 "일 예상판매량"이라 창고별로 쪼갤 이유가 없다.
        // 예전엔 84일 실출고비율로 창고별로 나눴다가 합산할 때 다시 더했는데, 그 과정에서 부동소수점
        // 반올림 오차가 생겨 매뉴얼로 입력한 값(예: 600)이 599.99처럼 어긋나 보였다. SKU 단위로 바로 쓴다.
        const skuManualDaily = manualYm ? forecastMap[r.SKU]?.[manualYm] ?? null : null;

        const perWh = {} as Record<WhKey, { oh: number; it: number; shipPlan: number; daily: number; actualRatio: number | null }>;

        for (const [wh, { parts, lt }] of Object.entries(WH_GROUPS) as [WhKey, { parts: string[]; lt: number }][]) {
            const ly7  = sumParts(r, parts, "LAST_YEAR_1WEEK_SALES_QTY");
            const cy7  = sumParts(r, parts, "CURR_YEAR_1WEEK_SALES_QTY");
            const ly28 = sumParts(r, parts, "LAST_YEAR_1MONTH_SALES_QTY");
            const cy28 = sumParts(r, parts, "CURR_YEAR_1MONTH_SALES_QTY");
            const ly56 = sumParts(r, parts, "LAST_YEAR_2MONTH_SALES_QTY");
            const cy56 = sumParts(r, parts, "CURR_YEAR_2MONTH_SALES_QTY");

            let lyPeriod = sumParts(r, parts, "LAST_YEAR_ACTL_SALES_QTY");
            if (lyPeriod === 0) lyPeriod = (ly56 / 56) * lt;

            const growthFactor = weightedGrowthFactor(cy7, ly7, cy28, ly28, cy56, ly56);
            const isNew = isNewProduct(r.SKU, ly7, ly28, ly56, growthFactor, logicMode);

            let daily: number;
            if (logicMode === "default_manual") {
                const lyFwd14 = RATIO_WAREHOUSES.includes(wh as RatioWh)
                    ? lyForward14d[r.SKU]?.[wh as RatioWh] ?? 0
                    : null;
                const lyBack14 = RATIO_WAREHOUSES.includes(wh as RatioWh)
                    ? lyBackward14d[r.SKU]?.[wh as RatioWh] ?? 0
                    : 0;
                daily = trendAdjustedNewProductDaily(cy7, cy28, cy56, lyBack14, lyFwd14);
            } else if (isNew) {
                daily = newProductDaily(cy7, cy28, cy56);
            } else {
                // LY_ACTL은 창고별 리드타임(lt)만큼의 작년 forward 실적이므로 lt로 나눠야 한다.
                daily = (lyPeriod * (isFinite(growthFactor) ? growthFactor : 0)) / lt;
            }

            const actualRatio = RATIO_WAREHOUSES.includes(wh as RatioWh)
                ? shipRatio84d[r.SKU]?.[wh as RatioWh] ?? null
                : null;

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            const shipPlan = sumParts(r, parts, "SHIPPLAN_QTY") +
                (wh === "CA" ? ((r.CA1_SHIPPLAN_QTY as number) ?? 0) : 0);

            perWh[wh] = { oh, it, shipPlan, daily, actualRatio };
        }

        function pushRow(keySuffix: string, wh: WhKey, oh: number, it: number, shipPlan: number, trendDaily: number, effectiveDaily: number, manualDaily: number | null, actualRatio: number | null) {
            const need45d = effectiveDaily * PO_NEED_DAYS;
            const poPred120 = effectiveDaily * PO_HORIZON_DAYS;
            const projected120d = (oh + it + shipPlan) - poPred120;
            const rawPo = Math.max(0, need45d - projected120d);

            // Manual 포함 전체 캡 적용
            const finalPoQty = Math.round(Math.min(rawPo, Math.max(0, need45d)));

            result.push({
                key: `${r.SKU}__${keySuffix}`,
                sku: r.SKU,
                wh,
                oh: Math.round(oh),
                it: Math.round(it),
                shipPlan: Math.round(shipPlan),
                daily: Math.round(trendDaily * 100) / 100,
                manualDaily: manualDaily == null ? null : Math.round(manualDaily * 100) / 100,
                actualRatio,
                poPred120: Math.round(poPred120),
                need45d: Math.round(need45d),
                projected120d: Math.round(projected120d),
                finalPoQty,
            });
        }

        if (skuManualDaily != null) {
            // 매뉴얼 예측치는 전 창고(WF 포함) 합산 기준 "일 예상판매량"이므로, 전 창고 실측치를 합쳐서
            // SKU 전체 매뉴얼 값 하나로 한 번만 계산한다. WF도 별도 추세로 더하지 않는다.
            let ohSum = 0, itSum = 0, spSum = 0, trendDailySum = 0;
            for (const wh of Object.keys(WH_GROUPS) as WhKey[]) {
                ohSum += perWh[wh].oh;
                itSum += perWh[wh].it;
                spSum += perWh[wh].shipPlan;
                trendDailySum += perWh[wh].daily;
            }
            pushRow("RATIO", "CA", ohSum, itSum, spSum, trendDailySum, skuManualDaily, skuManualDaily, null);
        } else {
            for (const wh of RATIO_WAREHOUSES) {
                const p = perWh[wh];
                pushRow(wh, wh, p.oh, p.it, p.shipPlan, p.daily, p.daily, null, p.actualRatio);
            }

            // WF는 매뉴얼 예측 대상(RATIO_WAREHOUSES)이 아니므로 매뉴얼 값이 없을 때만 자체 추세 daily로 계산.
            const wf = perWh.WF;
            pushRow("WF", "WF", wf.oh, wf.it, wf.shipPlan, wf.daily, wf.daily, null, wf.actualRatio);
        }
    }

    return result;
}

/** SKU+창고 행을 SKU 단위로 합산한 발주 결정용 뷰. 재고/입고/선적계획/발주량은 합산, daily는 창고별 판매율의 총합. */
export type PoCalcRowAgg = {
    sku: string;
    oh: number;
    it: number;
    shipPlan: number;
    daily: number;
    manualDaily: number | null;
    poPred120: number;
    need45d: number;
    projected120d: number;
    finalPoQty: number;
    usingManual: boolean;
};

export function aggregatePoBySku(rows: PoCalcRow[]): PoCalcRowAgg[] {
    const map = new Map<string, PoCalcRowAgg>();

    for (const r of rows) {
        const cur = map.get(r.sku) ?? {
            sku: r.sku,
            oh: 0, it: 0, shipPlan: 0, daily: 0, manualDaily: null,
            poPred120: 0, need45d: 0, projected120d: 0, finalPoQty: 0,
            usingManual: false,
        };

        cur.oh += r.oh;
        cur.it += r.it;
        cur.shipPlan += r.shipPlan;
        cur.daily += r.daily;
        cur.poPred120 += r.poPred120;
        cur.need45d += r.need45d;
        cur.projected120d += r.projected120d;
        cur.finalPoQty += r.finalPoQty;
        if (r.manualDaily != null) {
            cur.manualDaily = (cur.manualDaily ?? 0) + r.manualDaily;
            cur.usingManual = true;
        }

        map.set(r.sku, cur);
    }

    return [...map.values()];
}
