import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { RATIO_WAREHOUSES, type RatioWh } from "@/lib/calc/rebalance";
import { isHiddenSku } from "@/lib/calc/logicMode";

export interface SummaryRow {
    OWNR_ETP_CD: string;
    SKU: string;
    GATH_DE: string | null;
    GATH_DT: string | null;

    CA_STOCK: number;
    CA2_STOCK: number;
    CA3_STOCK: number;
    GA_STOCK: number;
    GA2_STOCK: number;
    NJ_STOCK: number;
    SC_STOCK: number;
    TX_STOCK: number;
    WF_STOCK: number;
    TOTAL_STOCK: number;

    CA_INTRANSIT_STOCK: number;
    CA2_INTRANSIT_STOCK: number;
    CA3_INTRANSIT_STOCK: number;
    GA_INTRANSIT_STOCK: number;
    GA2_INTRANSIT_STOCK: number;
    NJ_INTRANSIT_STOCK: number;
    SC_INTRANSIT_STOCK: number;
    TX_INTRANSIT_STOCK: number;
    WF_INTRANSIT_STOCK: number;
    TOTAL_INTRANSIT_STOCK: number;

    CA_CURR_YEAR_1WEEK_SALES_QTY: number;
    CA2_CURR_YEAR_1WEEK_SALES_QTY: number;
    CA3_CURR_YEAR_1WEEK_SALES_QTY: number;
    GA_CURR_YEAR_1WEEK_SALES_QTY: number;
    GA2_CURR_YEAR_1WEEK_SALES_QTY: number;
    NJ_CURR_YEAR_1WEEK_SALES_QTY: number;
    SC_CURR_YEAR_1WEEK_SALES_QTY: number;
    TX_CURR_YEAR_1WEEK_SALES_QTY: number;
    WF_CURR_YEAR_1WEEK_SALES_QTY: number;
    CURR_YEAR_1WEEK_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_1WEEK_SALES_QTY: number;
    CA2_LAST_YEAR_1WEEK_SALES_QTY: number;
    CA3_LAST_YEAR_1WEEK_SALES_QTY: number;
    GA_LAST_YEAR_1WEEK_SALES_QTY: number;
    GA2_LAST_YEAR_1WEEK_SALES_QTY: number;
    NJ_LAST_YEAR_1WEEK_SALES_QTY: number;
    SC_LAST_YEAR_1WEEK_SALES_QTY: number;
    TX_LAST_YEAR_1WEEK_SALES_QTY: number;
    WF_LAST_YEAR_1WEEK_SALES_QTY: number;
    LAST_YEAR_1WEEK_TOTAL_SALES_QTY: number;

    CA_CURR_YEAR_1MONTH_SALES_QTY: number;
    CA2_CURR_YEAR_1MONTH_SALES_QTY: number;
    CA3_CURR_YEAR_1MONTH_SALES_QTY: number;
    GA_CURR_YEAR_1MONTH_SALES_QTY: number;
    GA2_CURR_YEAR_1MONTH_SALES_QTY: number;
    NJ_CURR_YEAR_1MONTH_SALES_QTY: number;
    SC_CURR_YEAR_1MONTH_SALES_QTY: number;
    TX_CURR_YEAR_1MONTH_SALES_QTY: number;
    WF_CURR_YEAR_1MONTH_SALES_QTY: number;
    CURR_YEAR_1MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_1MONTH_SALES_QTY: number;
    CA2_LAST_YEAR_1MONTH_SALES_QTY: number;
    CA3_LAST_YEAR_1MONTH_SALES_QTY: number;
    GA_LAST_YEAR_1MONTH_SALES_QTY: number;
    GA2_LAST_YEAR_1MONTH_SALES_QTY: number;
    NJ_LAST_YEAR_1MONTH_SALES_QTY: number;
    SC_LAST_YEAR_1MONTH_SALES_QTY: number;
    TX_LAST_YEAR_1MONTH_SALES_QTY: number;
    WF_LAST_YEAR_1MONTH_SALES_QTY: number;
    LAST_YEAR_1MONTH_TOTAL_SALES_QTY: number;

