"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type Ship1Row, type LyForward7dMap } from "@/lib/calc/shipCalc";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

function n(v: number | undefined | null): string { return v == null ? "-" : v.toLocaleString(); }

const SHIP1_COLUMNS: DataTableColumn<Ship1Row>[] = [
    { key: "SKU",      label: "SKU",         align: "left",  getValue: r => r.sku },
    { key: "FACTORY",  label: "제작공장",     align: "left",  getValue: r => r.factory },
    { key: "PROD",     label: "생산여부",     align: "left",  getValue: r => r.producing },
    { key: "WH",       label: "창고",         align: "left",  getValue: r => r.wh },
    { key: "LY_FWD7",  label: "작년 오늘 +7일",    align: "right", getValue: r => r.lyForward7 ?? 0, render: r => n(r.lyForward7) },
    { key: "LY7",      label: "작년 7일",     align: "right", getValue: r => r.ly7 ?? 0,       render: r => n(r.ly7) },
    { key: "CY7",      label: "올해 7일",     align: "right", getValue: r => r.cy7 ?? 0,       render: r => n(r.cy7) },
    { key: "CY28",     label: "올해 28일",    align: "right", getValue: r => r.cy28 ?? 0,      render: r => n(r.cy28) },
    { key: "CY56",     label: "올해 56일",    align: "right", getValue: r => r.cy56 ?? 0,      render: r => n(r.cy56) },
];

function applyFilters<T extends { sku: string; factory: string; wh: string }>(
    rows: T[],
    filters: FilterState,
): T[] {
    let r = rows;
    if (filters.skuQuery) {
        const q = filters.skuQuery.toUpperCase();
        r = r.filter(x => x.sku.toUpperCase().includes(q));
    }
    if (filters.factory.length > 0) r = r.filter(x => filters.factory.includes(x.factory));
    if (filters.warehouse.length > 0) r = r.filter(x => filters.warehouse.includes(x.wh));
    return r;
}

export default function ShipTable1({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [lyForward7d, setLyForward7d] = useState<LyForward7dMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setLyForward7d(json.lyForward7d ?? {});
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const displayRows = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, undefined, undefined, undefined, undefined, lyForward7d);
        return applyFilters(tables.table1, filters);
    }, [rows, filters, lyForward7d]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable columns={SHIP1_COLUMNS} rows={displayRows} rowKey={r => r.key} fileName="선적_Table1" />
        </div>
    );
}
