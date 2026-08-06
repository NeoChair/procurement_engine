// 선적 계산 (28일 캡, 창고별)
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, type LogicMode } from "./logicMode";
import { rebalanceSku, RATIO_WAREHOUSES, type RatioWh, type Week1AllocMode, type ActualRatio } from "./rebalance";

// ── Shock Warning (Floor 기반) ──
const SHOCK_MIN_SALES_7D = 3;
const SHOCK_DAYS_COVER = 7;
const fixed42daysSKU = ["CHA-MS-CPS-BK", "CHA-MS-M28-BK", "CHA-MS-M28-PK", "CHA-MS-M28-IV", 
                        "CHA-MS-DBS-BK", "CHA-MS-NEC-BK", "CHA-MS-NEC-PK", "CHA-MS-NEC-IV"]


export type WhKey = "CA" | "NJ" | "GA" | "TX" | "WF";

export const WH_GROUPS: Record<WhKey, { parts: string[]; lt: number }> = {
    CA:  { parts: ["CA", "CA2"], lt: 63  },
    NJ:  { parts: ["NJ"],        lt: 77  },
    GA:  { parts: ["GA", "GA2", "SC"], lt: 77  },
    TX:  { parts: ["TX"],        lt: 77  },
    WF:  { parts: ["WF"],        lt: 115 },
};

/** SKU별 매뉴얼 예측치. YEAR_MONTH("YYYYMM") -> FRCST_STOCK(그 달 총 예측수량). */
export type ForecastMap = Record<string, Record<string, number>>;

/** 오늘(America/Los_Angeles, PST/PDT 자동 적용) 자정 기준 Date. Manual 모드 기준일로 쓴다. */
export function getManualReferenceDate(): Date {
    const pstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    pstNow.setHours(0, 0, 0, 0);
    return pstNow;
    //return new Date(2026, 9, 23);
}

function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
}

function ymFromDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
}

/** Manual 모드에서 기준일(오늘 PST/PDT) + 리드타임(lt)이 실제로 가리키는 YM("YYYYMM"). 사이드바 안내 표시용. */
export function manualTargetYm(lt: number): string {
    return ymFromDate(addDays(getManualReferenceDate(), lt));
}

/**
 * 매뉴얼 계산모드에서 쓸 창고별 일 예상판매량. WF는 실출고비율(RATIO_WAREHOUSES) 대상이 아니므로 항상 null(미적용).
 * 기준일 + 창고 리드타임(lt)이 속한 월의 SKU 매뉴얼 예측치(FRCST_STOCK)를 그 창고의 84일 실출고비율만큼
 * 떼어낸 값을 그대로 쓴다(일수로 나누지 않음) — 월말 몰림 등으로 실제 하루 소진량이 균등하지 않기 때문에,
 * 평균 일량으로 스무딩하지 말고 입력값을 그대로 반영하기로 함. 예측치나 실출고비율이 없으면 null(기존 엔진값으로 폴백).
 */
export function manualDailyForWh(
    sku: string,
    wh: WhKey,
    lt: number,
    forecastMap: ForecastMap,
    shipRatio84d: Record<string, ActualRatio>,
): number | null {
    if (!RATIO_WAREHOUSES.includes(wh as RatioWh)) return null; // WF 제외

    const targetYm = manualTargetYm(lt);
    const frcstQty = forecastMap[sku]?.[targetYm];
    const ratio = shipRatio84d[sku]?.[wh as RatioWh];
    if (frcstQty == null || ratio == null) return null;

    return frcstQty * ratio;
}

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
    /** Manual 계산모드에서 매뉴얼 예측치 기반으로 환산한 일 예상판매량. 해당 창고/SKU에 매뉴얼 데이터가 없으면 null(daily로 폴백). */
    manualDaily: number | null;
    need28d: number;
    shipQty: number;
    week2: number;
    week3: number;
    week4: number;
    week5: number;
    rebalanceFlag: string;
    shock: boolean;
    /** SKU의 84일 실제 출고 비율 중 이 창고 몫 (합계=1, RATIO_WAREHOUSES 대상 외에는 null) */
    actualRatio: number | null;
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

/**
 * 다음 4주(2~5주차) 선적량을 롤링 계산한다: 이전 예상재고 + 이전 선적 - 7일 소비.
 * capEnabled=false면 need28 캡을 씌우지 않고 raw 부족분을 그대로 선적량으로 쓴다(Manual 모드용).
 */