    CA_CURR_YEAR_2MONTH_SALES_QTY: number;
    CA2_CURR_YEAR_2MONTH_SALES_QTY: number;
    CA3_CURR_YEAR_2MONTH_SALES_QTY: number;
    GA_CURR_YEAR_2MONTH_SALES_QTY: number;
    GA2_CURR_YEAR_2MONTH_SALES_QTY: number;
    NJ_CURR_YEAR_2MONTH_SALES_QTY: number;
    SC_CURR_YEAR_2MONTH_SALES_QTY: number;
    TX_CURR_YEAR_2MONTH_SALES_QTY: number;
    WF_CURR_YEAR_2MONTH_SALES_QTY: number;
    CURR_YEAR_2MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_2MONTH_SALES_QTY: number;
    CA2_LAST_YEAR_2MONTH_SALES_QTY: number;
    CA3_LAST_YEAR_2MONTH_SALES_QTY: number;
    GA_LAST_YEAR_2MONTH_SALES_QTY: number;
    GA2_LAST_YEAR_2MONTH_SALES_QTY: number;
    NJ_LAST_YEAR_2MONTH_SALES_QTY: number;
    SC_LAST_YEAR_2MONTH_SALES_QTY: number;
    TX_LAST_YEAR_2MONTH_SALES_QTY: number;
    WF_LAST_YEAR_2MONTH_SALES_QTY: number;
    LAST_YEAR_2MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_ACTL_SALES_QTY: number;
    CA2_LAST_YEAR_ACTL_SALES_QTY: number;
    CA3_LAST_YEAR_ACTL_SALES_QTY: number;
    GA_LAST_YEAR_ACTL_SALES_QTY: number;
    GA2_LAST_YEAR_ACTL_SALES_QTY: number;
    NJ_LAST_YEAR_ACTL_SALES_QTY: number;
    SC_LAST_YEAR_ACTL_SALES_QTY: number;
    TX_LAST_YEAR_ACTL_SALES_QTY: number;
    WF_LAST_YEAR_ACTL_SALES_QTY: number;
    LAST_YEAR_ACTL_SALES_QTY: number;

    // 품절일 제외 일판매 평균 (소수 2자리). 옛 스냅샷은 0.
    CA_CURR_YEAR_1WEEK_SALES_AVG: number;
    CA2_CURR_YEAR_1WEEK_SALES_AVG: number;
    CA3_CURR_YEAR_1WEEK_SALES_AVG: number;
    GA_CURR_YEAR_1WEEK_SALES_AVG: number;
    GA2_CURR_YEAR_1WEEK_SALES_AVG: number;
    NJ_CURR_YEAR_1WEEK_SALES_AVG: number;
    SC_CURR_YEAR_1WEEK_SALES_AVG: number;
    TX_CURR_YEAR_1WEEK_SALES_AVG: number;
    WF_CURR_YEAR_1WEEK_SALES_AVG: number;
    CURR_YEAR_1WEEK_TOTAL_SALES_AVG: number;

    CA_CURR_YEAR_1MONTH_SALES_AVG: number;
    CA2_CURR_YEAR_1MONTH_SALES_AVG: number;
    CA3_CURR_YEAR_1MONTH_SALES_AVG: number;
    GA_CURR_YEAR_1MONTH_SALES_AVG: number;
    GA2_CURR_YEAR_1MONTH_SALES_AVG: number;
    NJ_CURR_YEAR_1MONTH_SALES_AVG: number;
    SC_CURR_YEAR_1MONTH_SALES_AVG: number;
    TX_CURR_YEAR_1MONTH_SALES_AVG: number;
    WF_CURR_YEAR_1MONTH_SALES_AVG: number;
    CURR_YEAR_1MONTH_TOTAL_SALES_AVG: number;

    CA_CURR_YEAR_2MONTH_SALES_AVG: number;
    CA2_CURR_YEAR_2MONTH_SALES_AVG: number;
    CA3_CURR_YEAR_2MONTH_SALES_AVG: number;
    GA_CURR_YEAR_2MONTH_SALES_AVG: number;
    GA2_CURR_YEAR_2MONTH_SALES_AVG: number;
    NJ_CURR_YEAR_2MONTH_SALES_AVG: number;
    SC_CURR_YEAR_2MONTH_SALES_AVG: number;
    TX_CURR_YEAR_2MONTH_SALES_AVG: number;
    WF_CURR_YEAR_2MONTH_SALES_AVG: number;
    CURR_YEAR_2MONTH_TOTAL_SALES_AVG: number;

    CA1_PRODUCTION_PLAN_QTY: number;
    CA_PRODUCTION_PLAN_QTY: number;
    CA2_PRODUCTION_PLAN_QTY: number;
    CA3_PRODUCTION_PLAN_QTY: number;
    GA_PRODUCTION_PLAN_QTY: number;
    GA2_PRODUCTION_PLAN_QTY: number;
    NJ_PRODUCTION_PLAN_QTY: number;
    SC_PRODUCTION_PLAN_QTY: number;
    TX_PRODUCTION_PLAN_QTY: number;
    WF_PRODUCTION_PLAN_QTY: number;
    WF_CAN_PRODUCTION_PLAN_QTY: number;
}

