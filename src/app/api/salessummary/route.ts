import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import sql from "mssql";
import { RATIO_WAREHOUSES, type RatioWh } from "@/lib/calc/rebalance";

export interface SummaryRow {
    OWNR_ETP_CD: string;
    SKU: string;
    GATH_DE: string | null;
    GATH_DT: string | null;

    CA_STOCK: number;
    CA2_STOCK: number;
    GA_STOCK: number;
    GA2_STOCK: number;
    NJ_STOCK: number;
    SC_STOCK: number;
    TX_STOCK: number;
    WF_STOCK: number;
    TOTAL_STOCK: number;

    CA_INTRANSIT_STOCK: number;
    CA2_INTRANSIT_STOCK: number;
    GA_INTRANSIT_STOCK: number;
    GA2_INTRANSIT_STOCK: number;
    NJ_INTRANSIT_STOCK: number;
    SC_INTRANSIT_STOCK: number;
    TX_INTRANSIT_STOCK: number;
    WF_INTRANSIT_STOCK: number;
    TOTAL_INTRANSIT_STOCK: number;

    CA_CURR_YEAR_1WEEK_SALES_QTY: number;
    CA2_CURR_YEAR_1WEEK_SALES_QTY: number;
    GA_CURR_YEAR_1WEEK_SALES_QTY: number;
    GA2_CURR_YEAR_1WEEK_SALES_QTY: number;
    NJ_CURR_YEAR_1WEEK_SALES_QTY: number;
    SC_CURR_YEAR_1WEEK_SALES_QTY: number;
    TX_CURR_YEAR_1WEEK_SALES_QTY: number;
    WF_CURR_YEAR_1WEEK_SALES_QTY: number;
    CURR_YEAR_1WEEK_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_1WEEK_SALES_QTY: number;
    CA2_LAST_YEAR_1WEEK_SALES_QTY: number;
    GA_LAST_YEAR_1WEEK_SALES_QTY: number;
    GA2_LAST_YEAR_1WEEK_SALES_QTY: number;
    NJ_LAST_YEAR_1WEEK_SALES_QTY: number;
    SC_LAST_YEAR_1WEEK_SALES_QTY: number;
    TX_LAST_YEAR_1WEEK_SALES_QTY: number;
    WF_LAST_YEAR_1WEEK_SALES_QTY: number;
    LAST_YEAR_1WEEK_TOTAL_SALES_QTY: number;

    CA_CURR_YEAR_1MONTH_SALES_QTY: number;
    CA2_CURR_YEAR_1MONTH_SALES_QTY: number;
    GA_CURR_YEAR_1MONTH_SALES_QTY: number;
    GA2_CURR_YEAR_1MONTH_SALES_QTY: number;
    NJ_CURR_YEAR_1MONTH_SALES_QTY: number;
    SC_CURR_YEAR_1MONTH_SALES_QTY: number;
    TX_CURR_YEAR_1MONTH_SALES_QTY: number;
    WF_CURR_YEAR_1MONTH_SALES_QTY: number;
    CURR_YEAR_1MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_1MONTH_SALES_QTY: number;
    CA2_LAST_YEAR_1MONTH_SALES_QTY: number;
    GA_LAST_YEAR_1MONTH_SALES_QTY: number;
    GA2_LAST_YEAR_1MONTH_SALES_QTY: number;
    NJ_LAST_YEAR_1MONTH_SALES_QTY: number;
    SC_LAST_YEAR_1MONTH_SALES_QTY: number;
    TX_LAST_YEAR_1MONTH_SALES_QTY: number;
    WF_LAST_YEAR_1MONTH_SALES_QTY: number;
    LAST_YEAR_1MONTH_TOTAL_SALES_QTY: number;

