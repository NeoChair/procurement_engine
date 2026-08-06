// 발주 계산 — 창고별 일 예상판매량(Daily, 선적 엔진과 동일 로직) 기반
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { WH_GROUPS, type WhKey, manualDailyForWh, type ForecastMap } from "./shipCalc";
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
): PoCalcRow[] {
    const result: PoCalcRow[] = [];

    for (const r of rows) {
        if (isDrop(r.SKU)) continue;

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
            if (isNew) {
                daily = newProductDaily(cy7, cy28, cy56);
            } else {
                // LY_ACTL은 창고별 리드타임(lt)만큼의 작년 forward 실적이므로 lt로 나눠야 한다.
                daily = (lyPeriod * (isFinite(growthFactor) ? growthFactor : 0)) / lt;
            }

            // 발주는 창고 리드타임(lt)이 아니라 PO_HORIZON_DAYS(120일) 기준으로 미래를 내다보므로,
            // 매뉴얼 예측치 대상월도 lt가 아니라 PO_HORIZON_DAYS로 계산해야 한다(선적 엔진과는 기준이 다름).
            const manualDaily = logicMode === "manual"
                ? manualDailyForWh(r.SKU, wh, PO_HORIZON_DAYS, forecastMap, shipRatio84d)
                : null;
            // Manual 모드에서 매뉴얼 예측치가 있으면 그걸로 실제 계산을 대체하고, need45d 캡도 없앤다
            // (사람이 직접 입력한 값이니 자동 엔진의 안전 상한을 적용하지 않고 raw 부족분을 그대로 반영).
            const effectiveDaily = manualDaily ?? daily;
            const usingManual = manualDaily != null;

            const actualRatio = RATIO_WAREHOUSES.includes(wh as RatioWh)
                ? shipRatio84d[r.SKU]?.[wh as RatioWh] ?? null
                : null;

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            const shipPlan = sumParts(r, parts, "SHIPPLAN_QTY") +
                (wh === "CA" ? ((r.CA1_SHIPPLAN_QTY as number) ?? 0) : 0);

            const need45d = effectiveDaily * PO_NEED_DAYS;
            const poPred120 = effectiveDaily * PO_HORIZON_DAYS;
            const projected120d = (oh + it + shipPlan) - poPred120;
            const rawPo = Math.max(0, need45d - projected120d);
            
            // Manual 제외 캡 원하면,, 씌워주기
            // const finalPoQty = usingManual
            //     ? Math.round(rawPo)
            //     : Math.round(Math.min(rawPo, Math.max(0, need45d)));
            
            const finalPoQty = Math.round(rawPo);

            result.push({
                key: `${r.SKU}__${wh}`,
                sku: r.SKU,
                wh,
                oh: Math.round(oh),
                it: Math.round(it),
                shipPlan: Math.round(shipPlan),
                daily: Math.round(daily * 100) / 100,
                manualDaily: manualDaily == null ? null : Math.round(manualDaily * 100) / 100,
                actualRatio,
                poPred120: Math.round(poPred120),
                need45d: Math.round(need45d),
                projected120d: Math.round(projected120d),
                finalPoQty,
            });
        }
    }

    return result;
}
