// 발주 계산 — 창고별 일 예상판매량(Daily, 선적 엔진과 동일 로직) 기반
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, medianTrend, type LogicMode, type TrendMedianWindow } from "./logicMode";
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
    trendMedians: Record<string, TrendMedianWindow> = {},
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

            // default_manual 모드는 아래에서 SKU 전체 기준으로 따로 계산하므로(중위값 추세), 여기서 구하는
            // daily는 default_manual 모드에서는 쓰이지 않는다(다른 로직모드의 창고별 폴백 경로에서만 사용).
            let daily: number;
            if (isNew) {
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

        function pushRow(keySuffix: string, wh: WhKey, oh: number, it: number, shipPlan: number, trendDaily: number, effectiveDaily: number, manualDaily: number | null, actualRatio: number | null, poPred120Override?: number) {
            const need45d = effectiveDaily * PO_NEED_DAYS;
            const poPred120 = poPred120Override ?? (effectiveDaily * PO_HORIZON_DAYS);
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
            pushRow("ALL", "CA", ohSum, itSum, spSum, trendDailySum, skuManualDaily, skuManualDaily, null);
        } else if (logicMode === "default_manual") {
            // 매뉴얼 예측치가 없는 SKU: 전 창고(WF 포함) 실측치를 합쳐서 SKU 전체 기준 하나로 계산한다.
            // 일 예상판매량 자체(0.7/0.2/0.1 가중 7·28·56일 판매량)는 그대로 두고, 여기 곱해지는 "추세"만
            // 기존 28일 단순 forward/backward 비교 대신 작년 -30~+150일 6구간 중위값 누적(ratchet) 추세로 교체했다.
            // 판매량(cy7/28/56)은 창고별 부분합을 다시 더하지 않고 SUMMARY_QUERY가 이미 SKU 전체로 낸
            // TOTAL 컬럼을 그대로 쓴다 — PO는 창고 구분이 필요 없으므로.
            let ohSum = 0, itSum = 0, spSum = 0;
            for (const wh of Object.keys(WH_GROUPS) as WhKey[]) {
                ohSum += perWh[wh].oh;
                itSum += perWh[wh].it;
                spSum += perWh[wh].shipPlan;
            }
            const cy7Sum = r.CURR_YEAR_1WEEK_TOTAL_SALES_QTY ?? 0;
            const cy28Sum = r.CURR_YEAR_1MONTH_TOTAL_SALES_QTY ?? 0;
            const cy56Sum = r.CURR_YEAR_2MONTH_TOTAL_SALES_QTY ?? 0;

            const baseDaily = newProductDaily(cy7Sum, cy28Sum, cy56Sum);
            const { ratios, trend } = medianTrend(trendMedians[r.SKU]);
            // "120일 이후 예상 판매량"(화면 daily 필드)는 baseDaily에 최종 추세(구간차 캐스케이드)를 곱한다.
            const effectiveDaily = baseDaily * trend;

            // 120일치 예상판매량: 추세를 곱하지 않은 baseDaily에, 4구간(30일씩 120일)마다 그 구간 자체의
            // 배수를 곱해서 더한다. 각 구간(idx)은 자기 위치부터 거꾸로 medianTrend와 같은 캐스케이드를 다시
            // 태운다: (추세idx - 추세(idx-1)) 차이가 0 이상(증가)인 첫 지점을 배수로 쓰되, 두 추세가 둘 다
            // 1 미만이면 그 pair는 건너뛴다. 못 찾으면 추세1 자체(1 이상일 때만), 그마저 없으면 1배.
            const resolvedTermTrend = (idx: number): number => {
                for (let j = idx; j >= 1; j--) {
                    if (ratios[j] < 1 && ratios[j - 1] < 1) continue;
                    const diff = ratios[j] - ratios[j - 1];
                    if (diff >= 0) return diff;
                }
                return ratios[0] >= 1 ? ratios[0] : 1;
            };
            const poPred120 = [0, 1, 2, 3].reduce((sum, i) => sum + baseDaily * resolvedTermTrend(i) * 30, 0);

            pushRow("ALL", "CA", ohSum, itSum, spSum, effectiveDaily, effectiveDaily, null, null, poPred120);
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