    CA_CURR_YEAR_2MONTH_SALES_QTY: number;
    CA2_CURR_YEAR_2MONTH_SALES_QTY: number;
    GA_CURR_YEAR_2MONTH_SALES_QTY: number;
    GA2_CURR_YEAR_2MONTH_SALES_QTY: number;
    NJ_CURR_YEAR_2MONTH_SALES_QTY: number;
    SC_CURR_YEAR_2MONTH_SALES_QTY: number;
    TX_CURR_YEAR_2MONTH_SALES_QTY: number;
    WF_CURR_YEAR_2MONTH_SALES_QTY: number;
    CURR_YEAR_2MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_2MONTH_SALES_QTY: number;
    CA2_LAST_YEAR_2MONTH_SALES_QTY: number;
    GA_LAST_YEAR_2MONTH_SALES_QTY: number;
    GA2_LAST_YEAR_2MONTH_SALES_QTY: number;
    NJ_LAST_YEAR_2MONTH_SALES_QTY: number;
    SC_LAST_YEAR_2MONTH_SALES_QTY: number;
    TX_LAST_YEAR_2MONTH_SALES_QTY: number;
    WF_LAST_YEAR_2MONTH_SALES_QTY: number;
    LAST_YEAR_2MONTH_TOTAL_SALES_QTY: number;

    CA_LAST_YEAR_ACTL_SALES_QTY: number;
    CA2_LAST_YEAR_ACTL_SALES_QTY: number;
    GA_LAST_YEAR_ACTL_SALES_QTY: number;
    GA2_LAST_YEAR_ACTL_SALES_QTY: number;
    NJ_LAST_YEAR_ACTL_SALES_QTY: number;
    SC_LAST_YEAR_ACTL_SALES_QTY: number;
    TX_LAST_YEAR_ACTL_SALES_QTY: number;
    WF_LAST_YEAR_ACTL_SALES_QTY: number;
    LAST_YEAR_ACTL_SALES_QTY: number;

    CA1_PRODUCTION_PLAN_QTY: number;
    CA_PRODUCTION_PLAN_QTY: number;
    CA2_PRODUCTION_PLAN_QTY: number;
    GA_PRODUCTION_PLAN_QTY: number;
    GA2_PRODUCTION_PLAN_QTY: number;
    NJ_PRODUCTION_PLAN_QTY: number;
    SC_PRODUCTION_PLAN_QTY: number;
    TX_PRODUCTION_PLAN_QTY: number;
    WF_PRODUCTION_PLAN_QTY: number;
}

/** SKU별 최근 84일(PST) 실제 CA/TX/NJ/GA 창고 출고 비율 (합계 = 1). */
export type ShipRatio84d = {
    CA: number;
    TX: number;
    NJ: number;
    GA: number;
};

type WhShipRow = {
    SKU: string;
    CA_QTY: number;
    TX_QTY: number;
    NJ_QTY: number;
    GA_QTY: number;
};

//출고 비율 쿼리
const WH_SHIP_84D_QUERY = `
    SELECT
        pg.INVT_SKU AS SKU,
        SUM(CASE WHEN o.WAREHOUSE IN ('14630', '14631') THEN o.QTY ELSE 0 END) AS CA_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14636' THEN o.QTY ELSE 0 END) AS TX_QTY,
        SUM(CASE WHEN o.WAREHOUSE = '14634' THEN o.QTY ELSE 0 END) AS NJ_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14632', '14633', '14635') THEN o.QTY ELSE 0 END) AS GA_QTY
    FROM [HGBC].[SD].[TB_ORD_DAIL] o
    JOIN [HGBC].[SD].[TB_PROD_GROUP] pg ON o.ITM_ID = pg.ITM_ID
    WHERE o.ORD_DE >= @cutoffDate
      AND pg.INVT_SKU <> ''
      AND o.WAREHOUSE IN ('14630', '14631', '14632', '14633', '14634', '14635', '14636')
    GROUP BY pg.INVT_SKU
`;

