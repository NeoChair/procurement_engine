import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

/** TB_INTRANSIT_STOCK_DAIL: 실입고 진행중(이동중재고) PO 라인. */
export type IntransitPoRow = {
    OWNR_ETP_CD: string;
    PO_NO: string;
    ITM_ID: string;
    GATH_DE: string | null;
    CONT_NO: string | null;
    SUPL_FACT: string | null;
    WRHS_NM: string | null;
    QTY: number;
    ETA: string | null;
    ETD: string | null;
};

/** TB_SHIPPING_PLAN_STOCK: 선적 계획 PO 라인. */
export type PlanPoRow = {
    OWNR_ETP_CD: string;
    GATH_DE: string | null;
    PO_NO: string;
    ITM_ID: string;
    SUPL_FACT: string | null;
    WRHS_NM: string | null;
    QTY: number;
    YEAR_WEEK_NO: string | null;
    ETD: string | null;
    ETA: string | null;
};

// 두 테이블 모두 GATH_DE(수집일자)가 쌓이는 스냅샷 구조라, 한 스냅샷만 사용한다.
// @gathDe(사이드바에서 고른 스냅샷)가 있으면 그 스냅샷, 없으면(NULL) 최신 스냅샷(MAX).
const INTRANSIT_QUERY = `
    SELECT
        OWNR_ETP_CD, PO_NO, ITM_ID, GATH_DE, CONT_NO, SUPL_FACT, WRHS_NM, QTY, ETA, ETD
    FROM [HGBC].[RPA].[TB_INTRANSIT_STOCK_DAIL]
    WHERE GATH_DE = COALESCE(@gathDe, (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_INTRANSIT_STOCK_DAIL]))
      AND PO_NO IS NOT NULL AND PO_NO <> ''
`;

// TB_SHIPPING_PLAN_STOCK의 창고 컬럼명이 WRHS_CD로 바뀌어서, TB_INTRANSIT_STOCK_DAIL과 같은
// 필드명(WRHS_NM)으로 쓸 수 있도록 별칭을 준다.
const PLAN_QUERY = `
    SELECT
        OWNR_ETP_CD, GATH_DE, PO_NO, ITM_ID, SUPL_FACT, WRHS_CD AS WRHS_NM, QTY, YEAR_WEEK_NO, ETD, ETA
    FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]
    WHERE GATH_DE = COALESCE(@gathDe, (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]))
      AND PO_NO IS NOT NULL AND PO_NO <> ''
`;

export async function GET(request: NextRequest) {
    try {
        const gathDeParam = request.nextUrl.searchParams.get("gathDe");
        const gathDe = gathDeParam && /^\d{8}(AM|PM)$/.test(gathDeParam) ? gathDeParam : null;
        const db = await getDb();

        const [intransitResult, planResult] = await Promise.all([
            db.request().input("gathDe", sql.VarChar, gathDe).query<IntransitPoRow>(INTRANSIT_QUERY),
            db.request().input("gathDe", sql.VarChar, gathDe).query<PlanPoRow>(PLAN_QUERY),
        ]);

        return NextResponse.json({
            success: true,
            intransit: intransitResult.recordset,
            plan: planResult.recordset,
        });
    } catch (err) {
        console.error("PO 관리 조회 오류:", err);
        return NextResponse.json(
            { success: false, error: String(err) },
            { status: 500 }
        );
    }
}