/**
 * SKU별 실제 CA/TX/NJ/GA 창고 출고 비율 (합계 = 1).
 * 4개 창고 모두 재고가 있던 날(clean day)만 최근부터 최대 84일 모아서 계산한다.
 * 한 창고가 OOS면 그 창고 주문이 다른 창고(주로 GA)로 넘어가 비율이 왜곡되기 때문.
 */
export type ShipRatio84d = {
    CA: number;
    TX: number;
    NJ: number;
    GA: number;
};

/** clean day로 모을 최대 일수 */
const CLEAN_MAX_DAYS = 84;
/** 이 수량 미만이면 재고 없음으로 본다 (재고가 적으면 주문이 이미 다른 창고로 넘어감) */
const CLEAN_MIN_STOCK = 30;
/** 이 날짜 이전은 창고 라우팅이 달라서 쓰지 않는다 */
const CLEAN_START_DATE = "2026-04-01";

type WhShipRow = {
    SKU: string;
    CA_QTY: number;
    TX_QTY: number;
    NJ_QTY: number;
    GA_QTY: number;
};

//출고 비율 쿼리 (clean day가 하나도 없는 SKU용 기존 84일 단순 비율)
const WH_SHIP_84D_QUERY = `
    SELECT
        pg.INVT_SKU AS SKU,
        SUM(CASE WHEN o.WAREHOUSE IN ('14630', '14631', '24374') THEN o.QTY ELSE 0 END) AS CA_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14636' THEN o.QTY ELSE 0 END) AS TX_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14634' THEN o.QTY ELSE 0 END) AS NJ_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14632', '14633', '14635') THEN o.QTY ELSE 0 END) AS GA_QTY
    FROM [HGBC].[SD].[TB_ORD_DAIL] o
    JOIN (SELECT DISTINCT ITM_ID, INVT_SKU FROM [HGBC].[SD].[TB_PROD_GROUP]) pg ON o.ITM_ID = pg.ITM_ID
    WHERE o.ORD_DE >= @cutoffDate AND o.ORD_DE < @endDate
      AND pg.INVT_SKU <> ''
      AND o.WAREHOUSE IN ('14630', '14631', '14632', '14633', '14634', '14635', '14636', '24374')
      AND o.STOR_CD NOT IN ('447628', '1024339', '1031234', '274607')
      AND o.ORD_STAT_CD != 'Cancelled'
    GROUP BY pg.INVT_SKU
`;

type WhShipDailyRow = WhShipRow & { D: string };

// SKU+일자별 창고그룹 출고수량 (WH_SHIP_84D_QUERY와 같은 창고코드)
const WH_SHIP_DAILY_QUERY = `
    SELECT
        pg.INVT_SKU AS SKU,
        CONVERT(char(10), CAST(o.ORD_DE AS DATE), 23) AS D,
        SUM(CASE WHEN o.WAREHOUSE IN ('14630', '14631', '24374') THEN o.QTY ELSE 0 END) AS CA_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14636' THEN o.QTY ELSE 0 END) AS TX_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14634' THEN o.QTY ELSE 0 END) AS NJ_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14632', '14633', '14635') THEN o.QTY ELSE 0 END) AS GA_QTY
    FROM [HGBC].[SD].[TB_ORD_DAIL] o
    JOIN (SELECT DISTINCT ITM_ID, INVT_SKU FROM [HGBC].[SD].[TB_PROD_GROUP]) pg ON o.ITM_ID = pg.ITM_ID
    WHERE o.ORD_DE >= @startDate AND o.ORD_DE < @endDate
      AND pg.INVT_SKU <> ''
      AND o.WAREHOUSE IN ('14630', '14631', '14632', '14633', '14634', '14635', '14636', '24374')
      AND o.STOR_CD NOT IN ('447628', '1024339', '1031234', '274607')
      AND o.ORD_STAT_CD != 'Cancelled'
    GROUP BY pg.INVT_SKU, CAST(o.ORD_DE AS DATE)
`;

type WhStockSnapRow = { SKU: string; GATH_DE: string; CA: number; TX: number; NJ: number; GA: number };

