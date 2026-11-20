import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * 스냅샷 3개 테이블(판매/재고 요약 BACKUP, 선적계획, 이동중재고)에 모두 존재하는 GATH_DE 목록(최신순).
 * GATH_DE 형식: 'YYYYMMDDAM' / 'YYYYMMDDPM'. 사이드바 과거 선적량 조회 날짜 선택용.
 */
const SNAPSHOT_DATES_QUERY = `
    SELECT s.GATH_DE
    FROM (SELECT DISTINCT GATH_DE FROM [HGBC].[RPA].[TB_SALES_STOCK_SUMMARY_BACKUP]) s
    JOIN (SELECT DISTINCT GATH_DE FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]) p ON p.GATH_DE = s.GATH_DE
    JOIN (SELECT DISTINCT GATH_DE FROM [HGBC].[RPA].[TB_INTRANSIT_STOCK_DAIL]) i ON i.GATH_DE = s.GATH_DE
    ORDER BY s.GATH_DE DESC
`;

export async function GET() {
    try {
        const db = await getDb();
        const result = await db.request().query<{ GATH_DE: string }>(SNAPSHOT_DATES_QUERY);
        return NextResponse.json({ success: true, data: result.recordset.map((r) => r.GATH_DE) });
    } catch (err) {
        console.error("스냅샷 날짜 조회 오류:", err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
