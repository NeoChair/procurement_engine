import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const db = await getDb()
        const result = await db.request().query('SELECT 1 AS test')
        return NextResponse.json({ success: true, data: result.recordset })
    } catch (err) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
    }
}