// 스냅샷(GATH_DE = 'YYYYMMDDAM/PM')별 SKU 창고그룹 재고
const WH_STOCK_SNAP_QUERY = `
    SELECT
        b.SKU,
        b.GATH_DE,
        SUM(CASE WHEN b.WH_CD IN ('14630', '14631', '24374') THEN b.STOCK ELSE 0 END) AS CA,
        SUM(CASE WHEN b.WH_CD = '14636' THEN b.STOCK ELSE 0 END) AS TX,
        SUM(CASE WHEN b.WH_CD = '14634' THEN b.STOCK ELSE 0 END) AS NJ,
        SUM(CASE WHEN b.WH_CD IN ('14632', '14633', '14635') THEN b.STOCK ELSE 0 END) AS GA
    FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY_BACKUP] b
    WHERE b.WH_CD IN ('14630', '14631', '24374', '14636', '14634', '14632', '14633', '14635')
      AND LEFT(b.GATH_DE, 8) >= @startYmd AND LEFT(b.GATH_DE, 8) < @endYmd
    GROUP BY b.SKU, b.GATH_DE
`;

/** 오늘(PST) 날짜(YYYY-MM-DD). */
function getPstToday(): string {
    const pstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const y = pstNow.getFullYear();
    const m = String(pstNow.getMonth() + 1).padStart(2, "0");
    const d = String(pstNow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** 기준일(refDate, YYYY-MM-DD) 기준 daysAgo일 전 날짜(YYYY-MM-DD). 기준일은 오늘(PST) 또는 선택한 스냅샷 날짜. */
function getDateOnly(refDate: string, daysAgo: number): string {
    const [y, m, d] = refDate.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - daysAgo)).toISOString().slice(0, 10);
}

/** 기준일 기준 daysAgo일 전 00:00:00 문자열. */
function getCutoffDate(refDate: string, daysAgo: number): string {
    return `${getDateOnly(refDate, daysAgo)} 00:00:00`;
}