function rollMultiWeek(
    baseAvail: number,
    daily: number,
    lt: number,
    need28: number,
    week1Ship: number,
    capEnabled: boolean = true,
): { week2: number; week3: number; week4: number; week5: number } {
    const weeklyConsumption = daily * 7;
    let prevProjected = Math.max(0, baseAvail - daily * lt);
    let prevShip = week1Ship;
    const weeks: number[] = [];
    for (let i = 0; i < 4; i++) {
        const availThisWeek = prevProjected + prevShip;
        const projectedThisWeek = availThisWeek - weeklyConsumption;
        const rawWeek = Math.max(0, need28 - projectedThisWeek);
        const shipK = Math.round(capEnabled ? Math.min(rawWeek, Math.max(0, need28)) : rawWeek);
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
    shipRatio84d: Record<string, ActualRatio> = {},
    forecastMap: ForecastMap = {},
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

            const manualDaily = logicMode === "manual"
                ? manualDailyForWh(r.SKU, wh, lt, forecastMap, shipRatio84d)
                : null;
            // Manual 모드에서 매뉴얼 예측치가 있으면 그걸로 실제 계산을 대체하고, need28d 캡도 없앤다
            // (사람이 직접 입력한 값이니 자동 엔진의 안전 상한을 적용하지 않고 raw 부족분을 그대로 반영).
            const effectiveDaily = manualDaily ?? daily;
            const usingManual = manualDaily != null;

            const safetyDays = fixed42daysSKU.includes(r.SKU) ? 42 : 28;
            const need28d = Math.round(effectiveDaily * safetyDays);
            const predPeriod = effectiveDaily * lt;

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            // For CA group, also include CA1_SHIPPLAN_QTY
            const shipPlan = sumParts(r, parts, "SHIPPLAN_QTY") +
                (wh === "CA" ? ((r.CA1_SHIPPLAN_QTY as number) ?? 0) : 0);

            const avail = oh + it + shipPlan;
            const projectedAfterPeriod = avail - predPeriod;
            const rawShip = Math.max(0, need28d - projectedAfterPeriod);
            
            // cap처리하는 부분 
            // const shipQty = usingManual
            //     ? Math.round(rawShip)
            //     : Math.round(Math.min(rawShip, Math.max(0, need28d)));
            // const { week2, week3, week4, week5 } = rollMultiWeek(avail, effectiveDaily, lt, need28d, shipQty, !usingManual);
            
            const shipQty = Math.round(rawShip); // 모든 모드에 캡 제거
            const { week2, week3, week4, week5 } = rollMultiWeek(avail, effectiveDaily, lt, need28d, shipQty, false); // 여기도 모든 모두 캡 제거
            

            // Shock Warning: 창고 수요가 있고 SKU 판매 최소 필터 통과 시, 현재고가 7일치 최종수요보다 적으면 경고
            const floorDd = floorDailyDemand(cy7, cy28, cy56);
            const finalDd = Math.max(cy7 / 7, floorDd);
            const shock = daily > 0 && !(cy7 < SHOCK_MIN_SALES_7D && floorDd <= 0) && oh < SHOCK_DAYS_COVER * finalDd;

            const actualRatio = RATIO_WAREHOUSES.includes(wh as RatioWh)
                ? shipRatio84d[r.SKU]?.[wh as RatioWh] ?? null
                : null;

            table2.push({
                key: `${r.SKU}__${wh}__t2`, sku: r.SKU, factory, producing, wh,
                oh: Math.round(oh), it: Math.round(it), shipPlan: Math.round(shipPlan),
                daily: Math.round(daily * 100) / 100,
                manualDaily: manualDaily == null ? null : Math.round(manualDaily * 100) / 100,
                need28d, shipQty,
                week2, week3, week4, week5,
                rebalanceFlag: "", shock, actualRatio,
            });
        }
    }

    if (rebalance) {
        applyRebalance(table2, week1AllocMode, shipRatio84d);
    }

    return { table1, table2 };
}

/** CA/TX/NJ/GA 4개 창고의 선적량을 SKU별로 Target/Actual Ratio 기준 재배분한다 (WF는 대상 아님, 그대로 유지). */
function applyRebalance(
    table2: Ship2Row[],
    week1AllocMode: Week1AllocMode,
    shipRatio84d: Record<string, ActualRatio>,
) {
    const bySku = new Map<string, Ship2Row[]>();
    for (const row of table2) {
        if (!RATIO_WAREHOUSES.includes(row.wh as RatioWh)) continue;
        const list = bySku.get(row.sku);
        if (list) list.push(row);
        else bySku.set(row.sku, [row]);
    }

    for (const [sku, rows] of bySku.entries()) {
        const input = rows.map(r => ({
            wh: r.wh as RatioWh,
            oh: r.oh,
            it: r.it,
            shipPlan: r.shipPlan,
            need28d: r.need28d,
            baseShip: r.shipQty,
        }));
        const { shipQty, zeroFlag, gapFlag, noDataFlag } = rebalanceSku(input, week1AllocMode, shipRatio84d[sku]);
        for (const row of rows) {
            const wh = row.wh as RatioWh;
            row.shipQty = shipQty[wh];
            const isZero = zeroFlag[wh];
            row.rebalanceFlag = noDataFlag ? "⛔ 84일 실적없음→0" : isZero && gapFlag ? "🔄 Zero+Gap" : isZero ? "🟦 Zero채움" : gapFlag ? "🟠 Gap조정" : "";

            // 재배분으로 week1(shipQty)이 바뀌었으므로, 그 값을 기준으로 2~5주차도 다시 굴린다.
            const avail = row.oh + row.it + row.shipPlan;
            const lt = WH_GROUPS[wh].lt;
            const { week2, week3, week4, week5 } = rollMultiWeek(avail, row.daily, lt, row.need28d, row.shipQty, false); // Cap제거
            // const { week2, week3, week4, week5 } = rollMultiWeek(avail, row.daily, lt, row.need28d, row.shipQty); //기존 캡 처리하던 부분
            row.week2 = week2;
            row.week3 = week3;
            row.week4 = week4;
            row.week5 = week5;
        }
    }
}
