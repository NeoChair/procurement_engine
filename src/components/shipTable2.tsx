"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type Ship2Row } from "@/lib/calc/shipCalc";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

function n(v: number | undefined): string { return (v ?? 0).toLocaleString(); }

const SHIP2_COLUMNS: DataTableColumn<Ship2Row>[] = [
    { key: "SKU",      label: "SKU",         align: "left",  getValue: r => r.sku },
    { key: "FACTORY",  label: "제작공장",     align: "left",  getValue: r => r.factory },
    { key: "PROD",     label: "생산여부",     align: "left",  getValue: r => r.producing },
    { key: "WH",       label: "창고",         align: "left",  getValue: r => r.wh },
    { key: "OH",       label: "현재고",       align: "right", getValue: r => r.oh ?? 0,        render: r => n(r.oh) },
    { key: "IT",       label: "이동중재고",   align: "right", getValue: r => r.it ?? 0,        render: r => n(r.it) },
    { key: "SP",       label: "선적예정",     align: "right", getValue: r => r.shipPlan ?? 0,  render: r => n(r.shipPlan) },
    { key: "DAILY",    label: "1일 예상판매", align: "right", getValue: r => r.daily ?? 0,     render: r => n(r.daily) },
    { key: "NEED28",   label: "28일 Need",    align: "right", getValue: r => r.need28d ?? 0,   render: r => n(r.need28d) },
    {
        key: "SHIP_QTY",
        label: "선적수량",
        align: "right",
        getValue: r => r.shipQty,
        render: r => n(r.shipQty),
        cellClassName: r => (r.shipQty ?? 0) > 0 ? "!bg-[#ffe0e0] text-[#c62828] font-semibold" : "bg-inherit",
    },
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

export default function ShipTable2({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const displayRows = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode);
        let r = tables.table2.filter(row => MAIN_SKU_MAP.get(row.sku)?.IsOn !== "FALSE");
        r = applyFilters(r, filters);
        r = [...r].sort((a, b) => {
            if ((a.shipQty > 0) !== (b.shipQty > 0)) return a.shipQty > 0 ? -1 : 1;
            return b.shipQty - a.shipQty;
        });
        return r;
    }, [rows, filters]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable
                columns={SHIP2_COLUMNS}
                rows={displayRows}
                rowKey={r => r.key}
                fileName="선적_Table2"
            />
        </div>
    );
}
