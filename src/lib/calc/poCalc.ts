// 발주 계산 — 창고별 일 예상판매량(Daily, 선적 엔진과 동일 로직) 기반
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { WH_GROUPS, type WhKey } from "./shipCalc";

const PO_NEED_DAYS = 45;
const PO_HORIZON_DAYS = 120;

export type PoCalcRow = {
    key: string;
    sku: string;
    wh: WhKey;
    oh: number;
    it: number;
    shipPlan: number;
    daily: number;
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

export function computePoCalc(rows: SummaryRow[], logicMode: LogicMode): PoCalcRow[] {
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

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            const shipPlan = sumParts(r, parts, "SHIPPLAN_QTY") +
                (wh === "CA" ? ((r.CA1_SHIPPLAN_QTY as number) ?? 0) : 0);

            const need45d = daily * PO_NEED_DAYS;
            const poPred120 = daily * PO_HORIZON_DAYS;
            const projected120d = (oh + it + shipPlan) - poPred120;
            const rawPo = Math.max(0, need45d - projected120d);
            const finalPoQty = Math.round(Math.min(rawPo, Math.max(0, need45d)));

            result.push({
                key: `${r.SKU}__${wh}`,
                sku: r.SKU,
                wh,
                oh: Math.round(oh),
                it: Math.round(it),
                shipPlan: Math.round(shipPlan),
                daily: Math.round(daily * 100) / 100,
                poPred120: Math.round(poPred120),
                need45d: Math.round(need45d),
                projected120d: Math.round(projected120d),
                finalPoQty,
            });
        }
    }

    return result;
}
