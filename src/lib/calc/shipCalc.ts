// 선적 계산 (28일 캡, 창고별)
import type { SummaryRow } from "@/app/api/salessummary/route";
import { weightedGrowthFactor, newProductDaily, isNewProduct, isDrop, medianTrend, type LogicMode, type TrendMedianWindow } from "./logicMode";
import { rebalanceSku, RATIO_WAREHOUSES, type RatioWh, type Week1AllocMode, type ActualRatio } from "./rebalance";
import { isWhOn } from "./skuRules";
import { runShipWeeks, LOW_VOLUME_MIN_QTY, type ShipCtx, type CapacityTable, type CapReportRow } from "./capacity";

/** default_manual 모드 선적 추세 계산용: SKU+창고별 작년 오늘 -30일~+150일 6구간(30일씩) 판매 중위값. */
export type TrendMedianByWhMap = Record<string, Partial<Record<RatioWh, TrendMedianWindow>>>;

// ── Shock Warning (Floor 기반) ──
const SHOCK_MIN_SALES_7D = 3;
const SHOCK_DAYS_COVER = 7;
const fixed42daysSKU = ["CHA-MS-CPS-BK", "CHA-MS-M28-BK", "CHA-MS-M28-PK", "CHA-MS-M28-IV", 
                        "CHA-MS-DBS-BK", "CHA-MS-NEC-BK", "CHA-MS-NEC-PK", "CHA-MS-NEC-IV"]


export type WhKey = "CA" | "NJ" | "GA" | "TX" | "WF";

export const WH_GROUPS: Record<WhKey, { parts: string[]; lt: number }> = {
    CA:  { parts: ["CA", "CA2", "CA3"], lt: 72  },
    NJ:  { parts: ["NJ"],        lt: 92  },
    GA:  { parts: ["GA", "GA2", "SC"], lt: 92  },
    TX:  { parts: ["TX"],        lt: 92  },
    WF:  { parts: ["WF"],        lt: 115 },
};

/** SKU별 매뉴얼 예측치. YEAR_MONTH("YYYYMM") -> FRCST_STOCK(그 달 총 예측수량). */
export type ForecastMap = Record<string, Record<string, number>>;

/** 오늘(America/Los_Angeles, PST/PDT 자동 적용) 자정 기준 Date. Manual 모드 기준일로 쓴다.
 *  isPO=true(발주 계산)면 순수 PST 기준일 그대로, false(선적 계산, 기본값)면 21일을 더한다
 *  — 생산계획은 2주뒤의것, 생산계획 준 후에 또 1주 해서 21일 더하기. */
