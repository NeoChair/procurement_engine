"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";

const WAREHOUSES = ["CA", "GA", "NJ", "TX", "WF"] as const;
type Warehouse = (typeof WAREHOUSES)[number];

const BASE_SOURCE = "LY_FORWARD_63D_ACTL_SCALED_TO_120";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };

const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map((record) => [record.SKU, record])
);

function factoryOf(sku: string): string {
    return MAIN_SKU_MAP.get(sku)?.Factory || "-";
}

function producingOf(sku: string): string {
    return MAIN_SKU_MAP.get(sku)?.IsOn === "TRUE" ? "생산" : "-";
}

type PoRow = {
    key: string;
    sku: string;
    factory: string;
    producing: string;
    warehouse: Warehouse;
    actl63: number;
    baseSource: string;
    last7: number;
    curr7: number;
    last28: number;
    curr28: number;
    last56: number;
    curr56: number;
};

function n(v: number | undefined): string {
    return (v ?? 0).toLocaleString();
}

function expandRow(row: SummaryRow, wh: Warehouse): PoRow {
    return {
        key: `${row.SKU}__${wh}`,
        sku: row.SKU,
        factory: factoryOf(row.SKU),
        producing: producingOf(row.SKU),
        warehouse: wh,
        actl63: (row.LAST_YEAR_ACTL_SALES_QTY as number) ?? 0,
        baseSource: BASE_SOURCE,
        last7:  (row[`${wh}_LAST_YEAR_1WEEK_SALES_QTY`]  as number) ?? 0,
        curr7:  (row[`${wh}_CURR_YEAR_1WEEK_SALES_QTY`]  as number) ?? 0,
        last28: (row[`${wh}_LAST_YEAR_1MONTH_SALES_QTY`] as number) ?? 0,
        curr28: (row[`${wh}_CURR_YEAR_1MONTH_SALES_QTY`] as number) ?? 0,
        last56: (row[`${wh}_LAST_YEAR_2MONTH_SALES_QTY`] as number) ?? 0,
        curr56: (row[`${wh}_CURR_YEAR_2MONTH_SALES_QTY`] as number) ?? 0,
    };
}

const COLUMNS: DataTableColumn<PoRow>[] = [
    { key: "SKU",       label: "SKU",                       align: "left",  getValue: (row) => row.sku },
    { key: "FACTORY",   label: "제작공장",                  align: "left",  getValue: (row) => row.factory },
    { key: "PRODUCING", label: "생산여부",                  align: "left",  getValue: (row) => row.producing },
    { key: "WAREHOUSE", label: "창고",                      align: "left",  getValue: (row) => row.warehouse },
    { key: "ACTL_63",   label: "작년 동기간 실제판매량 63일", align: "right", getValue: (row) => row.actl63 ?? 0, render: (row) => n(row.actl63) },
    { key: "BASE_SOURCE", label: "Base 소스",               align: "left",  getValue: (row) => row.baseSource },
    { key: "LAST_1WEEK",  label: "작년 과거 7일",           align: "right", getValue: (row) => row.last7  ?? 0, render: (row) => n(row.last7) },
    { key: "CURR_1WEEK",  label: "올해 과거 7일",           align: "right", getValue: (row) => row.curr7  ?? 0, render: (row) => n(row.curr7) },
    { key: "LAST_28",     label: "작년 과거 28일",          align: "right", getValue: (row) => row.last28 ?? 0, render: (row) => n(row.last28) },
    { key: "CURR_28",     label: "올해 과거 28일",          align: "right", getValue: (row) => row.curr28 ?? 0, render: (row) => n(row.curr28) },
    { key: "LAST_56",     label: "작년 과거 56일",          align: "right", getValue: (row) => row.last56 ?? 0, render: (row) => n(row.last56) },
    { key: "CURR_56",     label: "올해 과거 56일",          align: "right", getValue: (row) => row.curr56 ?? 0, render: (row) => n(row.curr56) },
];

export default function PoTable({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch("/api/salessummary");
                const json = await res.json();
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const expandedRows = useMemo(() => {
        let result = rows.flatMap((row) => WAREHOUSES.map((wh) => expandRow(row, wh)));
        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            result = result.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            result = result.filter(r => filters.factory.includes(r.factory));
        }
        if (filters.warehouse.length > 0) {
            result = result.filter(r => filters.warehouse.includes(r.warehouse));
        }
        return result;
    }, [rows, filters]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable columns={COLUMNS} rows={expandedRows} rowKey={(row) => row.key} fileName="발주_Table1" />
        </div>
    );
}
