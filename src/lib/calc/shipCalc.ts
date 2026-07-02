// 선적 계산 (28일 캡, 창고별)
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { rebalanceSku, RATIO_WAREHOUSES, type RatioWh, type Week1AllocMode } from "./rebalance";

// ── Shock Warning (Floor 기반) ──
const SHOCK_MIN_SALES_7D = 3;
const SHOCK_DAYS_COVER = 7;

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
    week2: number;
    week3: number;
    week4: number;
    week5: number;
    rebalanceFlag: string;
    shock: boolean;
};

/** 창고별 Floor 기반 일수요(healthy demand) 계산: 56일(50%)+28일(30%)+7일(20%) 가중, 결측 기간은 재정규화 */
function floorDailyDemand(cy7: number, cy28: number, cy56: number): number {
    const dd56 = cy56 > 0 ? cy56 / 56 : 0;
    const dd28 = cy28 > 0 ? cy28 / 28 : 0;
    const dd7 = cy7 > 0 ? cy7 / 7 : 0;
    const valid = [dd56, dd28, dd7].filter(v => v > 0);
    if (valid.length === 3) return valid[0] * 0.5 + valid[1] * 0.3 + valid[2] * 0.2;
    if (valid.length === 2) return valid[0] * 0.6 + valid[1] * 0.4;
    if (valid.length === 1) return valid[0];
    return 0;
}

/** 다음 4주(2~5주차) 선적량을 롤링 계산한다: 이전 예상재고 + 이전 선적 - 7일 소비. */
function rollMultiWeek(
    baseAvail: number,
    daily: number,
    lt: number,
    need28: number,
    week1Ship: number,
): { week2: number; week3: number; week4: number; week5: number } {
    const weeklyConsumption = daily * 7;
    let prevProjected = Math.max(0, baseAvail - daily * lt);
    let prevShip = week1Ship;
    const weeks: number[] = [];
    for (let i = 0; i < 4; i++) {
        const availThisWeek = prevProjected + prevShip;
        const projectedThisWeek = availThisWeek - weeklyConsumption;
        const shipK = Math.round(Math.min(Math.max(0, need28 - projectedThisWeek), Math.max(0, need28)));
        weeks.push(shipK);
        prevProjected = Math.max(0, projectedThisWeek);
        prevShip = shipK;
    }
    return { week2: weeks[0], week3: weeks[1], week4: weeks[2], week5: weeks[3] };
}

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
                // daily = (LY_ACTL * growth) / lt — LY_ACTL은 창고별 리드타임(lt)만큼의 작년 forward 실적이므로
                // 일수요로 환산하려면 고정 63이 아니라 해당 창고의 lt로 나눠야 한다.
                daily = (lyPeriod * (isFinite(growthFactor) ? growthFactor : 0)) / lt;
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

            const { week2, week3, week4, week5 } = rollMultiWeek(avail, daily, lt, need28d, shipQty);

            // Shock Warning: 창고 수요가 있고 SKU 판매 최소 필터 통과 시, 현재고가 7일치 최종수요보다 적으면 경고
            const floorDd = floorDailyDemand(cy7, cy28, cy56);
            const finalDd = Math.max(cy7 / 7, floorDd);
            const shock = daily > 0 && !(cy7 < SHOCK_MIN_SALES_7D && floorDd <= 0) && oh < SHOCK_DAYS_COVER * finalDd;

            table2.push({
                key: `${r.SKU}__${wh}__t2`, sku: r.SKU, factory, producing, wh,
                oh: Math.round(oh), it: Math.round(it), shipPlan: Math.round(shipPlan),
                daily: Math.round(daily), need28d, shipQty,
                week2, week3, week4, week5,
                rebalanceFlag: "", shock,
            });
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
        const { shipQty, zeroFlag, gapFlag } = rebalanceSku(input, week1AllocMode);
        for (const row of rows) {
            const wh = row.wh as RatioWh;
            row.shipQty = shipQty[wh];
            const isZero = zeroFlag[wh];
            row.rebalanceFlag = isZero && gapFlag ? "🔄 Zero+Gap" : isZero ? "🟦 Zero채움" : gapFlag ? "🟠 Gap조정" : "";

            // 재배분으로 week1(shipQty)이 바뀌었으므로, 그 값을 기준으로 2~5주차도 다시 굴린다.
            const avail = row.oh + row.it + row.shipPlan;
            const lt = WH_GROUPS[wh].lt;
            const { week2, week3, week4, week5 } = rollMultiWeek(avail, row.daily, lt, row.need28d, row.shipQty);
            row.week2 = week2;
            row.week3 = week3;
            row.week4 = week4;
            row.week5 = week5;
        }
    }
}