export function getManualReferenceDate(isPO: boolean = false, baseDate?: Date): Date {
    // baseDate: 과거 스냅샷 기준으로 계산할 때 그 스냅샷 날짜(없으면 오늘 PST)
    const pstNow = baseDate
        ? new Date(baseDate)
        : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    pstNow.setHours(0, 0, 0, 0);
    if (!isPO) pstNow.setDate(pstNow.getDate() + 21);
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
export function manualTargetYm(lt: number, isPO: boolean = false, baseDate?: Date): string {
    return ymFromDate(addDays(getManualReferenceDate(isPO, baseDate), lt));
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
    isPO: boolean = false,
    baseDate?: Date,
): number | null {
    if (!RATIO_WAREHOUSES.includes(wh as RatioWh)) return null; // WF 제외

    const targetYm = manualTargetYm(lt, isPO, baseDate);
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
    /** 이 창고 기준 작년 오늘 -30~+150일 6구간(30일씩) 판매 중위값. RATIO_WAREHOUSES(CA/TX/NJ/GA) 대상 외(WF)는 undefined. */
    trendWindow: TrendMedianWindow | undefined;
    /** trendWindow로부터 구한 인접 구간 비율 5개(추세1~5). */
    trendRatios: [number, number, number, number, number];
    ly7: number; cy7: number;
    cy28: number;
    cy56: number;
    /** 품절일 제외 일판매 평균 (창고그룹 합) */
    a7: number; a28: number; a56: number;
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
    /** 리드타임 동안 예상 소요량. default_manual(매뉴얼 없음)은 구간별 추세 합산, 그 외는 일판매량 × 리드타임. */
    predPeriod: number;
    shipQty: number;
    week2: number;
    week3: number;
    week4: number;
    week5: number;
    rebalanceFlag: string;
    shock: boolean;
    /** SKU의 84일 실제 출고 비율 중 이 창고 몫 (합계=1, RATIO_WAREHOUSES 대상 외에는 null) */
    actualRatio: number | null;
    /** (현재고+이동중재고+생산계획수량)/1일 예상판매량 = 재고소진일수(DSI). 일 예상판매량이 0이면 소진 걱정이 없으므로 null. */
    dsiDays: number | null;
    /**
     * DSI를 창고 리드타임(lt) 기준으로 나눈 재고 상태. red=lt 미만(품절위험), yellow=lt~lt+28일, green=lt+28일 이상.
     * 현재고·이동중재고·일 예상판매량이 전부 0(관리할 게 아무것도 없는 죽은 SKU/창고 조합)이면 태그 없이 null.
     */
    dsiStatus: "red" | "yellow" | "green" | null;
    /** 기준판매량 중앙값 식 (0.7×7일 + 0.2×28일 + 0.1×56일 중앙값) */
    medianDaily: number;
    /** 기준판매량 평균값 식 (같은 가중치, 품절일 제외 평균) */
    avgDaily: number;
    /** 7일 중앙값이 0이고 평균값 식이 더 커서 평균값 식을 쓴 창고 */
    avgWins: boolean;
    /** 7일 중앙값 0인 소량 창고 → 보유 목표 최소 50개 */
    lowVolume: boolean;
    /** 1~5주차 캐파 줄임 단계 설명 ("" = 안 줄임) */
    capLabels: string[];
    /** 이 행의 공장이 캐파로 줄어든 주가 있음 → 엑셀 수식 대신 값으로 내보낸다 */
    capAdjusted: boolean;
};

/** 창고별 Floor 기반 일수요(healthy demand) 계산: 56일(50%)+28일(30%)+7일(20%) 가중, 결측 기간은 재정규화.
 *  cy7/cy28/cy56은 이제 구간 합계가 아니라 일별 판매량의 중위값으로 들어오므로 일수로 나누지 않는다. */
/** default_manual 모드에서 일판매량·리드타임 소요량에 곱하는 추세 배수의 상한(2 = 200%). */
export const TREND_MAX = 2;

function floorDailyDemand(cy7: number, cy28: number, cy56: number): number {
    const dd56 = cy56 > 0 ? cy56 : 0;
    const dd28 = cy28 > 0 ? cy28 : 0;
    const dd7 = cy7 > 0 ? cy7 : 0;
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
    predPeriod: number,
    need28: number,
    week1Ship: number,
    capEnabled: boolean = true,
): { week2: number; week3: number; week4: number; week5: number } {
    const weeklyConsumption = daily * 7;
    let prevProjected = Math.max(0, baseAvail - predPeriod);
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
    trendMediansByWh: TrendMedianByWhMap = {},
    /** 과거 스냅샷 기준 계산 시 그 스냅샷 날짜(매뉴얼 예측 YM 기준일). 없으면 오늘 PST. */
    baseDate?: Date,
    /** 공장별 주간 캐파 상한 (사이드바 입력). enabled=false거나 없으면 기존과 같다. */
    capOptions?: { enabled: boolean; capacity: CapacityTable },
): { table1: Ship1Row[]; table2: Ship2Row[]; capReport: CapReportRow[]; capSkippedByRebalance: boolean } {
    const table1: Ship1Row[] = [];
    const table2: Ship2Row[] = [];
    // table2와 같은 순서로 쌓는다 (runShipWeeks 결과를 table2[i]에 그대로 넣음).
    const shipCtxs: { ctx: ShipCtx; factory: string }[] = [];

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

            // 이 창고 기준 작년 오늘 -30~+150일 6구간 중위값에서 나온 추세1~5(표시용, Table1). WF는
            // RATIO_WAREHOUSES 대상이 아니라 창고별 추세 데이터가 없으므로 undefined로 넘어간다.
            const whWindow = RATIO_WAREHOUSES.includes(wh as RatioWh) ? trendMediansByWh[r.SKU]?.[wh as RatioWh] : undefined;
            const { ratios: trendRatios } = medianTrend(whWindow);


            // Ship qty calc
            const growthFactor = weightedGrowthFactor(cy7, ly7, cy28, ly28, cy56, ly56);
            const isNew = isNewProduct(r.SKU, ly7, ly28, ly56, growthFactor, logicMode);

            // 기준판매량(제안 2): 창고 7일 중앙값이 0이면 중앙값 식과 평균값 식 중 큰 값, 아니면 중앙값 식 그대로.
            // 평균은 품절일 제외 일판매 평균(RPA 20261125PM부터). 옛 스냅샷은 평균이 0이라 기존과 같다.
            const a7  = sumParts(r, parts, "CURR_YEAR_1WEEK_SALES_AVG");
            const a28 = sumParts(r, parts, "CURR_YEAR_1MONTH_SALES_AVG");
            const a56 = sumParts(r, parts, "CURR_YEAR_2MONTH_SALES_AVG");
            const medianDaily = newProductDaily(cy7, cy28, cy56);
            const avgDaily = newProductDaily(a7, a28, a56);
            const useAvgRule = cy7 === 0;
            const baseDaily = useAvgRule ? Math.max(medianDaily, avgDaily) : medianDaily;
            const avgWins = useAvgRule && avgDaily > medianDaily;
            // 제안 3: 평균 기준을 쓰는 창고(7일 중앙값 0) 중 56일 안에 판매가 있는 곳은 최소 50개 보유.
            // 판매가 아예 없는 창고까지 50개씩 보내지 않도록 baseDaily > 0 조건을 둔다.
            const isLow = useAvgRule && baseDaily > 0;

            table1.push({ key: `${r.SKU}__${wh}__t1`, sku: r.SKU, factory, producing, wh, trendWindow: whWindow, trendRatios, ly7, cy7, cy28, cy56,
                a7: Math.round(a7 * 100) / 100, a28: Math.round(a28 * 100) / 100, a56: Math.round(a56 * 100) / 100 });

            let daily: number;
            // default_manual 모드의 리드타임 소요량(구간별 추세 합산). 다른 모드는 null → 일판매량 × lt.
            let trendPredPeriod: number | null = null;
            let trendCtx: ShipCtx["trend"] = null;
            if (logicMode === "default_manual") {
                // 1일치 예상출고량 추세: 이 창고의 리드타임(lt)이 속한 30일 구간의 추세부터 캐스케이드로
                // 아래 구간까지 시도한다 — 추세N은 [(N-1)*30, N*30)일 구간을 나타내므로 lt가 속한 구간은
                // floor(lt/30)+1번째(=ratios 인덱스 floor(lt/30))다. 예: lt=72(60~90일)면 추세3부터,
                // lt=92(90~120일)면 추세4부터. 그 구간이 100%(=1.0) 이상이면 그대로 쓰고, 미만이면 한 단계
                // 아래 구간을 시도한다. 전부 100% 미만(추세 없음/하락)이면 보정 없이 baseDaily 그대로 보여준다.
                const startIdx = Math.min(trendRatios.length - 1, Math.floor(lt / 30));
                let shipTrend = 1;
                for (let i = startIdx; i >= 0; i--) {
                    if (trendRatios[i] >= 1) { shipTrend = trendRatios[i]; break; }
                }
                // 추세 배수 상한: 최대 2배(200%)까지만 곱한다.
                shipTrend = Math.min(TREND_MAX, shipTrend);
                daily = baseDaily * shipTrend;

                // 리드타임 소요량: 리드타임을 30일 구간으로 나눠 구간마다 그 구간 추세를 곱해서 더한다(누적 곱 아님).
                // 예) lt=72 → 기본×추세1×30 + 기본×추세2×30 + 기본×추세3×12,
                //     lt=92 → 기본×추세1×30 + 기본×추세2×30 + 기본×추세3×30 + 기본×추세4×2.
                // 추세가 1 미만(하락)인 구간은 1로, 2 초과인 구간은 2로 본다.
                trendPredPeriod = 0;
                const segments: { days: number; t: number }[] = [];
                for (let i = 0; i * 30 < lt; i++) {
                    const days = Math.min(30, lt - i * 30);
                    const t = trendRatios[Math.min(i, trendRatios.length - 1)];
                    const tc = Math.min(TREND_MAX, Math.max(1, t));
                    segments.push({ days, t: tc });
                    trendPredPeriod += baseDaily * tc * days;
                }
                trendCtx = { baseDaily, shipTrend, segments };
            } else if (isNew) {
                daily = baseDaily;
            } else {
                // daily = (LY_ACTL * growth) / lt — LY_ACTL은 창고별 리드타임(lt)만큼의 작년 forward 실적이므로
                // 일수요로 환산하려면 고정 63이 아니라 해당 창고의 lt로 나눠야 한다.
                daily = (lyPeriod * (isFinite(growthFactor) ? growthFactor : 0)) / lt;
            }

            const manualDaily = (logicMode === "manual" || logicMode === "default_manual")
                ? manualDailyForWh(r.SKU, wh, lt, forecastMap, shipRatio84d, false, baseDate)
                : null;
            // Manual 모드에서 매뉴얼 예측치가 있으면 그걸로 실제 계산을 대체한다 (캡은 Manual 포함 전체 적용).
            const effectiveDaily = manualDaily ?? daily;
            // const usingManual = manualDaily != null; // 현재 미사용 (캡을 Manual 포함 전체 적용으로 바꾸면서), 필요해지면 다시 사용

            const safetyDays = fixed42daysSKU.includes(r.SKU) ? 42 : 28;
            // 소량 SKU는 28일치 대신 최소 50개를 보유 목표로 쓴다(엑셀 I열 = 이 값이라 수식도 그대로 맞는다).
            const need28d = Math.max(Math.round(effectiveDaily * safetyDays), isLow ? LOW_VOLUME_MIN_QTY : 0);
            // 매뉴얼 예측치를 쓰는 경우엔 기존처럼 매뉴얼 일판매량 × 리드타임.
            // 정수로 반올림해서 쓴다 — 화면/엑셀 J열(리드타임 소요량)과 같은 값으로 1~5주차를 계산해야 서로 안 어긋남.
            const predPeriod = Math.round(manualDaily == null && trendPredPeriod != null ? trendPredPeriod : effectiveDaily * lt);

            const oh = sumParts(r, parts, "STOCK");
            const it = sumParts(r, parts, "INTRANSIT_STOCK");
            // For CA group, also include CA1_PRODUCTION_PLAN_QTY
            const shipPlan = sumParts(r, parts, "PRODUCTION_PLAN_QTY") +
                (wh === "CA" ? ((r.CA1_PRODUCTION_PLAN_QTY as number) ?? 0) : 0);

            // 화면/엑셀에 찍히는 값(재고는 정수, 1일치는 소수 2자리) 기준으로 계산한다 — 그래야 엑셀 수식으로 다시 계산해도
            // 화면 선적량과 1개도 안 어긋난다.
            const avail = Math.round(oh) + Math.round(it) + Math.round(shipPlan);

            // MAIN_SKU에서 이 창고가 FALSE면 선적하지 않는다 — 1~5주차 전부 0.
            const whOn = isWhOn(r.SKU, wh);

            // 1~5주차 선적량은 아래 runShipWeeks에서 한꺼번에 계산한다(공장별 캐파 상한을 같이 맞추려고).
            // 캐파가 없으면 기존 식(MIN(MAX(0, 28일치 − (가용재고 − 리드타임 소요량)), 28일치) + 롤링)과 같다.
            shipCtxs.push({
                factory,
                ctx: {
                    whOn, avail, lt, safetyDays, isLow,
                    trend: manualDaily == null ? trendCtx : null,
                    flatDaily: effectiveDaily,
                },
            });
            const shipQty = 0, week2 = 0, week3 = 0, week4 = 0, week5 = 0;


            // Shock Warning: 창고 수요가 있고 SKU 판매 최소 필터 통과 시, 현재고가 7일치 최종수요보다 적으면 경고
            const floorDd = floorDailyDemand(cy7, cy28, cy56);
            const finalDd = Math.max(cy7, floorDd);
            const shock = daily > 0 && !(cy7 < SHOCK_MIN_SALES_7D && floorDd <= 0) && oh < SHOCK_DAYS_COVER * finalDd;

            const actualRatio = RATIO_WAREHOUSES.includes(wh as RatioWh)
                ? shipRatio84d[r.SKU]?.[wh as RatioWh] ?? null
                : null;

            // DSI(재고소진일수) = (현재고+이동중재고+생산계획수량) / 1일 예상판매량. 창고 리드타임(lt) 안에
            // 재고가 소진되면 다음 선적분이 도착하기 전에 품절될 위험이 있으므로 red, lt~lt+28일이면 여유가
            // 빠듯하니 yellow, lt+28일 이상이면 안전하니 green으로 표시한다.
            // 현재고·이동중재고·생산계획·판매량이 전부 0인 죽은 조합은 관리 대상이 아니므로 태그를 아예 안 띄운다(null).
            const hasNoActivity = oh <= 0 && it <= 0 && shipPlan <= 0 && effectiveDaily <= 0;
            const dsiDays = effectiveDaily > 0 ? (oh + it + shipPlan) / effectiveDaily : null;
            const dsiStatus: Ship2Row["dsiStatus"] = hasNoActivity ? null :
                dsiDays == null ? "green" :
                dsiDays < lt ? "red" :
                dsiDays < lt + 28 ? "yellow" : "green";

            table2.push({
                key: `${r.SKU}__${wh}__t2`, sku: r.SKU, factory, producing, wh,
                oh: Math.round(oh), it: Math.round(it), shipPlan: Math.round(shipPlan),
                daily: Math.round(daily * 100) / 100,
                manualDaily: manualDaily == null ? null : Math.round(manualDaily * 100) / 100,
                need28d, predPeriod: Math.round(predPeriod), shipQty,
                week2, week3, week4, week5,
                rebalanceFlag: whOn ? "" : "⚫ 창고 OFF", shock, actualRatio,
                dsiDays: dsiDays == null ? null : Math.round(dsiDays * 10) / 10,
                dsiStatus,
                medianDaily: Math.round(medianDaily * 100) / 100,
                avgDaily: Math.round(avgDaily * 100) / 100,
                avgWins,
                lowVolume: isLow,
                capLabels: [],
                capAdjusted: false,
            });
        }
    }

    // 재배분은 창고 사이로 다시 나누면서 주차 합계가 바뀌므로, 재배분이 켜져 있으면 캐파는 적용하지 않는다.
    const capOn = !!capOptions?.enabled && !rebalance;
    const { results, report } = runShipWeeks(shipCtxs, capOn ? capOptions!.capacity : null);
    results.forEach((res, i) => {
        const row = table2[i];
        [row.shipQty, row.week2, row.week3, row.week4, row.week5] = res.ships;
        row.capLabels = res.stepLabels;
        row.capAdjusted = res.adjusted;
        if (res.adjusted) {
            // 캐파로 1주차 계산값이 바뀌었으면 화면 1일치/28일치/리드타임 소요량도 1주차에 쓴 값으로 보여준다.
            // (매뉴얼 행의 1일치는 manualDaily 칸에 그대로 있다.)
            if (row.manualDaily == null) row.daily = res.week1.shownDaily;
            row.need28d = Math.round(res.week1.need);
            row.predPeriod = res.week1.predPeriod;
        }
    });

    if (rebalance) {
        applyRebalance(table2, week1AllocMode, shipRatio84d);
    }

    return { table1, table2, capReport: report, capSkippedByRebalance: !!capOptions?.enabled && rebalance };
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

    for (const [sku, allRows] of bySku.entries()) {
        // MAIN_SKU에서 FALSE인 창고는 재배분에서 아예 뺀다 — 선적량 0 유지, 비율은 남은 창고끼리 다시 맞춤.
        // FALSE 창고의 원래 몫은 남은 창고로 넘기지 않는다(그 창고 수요는 사라진 것으로 봄).
        const rows = allRows.filter(r => isWhOn(sku, r.wh));
        if (rows.length === 0) continue;
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
            //const { week2, week3, week4, week5 } = rollMultiWeek(avail, row.daily, row.predPeriod, row.need28d, row.shipQty, false); // Cap제거
            // 매뉴얼 예측치가 있으면 그 값으로 굴린다(화면 1일치 컬럼과 같은 값).
            const { week2, week3, week4, week5 } = rollMultiWeek(avail, row.manualDaily ?? row.daily, row.predPeriod, row.need28d, row.shipQty); //기존 캡 처리하던 부분
            row.week2 = week2;
            row.week3 = week3;
            row.week4 = week4;
            row.week5 = week5;
        }
    }
}
