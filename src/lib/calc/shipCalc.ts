// 선적 계산 (28일 캡, 창고별)
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { rebalanceSku, RATIO_WAREHOUSES, type RatioWh, type Week1AllocMode } from "./rebalance";

const ACTL_BASE_DAYS = 63;

export type WhKey = "CA" | "NJ" | "GA" | "TX" | "WF";

export const WH_GROUPS: Record<WhKey, { parts: string[]; lt: number }> = {
    CA:  { parts: ["CA", "CA2"], lt: 63  },
    NJ:  { parts: ["NJ"],        lt: 77  },
    GA:  { parts: ["GA", "GA2"], lt: 77  },
    TX:  { parts: ["TX"],        lt: 77  },
    WF:  { parts: ["WF"],        lt: 115 },
};

function sumParts(r: SummaryRow, parts: string[], suffix: string): number {
    return parts.reduce((acc, p) => {
        const key = `${p}_${suffix}` as keyof SummaryRow;
        return acc + ((r[key] as number) ?? 0);
    }, 0);
}

export type Ship1Row = {
    key: string;
    sku: string;
    factory: string;
    producing: string;
    wh: WhKey;
    lyPeriod: number;
    ly7: number; cy7: number;
    ly28: number; cy28: number;
    ly56: number; cy56: number;
};

export type Ship2Row = {
    key: string;
    sku: string;
    factory: string;
    producing: string;
    wh: WhKey;
    oh: number;
    it: number;
    shipPlan: number;
    daily: number;
    need28d: number;
    shipQty: number;
};

export function computeShipTables(
    rows: SummaryRow[],
    skuMeta: Map<string, { Factory: string; IsOn: string }>,
    logicMode: LogicMode,
    rebalance: boolean = false,
    week1AllocMode: Week1AllocMode = "target_ratio",
): { table1: Ship1Row[]; table2: Ship2Row[] } {
    const table1: Ship1Row[] = [];
    const table2: Ship2Row[] = [];

    for (const r of rows) {
        if (isDrop(r.SKU)) continue;
        const meta = skuMeta.get(r.SKU);
        const factory = meta?.Factory ?? "-";
        const producing = meta?.IsOn === "TRUE" ? "생산" : "-";

        for (const [wh, { parts, lt }] of Object.entries(WH_GROUPS) as [WhKey, { parts: string[]; lt: number }][]) {
            const ly7  = sumParts(r, parts, "LAST_YEAR_1WEEK_SALES_QTY");
            const cy7  = sumParts(r, parts, "CURR_YEAR_1WEEK_SALES_QTY");
            const ly28 = sumParts(r, parts, "LAST_YEAR_1MONTH_SALES_QTY");
            const cy28 = sumParts(r, parts, "CURR_YEAR_1MONTH_SALES_QTY");
            const ly56 = sumParts(r, parts, "LAST_YEAR_2MONTH_SALES_QTY");
            const cy56 = sumParts(r, parts, "CURR_YEAR_2MONTH_SALES_QTY");

            // LY ACTL for this WH group (period actual)
            let lyPeriod = sumParts(r, parts, "LAST_YEAR_ACTL_SALES_QTY");
            if (lyPeriod === 0) lyPeriod = (ly56 / 56) * lt;

            table1.push({ key: `${r.SKU}__${wh}__t1`, sku: r.SKU, factory, producing, wh, lyPeriod: Math.round(lyPeriod), ly7, cy7, ly28, cy28, ly56, cy56 });

            // Ship qty calc
            const growthFactor = weightedGrowthFactor(cy7, ly7, cy28, ly28, cy56, ly56);
            const isNew = isNewProduct(r.SKU, ly7, ly28, ly56, growthFactor, logicMode);

            let daily: number;
            if (isNew) {
                daily = newProductDaily(cy7, cy28, cy56);
            } else {
                // daily = (LY_ACTL * growth) / ACTL_BASE_DAYS
                daily = (lyPeriod * (isFinite(growthFactor) ? growthFactor : 0)) / ACTL_BASE_DAYS;
            }

            const need28d = Math.round(daily * 28);
            const predPeriod = daily * lt;

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            // For CA group, also include CA1_SHIPPLAN_QTY
            const shipPlan = sumParts(r, parts, "SHIPPLAN_QTY") +
                (wh === "CA" ? ((r.CA1_SHIPPLAN_QTY as number) ?? 0) : 0);

            const avail = oh + it + shipPlan;
            const projectedAfterPeriod = avail - predPeriod;
            const rawShip = Math.max(0, need28d - projectedAfterPeriod);
            const shipQty = Math.round(Math.min(rawShip, Math.max(0, need28d)));

            table2.push({ key: `${r.SKU}__${wh}__t2`, sku: r.SKU, factory, producing, wh, oh: Math.round(oh), it: Math.round(it), shipPlan: Math.round(shipPlan), daily: Math.round(daily), need28d, shipQty });
        }
    }

    if (rebalance) {
        applyRebalance(table2, week1AllocMode);
    }

    return { table1, table2 };
}

/** CA/TX/NJ/GA 4개 창고의 선적량을 SKU별로 Target Ratio 기준 재배분한다 (WF는 대상 아님, 그대로 유지). */
function applyRebalance(table2: Ship2Row[], week1AllocMode: Week1AllocMode) {
    const bySku = new Map<string, Ship2Row[]>();
    for (const row of table2) {
        if (!RATIO_WAREHOUSES.includes(row.wh as RatioWh)) continue;
        const list = bySku.get(row.sku);
        if (list) list.push(row);
        else bySku.set(row.sku, [row]);
    }

    for (const rows of bySku.values()) {
        const input = rows.map(r => ({
            wh: r.wh as RatioWh,
            oh: r.oh,
            it: r.it,
            shipPlan: r.shipPlan,
            need28d: r.need28d,
            baseShip: r.shipQty,
        }));
        const rebalanced = rebalanceSku(input, week1AllocMode);
        for (const row of rows) {
            row.shipQty = rebalanced[row.wh as RatioWh];
        }
    }
}