/** 오늘(PST) 기준 daysAgo일 전 00:00:00(PST) 문자열을 반환한다. */
function getPstCutoffDate(daysAgo: number): string {
    const pstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    pstNow.setDate(pstNow.getDate() - daysAgo);
    const y = pstNow.getFullYear();
    const m = String(pstNow.getMonth() + 1).padStart(2, "0");
    const d = String(pstNow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d} 00:00:00`;
}

/** 오늘(PST) 기준 daysAgo일 전 날짜만(YYYY-MM-DD, 시간 없음). */
function getPstDateOnly(daysAgo: number): string {
    const pstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    pstNow.setDate(pstNow.getDate() - daysAgo);
    const y = pstNow.getFullYear();
    const m = String(pstNow.getMonth() + 1).padStart(2, "0");
    const d = String(pstNow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** startDaysAgo(더 과거) ~ endDaysAgo(더 최근) 사이 날짜 목록(YYYY-MM-DD), startDaysAgo부터 endDaysAgo+1일까지. */
function pstDateRange(startDaysAgo: number, endDaysAgo: number): string[] {
    const dates: string[] = [];
    for (let d = startDaysAgo; d > endDaysAgo; d--) dates.push(getPstDateOnly(d));
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
        SUM(CASE WHEN o.WAREHOUSE IN ('14630', '14631', '357016', '7118388') THEN o.QTY ELSE 0 END) AS CA_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14636', '3240230') THEN o.QTY ELSE 0 END) AS TX_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14634', '6585090') THEN o.QTY ELSE 0 END) AS NJ_QTY,
        SUM(CASE WHEN o.WAREHOUSE IN ('14632', '14633', '14635', '2940239', '7259780', '8351661') THEN o.QTY ELSE 0 END) AS GA_QTY
    FROM [HGBC].[SD].[TB_ORD_DAIL] o
    JOIN [HGBC].[SD].[TB_PROD_GROUP] pg ON o.ITM_ID = pg.ITM_ID
    WHERE o.ORD_DE >= @startDate AND o.ORD_DE < @endDate
      AND pg.INVT_SKU <> ''
      AND o.WAREHOUSE IN (
        '14630', '14631', '14632', '14633', '14634', '14635', '14636',
        '357016', '2940239', '3240230', '6585090', '7118388', '7259780', '8351661'
      )
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

function formatDate(d: Date, endOfDay: boolean): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

/** Shipping Plan ETD 필터 범위: 이번 주(월요일 시작) 기준 지난주~다음주(3주치)의 월~일. */
function getShipPlanEtdRange(): { start: string; end: string } {
    const pstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    pstNow.setHours(0, 0, 0, 0);
    const dow = pstNow.getDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    const mondayThisWeek = new Date(pstNow);
    mondayThisWeek.setDate(mondayThisWeek.getDate() - daysSinceMonday);

    const startDate = new Date(mondayThisWeek);
    startDate.setDate(startDate.getDate() - 7); // 지난주 월요일
    const endDate = new Date(mondayThisWeek);
    endDate.setDate(endDate.getDate() + 13); // 다음주 일요일

    return { start: formatDate(startDate, false), end: formatDate(endDate, true) };
}

//SUMMARY QUERY
const SUMMARY_QUERY = `
    WITH all_skus AS (
        SELECT DISTINCT SKU
        FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY]
        WHERE GATH_DE = (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY])

        UNION

        SELECT DISTINCT ITM_ID AS SKU
        FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]
    )
    SELECT
        ISNULL(s.OWNR_ETP_CD, '')       AS OWNR_ETP_CD,
        a.SKU,
        s.GATH_DE,
        s.GATH_DT,

        ISNULL(s.CA_STOCK,  0)          AS CA_STOCK,
        ISNULL(s.CA2_STOCK, 0)          AS CA2_STOCK,
        ISNULL(s.GA_STOCK,  0)          AS GA_STOCK,
        ISNULL(s.GA2_STOCK, 0)          AS GA2_STOCK,
        ISNULL(s.NJ_STOCK,  0)          AS NJ_STOCK,
        ISNULL(s.SC_STOCK,  0)          AS SC_STOCK,
        ISNULL(s.TX_STOCK,  0)          AS TX_STOCK,
        ISNULL(s.WF_STOCK,  0)          AS WF_STOCK,
        ISNULL(s.TOTAL_STOCK, 0)        AS TOTAL_STOCK,

        ISNULL(s.CA_INTRANSIT_STOCK,    0) AS CA_INTRANSIT_STOCK,
        ISNULL(s.CA2_INTRANSIT_STOCK,   0) AS CA2_INTRANSIT_STOCK,
        ISNULL(s.GA_INTRANSIT_STOCK,    0) AS GA_INTRANSIT_STOCK,
        ISNULL(s.GA2_INTRANSIT_STOCK,   0) AS GA2_INTRANSIT_STOCK,
        ISNULL(s.NJ_INTRANSIT_STOCK,    0) AS NJ_INTRANSIT_STOCK,
        ISNULL(s.SC_INTRANSIT_STOCK,    0) AS SC_INTRANSIT_STOCK,
        ISNULL(s.TX_INTRANSIT_STOCK,    0) AS TX_INTRANSIT_STOCK,
        ISNULL(s.WF_INTRANSIT_STOCK,    0) AS WF_INTRANSIT_STOCK,
        ISNULL(s.TOTAL_INTRANSIT_STOCK, 0) AS TOTAL_INTRANSIT_STOCK,

        ISNULL(s.CA_CURR_YEAR_1WEEK_SALES_QTY,  0) AS CA_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.CA2_CURR_YEAR_1WEEK_SALES_QTY, 0) AS CA2_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.GA_CURR_YEAR_1WEEK_SALES_QTY,  0) AS GA_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.GA2_CURR_YEAR_1WEEK_SALES_QTY, 0) AS GA2_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.NJ_CURR_YEAR_1WEEK_SALES_QTY,  0) AS NJ_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.SC_CURR_YEAR_1WEEK_SALES_QTY,  0) AS SC_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.TX_CURR_YEAR_1WEEK_SALES_QTY,  0) AS TX_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.WF_CURR_YEAR_1WEEK_SALES_QTY,  0) AS WF_CURR_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.CURR_YEAR_1WEEK_TOTAL_SALES_QTY, 0) AS CURR_YEAR_1WEEK_TOTAL_SALES_QTY,

        ISNULL(s.CA_LAST_YEAR_1WEEK_SALES_QTY,  0) AS CA_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.CA2_LAST_YEAR_1WEEK_SALES_QTY, 0) AS CA2_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.GA_LAST_YEAR_1WEEK_SALES_QTY,  0) AS GA_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.GA2_LAST_YEAR_1WEEK_SALES_QTY, 0) AS GA2_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.NJ_LAST_YEAR_1WEEK_SALES_QTY,  0) AS NJ_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.SC_LAST_YEAR_1WEEK_SALES_QTY,  0) AS SC_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.TX_LAST_YEAR_1WEEK_SALES_QTY,  0) AS TX_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.WF_LAST_YEAR_1WEEK_SALES_QTY,  0) AS WF_LAST_YEAR_1WEEK_SALES_QTY,
        ISNULL(s.LAST_YEAR_1WEEK_TOTAL_SALES_QTY, 0) AS LAST_YEAR_1WEEK_TOTAL_SALES_QTY,

        ISNULL(s.CA_CURR_YEAR_1MONTH_SALES_QTY,  0) AS CA_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.CA2_CURR_YEAR_1MONTH_SALES_QTY, 0) AS CA2_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.GA_CURR_YEAR_1MONTH_SALES_QTY,  0) AS GA_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.GA2_CURR_YEAR_1MONTH_SALES_QTY, 0) AS GA2_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.NJ_CURR_YEAR_1MONTH_SALES_QTY,  0) AS NJ_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.SC_CURR_YEAR_1MONTH_SALES_QTY,  0) AS SC_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.TX_CURR_YEAR_1MONTH_SALES_QTY,  0) AS TX_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.WF_CURR_YEAR_1MONTH_SALES_QTY,  0) AS WF_CURR_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.CURR_YEAR_1MONTH_TOTAL_SALES_QTY, 0) AS CURR_YEAR_1MONTH_TOTAL_SALES_QTY,

        ISNULL(s.CA_LAST_YEAR_1MONTH_SALES_QTY,  0) AS CA_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.CA2_LAST_YEAR_1MONTH_SALES_QTY, 0) AS CA2_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.GA_LAST_YEAR_1MONTH_SALES_QTY,  0) AS GA_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.GA2_LAST_YEAR_1MONTH_SALES_QTY, 0) AS GA2_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.NJ_LAST_YEAR_1MONTH_SALES_QTY,  0) AS NJ_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.SC_LAST_YEAR_1MONTH_SALES_QTY,  0) AS SC_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.TX_LAST_YEAR_1MONTH_SALES_QTY,  0) AS TX_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.WF_LAST_YEAR_1MONTH_SALES_QTY,  0) AS WF_LAST_YEAR_1MONTH_SALES_QTY,
        ISNULL(s.LAST_YEAR_1MONTH_TOTAL_SALES_QTY, 0) AS LAST_YEAR_1MONTH_TOTAL_SALES_QTY,

        ISNULL(s.CA_CURR_YEAR_2MONTH_SALES_QTY,  0) AS CA_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.CA2_CURR_YEAR_2MONTH_SALES_QTY, 0) AS CA2_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.GA_CURR_YEAR_2MONTH_SALES_QTY,  0) AS GA_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.GA2_CURR_YEAR_2MONTH_SALES_QTY, 0) AS GA2_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.NJ_CURR_YEAR_2MONTH_SALES_QTY,  0) AS NJ_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.SC_CURR_YEAR_2MONTH_SALES_QTY,  0) AS SC_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.TX_CURR_YEAR_2MONTH_SALES_QTY,  0) AS TX_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.WF_CURR_YEAR_2MONTH_SALES_QTY,  0) AS WF_CURR_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.CURR_YEAR_2MONTH_TOTAL_SALES_QTY, 0) AS CURR_YEAR_2MONTH_TOTAL_SALES_QTY,

        ISNULL(s.CA_LAST_YEAR_2MONTH_SALES_QTY,  0) AS CA_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.CA2_LAST_YEAR_2MONTH_SALES_QTY, 0) AS CA2_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.GA_LAST_YEAR_2MONTH_SALES_QTY,  0) AS GA_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.GA2_LAST_YEAR_2MONTH_SALES_QTY, 0) AS GA2_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.NJ_LAST_YEAR_2MONTH_SALES_QTY,  0) AS NJ_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.SC_LAST_YEAR_2MONTH_SALES_QTY,  0) AS SC_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.TX_LAST_YEAR_2MONTH_SALES_QTY,  0) AS TX_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.WF_LAST_YEAR_2MONTH_SALES_QTY,  0) AS WF_LAST_YEAR_2MONTH_SALES_QTY,
        ISNULL(s.LAST_YEAR_2MONTH_TOTAL_SALES_QTY, 0) AS LAST_YEAR_2MONTH_TOTAL_SALES_QTY,

        ISNULL(s.CA_LAST_YEAR_ACTL_SALES_QTY,  0) AS CA_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.CA2_LAST_YEAR_ACTL_SALES_QTY, 0) AS CA2_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.GA_LAST_YEAR_ACTL_SALES_QTY,  0) AS GA_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.GA2_LAST_YEAR_ACTL_SALES_QTY, 0) AS GA2_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.NJ_LAST_YEAR_ACTL_SALES_QTY,  0) AS NJ_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.SC_LAST_YEAR_ACTL_SALES_QTY,  0) AS SC_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.TX_LAST_YEAR_ACTL_SALES_QTY,  0) AS TX_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.WF_LAST_YEAR_ACTL_SALES_QTY,  0) AS WF_LAST_YEAR_ACTL_SALES_QTY,
        ISNULL(s.LAST_YEAR_ACTL_SALES_QTY,     0) AS LAST_YEAR_ACTL_SALES_QTY,

        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14361 THEN p.QTY END), 0) AS CA1_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14630 THEN p.QTY END), 0) AS CA_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14631 THEN p.QTY END), 0) AS CA2_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14632 THEN p.QTY END), 0) AS GA_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14633 THEN p.QTY END), 0) AS GA2_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14634 THEN p.QTY END), 0) AS NJ_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14635 THEN p.QTY END), 0) AS SC_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 14636 THEN p.QTY END), 0) AS TX_PRODUCTION_PLAN_QTY,
        ISNULL(SUM(CASE WHEN p.WRHS_NM = 0     THEN p.QTY END), 0) AS WF_PRODUCTION_PLAN_QTY

    FROM all_skus a
    LEFT JOIN [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY] s
        ON a.SKU = s.SKU
        AND s.GATH_DE = (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY])
    LEFT JOIN [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK] p
        ON a.SKU = p.ITM_ID
        AND p.GATH_DE = (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY])
        AND p.ETD BETWEEN @etdStart AND @etdEnd

    GROUP BY
        s.OWNR_ETP_CD, a.SKU, s.GATH_DE, s.GATH_DT,
        s.CA_STOCK, s.CA2_STOCK, s.GA_STOCK, s.GA2_STOCK,
        s.NJ_STOCK, s.SC_STOCK, s.TX_STOCK, s.WF_STOCK, s.TOTAL_STOCK,
        s.CA_INTRANSIT_STOCK, s.CA2_INTRANSIT_STOCK, s.GA_INTRANSIT_STOCK, s.GA2_INTRANSIT_STOCK,
        s.NJ_INTRANSIT_STOCK, s.SC_INTRANSIT_STOCK, s.TX_INTRANSIT_STOCK, s.WF_INTRANSIT_STOCK,
        s.TOTAL_INTRANSIT_STOCK,
        s.CA_CURR_YEAR_1WEEK_SALES_QTY, s.CA2_CURR_YEAR_1WEEK_SALES_QTY,
        s.GA_CURR_YEAR_1WEEK_SALES_QTY, s.GA2_CURR_YEAR_1WEEK_SALES_QTY,
        s.NJ_CURR_YEAR_1WEEK_SALES_QTY, s.SC_CURR_YEAR_1WEEK_SALES_QTY,
        s.TX_CURR_YEAR_1WEEK_SALES_QTY, s.WF_CURR_YEAR_1WEEK_SALES_QTY,
        s.CURR_YEAR_1WEEK_TOTAL_SALES_QTY,
        s.CA_LAST_YEAR_1WEEK_SALES_QTY, s.CA2_LAST_YEAR_1WEEK_SALES_QTY,
        s.GA_LAST_YEAR_1WEEK_SALES_QTY, s.GA2_LAST_YEAR_1WEEK_SALES_QTY,
        s.NJ_LAST_YEAR_1WEEK_SALES_QTY, s.SC_LAST_YEAR_1WEEK_SALES_QTY,
        s.TX_LAST_YEAR_1WEEK_SALES_QTY, s.WF_LAST_YEAR_1WEEK_SALES_QTY,
        s.LAST_YEAR_1WEEK_TOTAL_SALES_QTY,
        s.CA_CURR_YEAR_1MONTH_SALES_QTY, s.CA2_CURR_YEAR_1MONTH_SALES_QTY,
        s.GA_CURR_YEAR_1MONTH_SALES_QTY, s.GA2_CURR_YEAR_1MONTH_SALES_QTY,
        s.NJ_CURR_YEAR_1MONTH_SALES_QTY, s.SC_CURR_YEAR_1MONTH_SALES_QTY,
        s.TX_CURR_YEAR_1MONTH_SALES_QTY, s.WF_CURR_YEAR_1MONTH_SALES_QTY,
        s.CURR_YEAR_1MONTH_TOTAL_SALES_QTY,
        s.CA_LAST_YEAR_1MONTH_SALES_QTY, s.CA2_LAST_YEAR_1MONTH_SALES_QTY,
        s.GA_LAST_YEAR_1MONTH_SALES_QTY, s.GA2_LAST_YEAR_1MONTH_SALES_QTY,
        s.NJ_LAST_YEAR_1MONTH_SALES_QTY, s.SC_LAST_YEAR_1MONTH_SALES_QTY,
        s.TX_LAST_YEAR_1MONTH_SALES_QTY, s.WF_LAST_YEAR_1MONTH_SALES_QTY,
        s.LAST_YEAR_1MONTH_TOTAL_SALES_QTY,
        s.CA_CURR_YEAR_2MONTH_SALES_QTY, s.CA2_CURR_YEAR_2MONTH_SALES_QTY,
        s.GA_CURR_YEAR_2MONTH_SALES_QTY, s.GA2_CURR_YEAR_2MONTH_SALES_QTY,
        s.NJ_CURR_YEAR_2MONTH_SALES_QTY, s.SC_CURR_YEAR_2MONTH_SALES_QTY,
        s.TX_CURR_YEAR_2MONTH_SALES_QTY, s.WF_CURR_YEAR_2MONTH_SALES_QTY,
        s.CURR_YEAR_2MONTH_TOTAL_SALES_QTY,
        s.CA_LAST_YEAR_2MONTH_SALES_QTY, s.CA2_LAST_YEAR_2MONTH_SALES_QTY,
        s.GA_LAST_YEAR_2MONTH_SALES_QTY, s.GA2_LAST_YEAR_2MONTH_SALES_QTY,
        s.NJ_LAST_YEAR_2MONTH_SALES_QTY, s.SC_LAST_YEAR_2MONTH_SALES_QTY,
        s.TX_LAST_YEAR_2MONTH_SALES_QTY, s.WF_LAST_YEAR_2MONTH_SALES_QTY,
        s.LAST_YEAR_2MONTH_TOTAL_SALES_QTY,
        s.CA_LAST_YEAR_ACTL_SALES_QTY, s.CA2_LAST_YEAR_ACTL_SALES_QTY,
        s.GA_LAST_YEAR_ACTL_SALES_QTY, s.GA2_LAST_YEAR_ACTL_SALES_QTY,
        s.NJ_LAST_YEAR_ACTL_SALES_QTY, s.SC_LAST_YEAR_ACTL_SALES_QTY,
        s.TX_LAST_YEAR_ACTL_SALES_QTY, s.WF_LAST_YEAR_ACTL_SALES_QTY,
        s.LAST_YEAR_ACTL_SALES_QTY
