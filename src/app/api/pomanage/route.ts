import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

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

// 두 테이블 모두 GATH_DE(수집일자)가 쌓이는 스냅샷 구조라, 최신 스냅샷(GATH_DE = MAX)만 사용한다.
const INTRANSIT_QUERY = `
    SELECT
        OWNR_ETP_CD, PO_NO, ITM_ID, GATH_DE, CONT_NO, SUPL_FACT, WRHS_NM, QTY, ETA, ETD
    FROM [HGBC].[RPA].[TB_INTRANSIT_STOCK_DAIL]
    WHERE GATH_DE = (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_INTRANSIT_STOCK_DAIL])
      AND PO_NO IS NOT NULL AND PO_NO <> ''
`;

// TB_SHIPPING_PLAN_STOCK의 창고 컬럼명이 WRHS_CD로 바뀌어서, TB_INTRANSIT_STOCK_DAIL과 같은
// 필드명(WRHS_NM)으로 쓸 수 있도록 별칭을 준다.
const PLAN_QUERY = `
    SELECT
        OWNR_ETP_CD, GATH_DE, PO_NO, ITM_ID, SUPL_FACT, WRHS_CD AS WRHS_NM, QTY, YEAR_WEEK_NO, ETD, ETA
    FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK]
    WHERE GATH_DE = (SELECT MAX(GATH_DE) FROM [HGBC].[RPA].[TB_SHIPPING_PLAN_STOCK])
      AND PO_NO IS NOT NULL AND PO_NO <> ''
`;

export async function GET() {
    try {
        const db = await getDb();

        const [intransitResult, planResult] = await Promise.all([
            db.request().query<IntransitPoRow>(INTRANSIT_QUERY),
            db.request().query<PlanPoRow>(PLAN_QUERY),
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