/** startDaysAgo(더 과거) ~ endDaysAgo(더 최근) 사이 날짜 목록(YYYY-MM-DD), startDaysAgo부터 endDaysAgo+1일까지. */
function dateRange(refDate: string, startDaysAgo: number, endDaysAgo: number): string[] {
    const dates: string[] = [];
    for (let d = startDaysAgo; d > endDaysAgo; d--) dates.push(getDateOnly(refDate, d));
    return dates;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 발주 추세 계산용: 작년 오늘 기준 -30일~+150일(180일)의 SKU별 일자별 판매수량(창고 구분 없이 전체 합산). */
export type TrendMedians = {
    w0: number; // 작년 오늘 -30일 ~ 작년 오늘
    w1: number; // 작년 오늘 ~ +30일
    w2: number; // 작년 오늘 +30일 ~ +60일
    w3: number; // 작년 오늘 +60일 ~ +90일
    w4: number; // 작년 오늘 +90일 ~ +120일
    w5: number; // 작년 오늘 +120일 ~ +150일
};

type DailyQtyByWhRow = { SKU: string; ORD_DATE: Date; CA_QTY: number; TX_QTY: number; NJ_QTY: number; GA_QTY: number };

// 창고 그룹(CA/TX/NJ/GA, 신/구 창고코드 매핑)별로 SKU+일자 판매수량을 낸다.
// 발주 추세(SKU 전체 기준)는 이 네 창고 합계를 다시 더해서 쓰고, 선적 추세(창고별)는 각 컬럼을 그대로 쓴다.
const TREND_DAILY_BY_WH_QUERY = `
    SELECT
        pg.INVT_SKU AS SKU,
        CAST(o.ORD_DE AS DATE) AS ORD_DATE,
        SUM(CASE WHEN o.WAREHOUSE IN ('14630', '14631', '24374', '357016', '7118388') THEN o.QTY ELSE 0 END) AS CA_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14636', '3240230') THEN o.QTY ELSE 0 END) AS TX_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14634', '6585090') THEN o.QTY ELSE 0 END) AS NJ_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14632', '14633', '14635', '2940239', '7259780', '8351661') THEN o.QTY ELSE 0 END) AS GA_QTY
    FROM [HGBC].[SD].[TB_ORD_DAIL] o
    JOIN (SELECT DISTINCT ITM_ID, INVT_SKU FROM [HGBC].[SD].[TB_PROD_GROUP]) pg ON o.ITM_ID = pg.ITM_ID
    WHERE o.ORD_DE >= @startDate AND o.ORD_DE < @endDate
      AND pg.INVT_SKU <> ''
      AND o.WAREHOUSE IN (
        '14630', '14631', '14632', '14633', '14634', '14635', '14636', '24374',
        '357016', '2940239', '3240230', '6585090', '7118388', '7259780', '8351661'
      )
      AND o.STOR_CD NOT IN ('447628', '1024339', '1031234', '274607')
      AND o.ORD_STAT_CD != 'Cancelled'
    GROUP BY pg.INVT_SKU, CAST(o.ORD_DE AS DATE)
`;

const TREND_WINDOW_BOUNDS: { key: keyof TrendMedians; startDaysAgo: number; endDaysAgo: number }[] = [
    { key: "w0", startDaysAgo: 395, endDaysAgo: 365 },
    { key: "w1", startDaysAgo: 365, endDaysAgo: 335 },
    { key: "w2", startDaysAgo: 335, endDaysAgo: 305 },
    { key: "w3", startDaysAgo: 305, endDaysAgo: 275 },
    { key: "w4", startDaysAgo: 275, endDaysAgo: 245 },
    { key: "w5", startDaysAgo: 245, endDaysAgo: 215 },
];

// BACKUP 테이블(SKU × 창고 세로 구조)을 예전 SUMMARY와 같은 가로 컬럼으로 펼친다.
// 창고가 늘면 SUMMARY_WAREHOUSES와 SummaryRow에만 추가하면 된다.
const SUMMARY_WAREHOUSES: { code: string; prefix: string }[] = [
    { code: "14630", prefix: "CA" },
    { code: "14631", prefix: "CA2" },
    { code: "24374", prefix: "CA3" },
    { code: "14632", prefix: "GA" },
    { code: "14633", prefix: "GA2" },
    { code: "14634", prefix: "NJ" },
    { code: "14635", prefix: "SC" },
    { code: "14636", prefix: "TX" },
    { code: "0", prefix: "WF" },
];

// BACKUP 컬럼 → 창고별 컬럼명 / TOTAL 컬럼명
const SUMMARY_METRICS: { src: string; wh: (prefix: string) => string; total: string }[] = [
    { src: "STOCK", wh: (p) => `${p}_STOCK`, total: "TOTAL_STOCK" },
    { src: "INTRANSIT_STOCK", wh: (p) => `${p}_INTRANSIT_STOCK`, total: "TOTAL_INTRANSIT_STOCK" },
    { src: "CURR_YEAR_1WEEK_SALES_QTY", wh: (p) => `${p}_CURR_YEAR_1WEEK_SALES_QTY`, total: "CURR_YEAR_1WEEK_TOTAL_SALES_QTY" },
    { src: "LAST_YEAR_1WEEK_SALES_QTY", wh: (p) => `${p}_LAST_YEAR_1WEEK_SALES_QTY`, total: "LAST_YEAR_1WEEK_TOTAL_SALES_QTY" },
    { src: "CURR_YEAR_1MONTH_SALES_QTY", wh: (p) => `${p}_CURR_YEAR_1MONTH_SALES_QTY`, total: "CURR_YEAR_1MONTH_TOTAL_SALES_QTY" },
    { src: "LAST_YEAR_1MONTH_SALES_QTY", wh: (p) => `${p}_LAST_YEAR_1MONTH_SALES_QTY`, total: "LAST_YEAR_1MONTH_TOTAL_SALES_QTY" },
    { src: "CURR_YEAR_2MONTH_SALES_QTY", wh: (p) => `${p}_CURR_YEAR_2MONTH_SALES_QTY`, total: "CURR_YEAR_2MONTH_TOTAL_SALES_QTY" },
    { src: "LAST_YEAR_2MONTH_SALES_QTY", wh: (p) => `${p}_LAST_YEAR_2MONTH_SALES_QTY`, total: "LAST_YEAR_2MONTH_TOTAL_SALES_QTY" },
    { src: "LAST_YEAR_ACTL_SALES_QTY", wh: (p) => `${p}_LAST_YEAR_ACTL_SALES_QTY`, total: "LAST_YEAR_ACTL_SALES_QTY" },
    // 품절일 제외 일판매 평균(RPA가 20261125PM 스냅샷부터 채움). 그 전 스냅샷은 NULL → 아래 ISNULL로 0
    // → 선적 계산에서 max(중앙값 식, 0)=중앙값 식이라 기존 결과와 같다.
    { src: "CURR_YEAR_1WEEK_SALES_AVG", wh: (p) => `${p}_CURR_YEAR_1WEEK_SALES_AVG`, total: "CURR_YEAR_1WEEK_TOTAL_SALES_AVG" },
    { src: "CURR_YEAR_1MONTH_SALES_AVG", wh: (p) => `${p}_CURR_YEAR_1MONTH_SALES_AVG`, total: "CURR_YEAR_1MONTH_TOTAL_SALES_AVG" },
    { src: "CURR_YEAR_2MONTH_SALES_AVG", wh: (p) => `${p}_CURR_YEAR_2MONTH_SALES_AVG`, total: "CURR_YEAR_2MONTH_TOTAL_SALES_AVG" },
];

const SUMMARY_PIVOT_COLUMNS = SUMMARY_METRICS.flatMap((m) => [
    ...SUMMARY_WAREHOUSES.map((w) => ({ name: m.wh(w.prefix), whCd: w.code, src: m.src })),
    { name: m.total, whCd: "TOTAL", src: m.src },
]);

//SUMMARY QUERY
const SUMMARY_QUERY = `
    WITH latest AS (
        -- @gathDe가 있으면 그 스냅샷, 없으면(NULL) 최신 스냅샷
        SELECT COALESCE(@gathDe, MAX(GATH_DE)) AS GATH_DE FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY_BACKUP]
    ),
    summary AS (
        SELECT
            b.OWNR_ETP_CD,
            b.SKU,
            b.GATH_DE,
            MAX(b.GATH_DT) AS GATH_DT,
${SUMMARY_PIVOT_COLUMNS.map((c) => `            MAX(CASE WHEN b.WH_CD = '${c.whCd}' THEN b.${c.src} END) AS ${c.name}`).join(",\n")}
        FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY_BACKUP] b
        JOIN latest l ON b.GATH_DE = l.GATH_DE
        GROUP BY b.OWNR_ETP_CD, b.SKU, b.GATH_DE
    ),
    plan_qty AS (
        SELECT
            p.ITM_ID AS SKU,
            SUM(CASE WHEN p.WRHS_CD = '14361' THEN p.QTY END) AS CA1_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14630' THEN p.QTY END) AS CA_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14631' THEN p.QTY END) AS CA2_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '24374' THEN p.QTY END) AS CA3_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14632' THEN p.QTY END) AS GA_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14633' THEN p.QTY END) AS GA2_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14634' THEN p.QTY END) AS NJ_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14635' THEN p.QTY END) AS SC_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '14636' THEN p.QTY END) AS TX_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '0'     THEN p.QTY END) AS WF_PRODUCTION_PLAN_QTY,
            SUM(CASE WHEN p.WRHS_CD = '0-CAN' THEN p.QTY END) AS WF_CAN_PRODUCTION_PLAN_QTY
        FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK] p
        JOIN latest l ON p.GATH_DE = l.GATH_DE
        GROUP BY p.ITM_ID
    ),
    all_skus AS (
        SELECT SKU FROM summary

        UNION

        SELECT DISTINCT ITM_ID AS SKU
        FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]
    )
    SELECT
        ISNULL(s.OWNR_ETP_CD, '') AS OWNR_ETP_CD,
        a.SKU,
        s.GATH_DE,
        s.GATH_DT,
${SUMMARY_PIVOT_COLUMNS.map((c) => `        ISNULL(s.${c.name}, 0) AS ${c.name}`).join(",\n")},
        ISNULL(pq.CA1_PRODUCTION_PLAN_QTY, 0) AS CA1_PRODUCTION_PLAN_QTY,
        ISNULL(pq.CA_PRODUCTION_PLAN_QTY,  0) AS CA_PRODUCTION_PLAN_QTY,
        ISNULL(pq.CA2_PRODUCTION_PLAN_QTY, 0) AS CA2_PRODUCTION_PLAN_QTY,
        ISNULL(pq.CA3_PRODUCTION_PLAN_QTY, 0) AS CA3_PRODUCTION_PLAN_QTY,
        ISNULL(pq.GA_PRODUCTION_PLAN_QTY,  0) AS GA_PRODUCTION_PLAN_QTY,
        ISNULL(pq.GA2_PRODUCTION_PLAN_QTY, 0) AS GA2_PRODUCTION_PLAN_QTY,
        ISNULL(pq.NJ_PRODUCTION_PLAN_QTY,  0) AS NJ_PRODUCTION_PLAN_QTY,
        ISNULL(pq.SC_PRODUCTION_PLAN_QTY,  0) AS SC_PRODUCTION_PLAN_QTY,
        ISNULL(pq.TX_PRODUCTION_PLAN_QTY,  0) AS TX_PRODUCTION_PLAN_QTY,
        ISNULL(pq.WF_PRODUCTION_PLAN_QTY,  0) AS WF_PRODUCTION_PLAN_QTY,
        ISNULL(pq.WF_CAN_PRODUCTION_PLAN_QTY, 0) AS WF_CAN_PRODUCTION_PLAN_QTY
    FROM all_skus a
    LEFT JOIN summary s ON a.SKU = s.SKU
    LEFT JOIN plan_qty pq ON a.SKU = pq.SKU
`;

/**
 * ?gathDe=YYYYMMDDAM|PM 이 있으면 그 스냅샷 기준으로 계산한다(사이드바 과거 선적량 조회용).
 * 이때 실 출고비율·추세 중위값도 오늘이 아니라 그 스냅샷 날짜를 기준일로 다시 계산하고,
 * 그 날짜 당일 및 이후 주문은 쓰지 않는다(그날 앱이 알 수 없었던 데이터).
 */
export async function GET(request: NextRequest) {
    try {
        const gathDeParam = request.nextUrl.searchParams.get("gathDe");
        const gathDe = gathDeParam && /^\d{8}(AM|PM)$/.test(gathDeParam) ? gathDeParam : null;
        const refDate = gathDe
            ? `${gathDe.slice(0, 4)}-${gathDe.slice(4, 6)}-${gathDe.slice(6, 8)}`
            : getPstToday();

        const db = await getDb();
        const result = await db
            .request()
            .input("gathDe", sql.VarChar, gathDe)
            .query<SummaryRow>(SUMMARY_QUERY);

        const rows = result.recordset.filter((r) => !isHiddenSku(r.SKU));
        // rows[0]이 TB_SHIPPING_PLAN_STOCK에만 존재하는 SKU면 LEFT JOIN으로 GATH_DT가 NULL이 될 수 있으므로
        // 첫 번째 non-null 값을 찾는다.
        const snapshotDate = rows.find((r) => r.GATH_DT)?.GATH_DT ?? null;

        const whShipResult = await db
            .request()
            .input("cutoffDate", sql.VarChar, getCutoffDate(refDate, 84))
            // 오늘 기준이면 기존처럼 상한 없음, 과거 스냅샷이면 그 날짜 이전 주문만
            .input("endDate", sql.VarChar, gathDe ? `${refDate} 00:00:00` : "9999-12-31 00:00:00")
            .query<WhShipRow>(WH_SHIP_84D_QUERY);

        const toRatio = (q: { CA: number; TX: number; NJ: number; GA: number }): ShipRatio84d | null => {
            const total = q.CA + q.TX + q.NJ + q.GA;
            if (total <= 0) return null;
            return { CA: q.CA / total, TX: q.TX / total, NJ: q.NJ / total, GA: q.GA / total };
        };

        // 기본값: 기존 84일 단순 비율 (clean day가 없는 SKU는 이 값을 그대로 쓴다)
        const shipRatio84d: Record<string, ShipRatio84d> = {};
        for (const r of whShipResult.recordset) {
            const ratio = toRatio({ CA: r.CA_QTY, TX: r.TX_QTY, NJ: r.NJ_QTY, GA: r.GA_QTY });
            if (ratio) shipRatio84d[r.SKU] = ratio;
        }

        // clean day 비율: 날짜의 모든 스냅샷에서 4개 창고 재고가 전부 CLEAN_MIN_STOCK 이상인 날만,
        // 최근부터 최대 CLEAN_MAX_DAYS일 모아 출고 비율을 낸다. 기준일(오늘 PST/스냅샷 날짜)은 주문이 덜 쌓였으므로 제외.
        const today = refDate;
        const [stockSnapResult, whShipDailyResult] = await Promise.all([
            db.request()
                .input("startYmd", sql.VarChar, CLEAN_START_DATE.replace(/-/g, ""))
                .input("endYmd", sql.VarChar, today.replace(/-/g, ""))
                .query<WhStockSnapRow>(WH_STOCK_SNAP_QUERY),
            db.request()
                .input("startDate", sql.VarChar, `${CLEAN_START_DATE} 00:00:00`)
                .input("endDate", sql.VarChar, `${today} 00:00:00`)
                .query<WhShipDailyRow>(WH_SHIP_DAILY_QUERY),
        ]);

        const cleanBySku = new Map<string, Map<string, boolean>>(); // SKU → 날짜 → clean 여부
        for (const r of stockSnapResult.recordset) {
            const d = `${r.GATH_DE.slice(0, 4)}-${r.GATH_DE.slice(4, 6)}-${r.GATH_DE.slice(6, 8)}`;
            const ok = RATIO_WAREHOUSES.every((wh) => (r[wh] ?? 0) >= CLEAN_MIN_STOCK);
            if (!cleanBySku.has(r.SKU)) cleanBySku.set(r.SKU, new Map());
            const m = cleanBySku.get(r.SKU)!;
            m.set(d, (m.get(d) ?? true) && ok);
        }

        const shipDailyBySku = new Map<string, Map<string, WhShipDailyRow>>();
        for (const r of whShipDailyResult.recordset) {
            if (!shipDailyBySku.has(r.SKU)) shipDailyBySku.set(r.SKU, new Map());
            shipDailyBySku.get(r.SKU)!.set(r.D, r);
        }

        for (const [sku, dayMap] of cleanBySku) {
            const cleanDays = [...dayMap.entries()]
                .filter(([, ok]) => ok)
                .map(([d]) => d)
                .sort()
                .reverse()
                .slice(0, CLEAN_MAX_DAYS);
            const sum = { CA: 0, TX: 0, NJ: 0, GA: 0 };
            for (const d of cleanDays) {
                const o = shipDailyBySku.get(sku)?.get(d);
                if (!o) continue;
                sum.CA += o.CA_QTY; sum.TX += o.TX_QTY; sum.NJ += o.NJ_QTY; sum.GA += o.GA_QTY;
            }
            const ratio = toRatio(sum);
            if (ratio) shipRatio84d[sku] = ratio;
        }

        //console.log(shipRatio84d);

        // 발주/선적 추세: 작년 오늘 -30일~+150일(180일)의 SKU+창고별 일자별 판매수량을 가져와
        // 30일 단위 6구간 중위값을 낸다. 발주는 창고 구분이 필요 없으므로 4개 창고 합계를 다시 더해서 쓰고,
        // 선적은 창고별로 따로 낸다(선적은 창고 단위로 재고/리드타임을 관리하므로 SKU 전체 추세로 뭉개면 안 됨).
        const trendDailyResult = await db
            .request()
            .input("startDate", sql.VarChar, getCutoffDate(refDate, 395))
            .input("endDate", sql.VarChar, getCutoffDate(refDate, 215))
            .query<DailyQtyByWhRow>(TREND_DAILY_BY_WH_QUERY);

        const dailyByWhMap = new Map<string, Map<string, Record<RatioWh, number>>>();
        for (const r of trendDailyResult.recordset) {
            const dateStr = r.ORD_DATE.toISOString().slice(0, 10);
            if (!dailyByWhMap.has(r.SKU)) dailyByWhMap.set(r.SKU, new Map());
            dailyByWhMap.get(r.SKU)!.set(dateStr, { CA: r.CA_QTY, TX: r.TX_QTY, NJ: r.NJ_QTY, GA: r.GA_QTY });
        }

        const windowDates = TREND_WINDOW_BOUNDS.map(w => ({ key: w.key, dates: dateRange(refDate, w.startDaysAgo, w.endDaysAgo) }));

        const trendMedians: Record<string, TrendMedians> = {};
        const trendMediansByWh: Record<string, Partial<Record<RatioWh, TrendMedians>>> = {};
        for (const [sku, perDate] of dailyByWhMap) {
            const totalMedians = {} as TrendMedians;
            const byWh: Partial<Record<RatioWh, TrendMedians>> = {};
            for (const wh of RATIO_WAREHOUSES) byWh[wh] = {} as TrendMedians;

            for (const w of windowDates) {
                totalMedians[w.key] = median(w.dates.map(d => {
                    const day = perDate.get(d);
                    return day ? day.CA + day.TX + day.NJ + day.GA : 0;
                }));
                for (const wh of RATIO_WAREHOUSES) {
                    byWh[wh]![w.key] = median(w.dates.map(d => perDate.get(d)?.[wh] ?? 0));
                }
            }
            trendMedians[sku] = totalMedians;
            trendMediansByWh[sku] = byWh;
        }

        return NextResponse.json({
            success: true,
            data: rows,
            snapshotDate,
            gathDe: rows.find((r) => r.GATH_DE)?.GATH_DE ?? null,
            refDate,
            shipRatio84d,
            trendMedians,
            trendMediansByWh,
        });
    } catch (err) {
        console.error("DB 조회 오류:", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}