`;

export async function GET() {
    try {
        const db = await getDb();
        const { start: etdStart, end: etdEnd } = getShipPlanEtdRange();
        const result = await db
            .request()
            .input("etdStart", sql.VarChar, etdStart)
            .input("etdEnd", sql.VarChar, etdEnd)
            .query<SummaryRow>(SUMMARY_QUERY);

        const rows = result.recordset;
        // rows[0]이 TB_SHIPPING_PLAN_STOCK에만 존재하는 SKU면 LEFT JOIN으로 GATH_DT가 NULL이 될 수 있으므로
        // 첫 번째 non-null 값을 찾는다.
        const snapshotDate = rows.find((r) => r.GATH_DT)?.GATH_DT ?? null;

        const whShipResult = await db
            .request()
            .input("cutoffDate", sql.VarChar, getPstCutoffDate(84))
            .query<WhShipRow>(WH_SHIP_84D_QUERY);

        const shipRatio84d: Record<string, ShipRatio84d> = {};
        for (const r of whShipResult.recordset) {
            const total = r.CA_QTY + r.TX_QTY + r.NJ_QTY + r.GA_QTY;
            if (total <= 0) continue;
            shipRatio84d[r.SKU] = {
                CA: r.CA_QTY / total,
                TX: r.TX_QTY / total,
                NJ: r.NJ_QTY / total,
                GA: r.GA_QTY / total,
            };
        }

        //console.log(shipRatio84d);

        // 발주/선적 추세: 작년 오늘 -30일~+150일(180일)의 SKU+창고별 일자별 판매수량을 가져와
        // 30일 단위 6구간 중위값을 낸다. 발주는 창고 구분이 필요 없으므로 4개 창고 합계를 다시 더해서 쓰고,
        // 선적은 창고별로 따로 낸다(선적은 창고 단위로 재고/리드타임을 관리하므로 SKU 전체 추세로 뭉개면 안 됨).
        const trendDailyResult = await db
            .request()
            .input("startDate", sql.VarChar, getPstCutoffDate(395))
            .input("endDate", sql.VarChar, getPstCutoffDate(215))
            .query<DailyQtyByWhRow>(TREND_DAILY_BY_WH_QUERY);

        const dailyByWhMap = new Map<string, Map<string, Record<RatioWh, number>>>();
        for (const r of trendDailyResult.recordset) {
            const dateStr = r.ORD_DATE.toISOString().slice(0, 10);
            if (!dailyByWhMap.has(r.SKU)) dailyByWhMap.set(r.SKU, new Map());
            dailyByWhMap.get(r.SKU)!.set(dateStr, { CA: r.CA_QTY, TX: r.TX_QTY, NJ: r.NJ_QTY, GA: r.GA_QTY });
        }

        const windowDates = TREND_WINDOW_BOUNDS.map(w => ({ key: w.key, dates: pstDateRange(w.startDaysAgo, w.endDaysAgo) }));

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