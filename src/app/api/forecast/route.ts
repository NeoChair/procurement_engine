import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

const OWNR_ETP_CD = "KR-DT-HG";

export type ForecastRow = {
    SKU: string;
    YEAR_MONTH: string;
    FRCST_STOCK: number;
    REGT_DT: string;
    MDFY_DT: string;
};

type ForecastInput = {
    sku: string;
    ym: string;
    qty: number;
};

function validateInput(row: Partial<ForecastInput>): string | null {
    if (!row.sku || typeof row.sku !== "string") return "SKU가 비어있습니다.";
    if (!row.ym || !/^\d{6}$/.test(row.ym)) return `YM 형식이 잘못됐습니다 (YYYYMM): ${row.ym}`;
    if (row.qty === undefined || row.qty === null || !Number.isFinite(row.qty) || row.qty < 0) {
        return `FRCST_QTY가 잘못됐습니다: ${row.qty}`;
    }
    return null;
}

export async function GET() {
    try {
        const db = await getDb();
        const result = await db
            .request()
            .input("owner", sql.VarChar(30), OWNR_ETP_CD)
            .query<ForecastRow>(`
                SELECT SKU, YEAR_MONTH, FRCST_STOCK, REGT_DT, MDFY_DT
                FROM [HGBC].[RPA].[TB_FORECAST_STOCK]
                WHERE OWNR_ETP_CD = @owner
                ORDER BY YEAR_MONTH, SKU
            `);
        return NextResponse.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error("발주예측 조회 오류:", err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const inputRows: ForecastInput[] = Array.isArray(body.rows) ? body.rows : [body];

        if (inputRows.length === 0) {
            return NextResponse.json({ success: false, error: "저장할 행이 없습니다." }, { status: 400 });
        }

        for (const row of inputRows) {
            const err = validateInput(row);
            if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
        }

        const db = await getDb();
        const transaction = new sql.Transaction(db);
        await transaction.begin();
        try {
            for (const row of inputRows) {
                const request = new sql.Request(transaction);
                request.input("owner", sql.VarChar(30), OWNR_ETP_CD);
                request.input("sku", sql.NVarChar(50), row.sku);
                request.input("ym", sql.Char(6), row.ym);
                request.input("qty", sql.Int, Math.round(row.qty));
                await request.query(`
                    MERGE [HGBC].[RPA].[TB_FORECAST_STOCK] AS target
                    USING (SELECT @owner AS OWNR_ETP_CD, @sku AS SKU, @ym AS YEAR_MONTH) AS src
                        ON target.OWNR_ETP_CD = src.OWNR_ETP_CD
                       AND target.SKU = src.SKU
                       AND target.YEAR_MONTH = src.YEAR_MONTH
                    WHEN MATCHED THEN
                        UPDATE SET FRCST_STOCK = @qty, MDFY_DT = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (OWNR_ETP_CD, SKU, YEAR_MONTH, FRCST_STOCK)
                        VALUES (@owner, @sku, @ym, @qty);
                `);
            }
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        return NextResponse.json({ success: true, count: inputRows.length });
    } catch (err) {
        console.error("발주예측 저장 오류:", err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sku = searchParams.get("sku");
        const ym = searchParams.get("ym");

        if (!sku || !ym) {
            return NextResponse.json({ success: false, error: "sku, ym 파라미터가 필요합니다." }, { status: 400 });
        }

        const db = await getDb();
        await db
            .request()
            .input("owner", sql.VarChar(30), OWNR_ETP_CD)
            .input("sku", sql.NVarChar(50), sku)
            .input("ym", sql.Char(6), ym)
            .query(`
                DELETE FROM [HGBC].[RPA].[TB_FORECAST_STOCK]
                WHERE OWNR_ETP_CD = @owner AND SKU = @sku AND YEAR_MONTH = @ym
            `);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("발주예측 삭제 오류:", err);
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
