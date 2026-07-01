"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computePoCalc, type PoCalcRow } from "@/lib/calc/poCalc";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

type DisplayRow = PoCalcRow & { factory: string; producing: string };

function n(v: number | undefined) { return (v ?? 0).toLocaleString(); }

const COLUMNS: DataTableColumn<DisplayRow>[] = [
    { key: "SKU",     label: "SKU",              align: "left",  getValue: r => r.sku },
    { key: "FACTORY", label: "제작공장",          align: "left",  getValue: r => r.factory },
    { key: "PROD",    label: "생산여부",          align: "left",  getValue: r => r.producing },
    { key: "WH",      label: "창고",              align: "left",  getValue: r => r.wh },
    { key: "OH",      label: "현재고",            align: "right", getValue: r => r.oh ?? 0,       render: r => n(r.oh) },
    { key: "IT",      label: "이동중재고",         align: "right", getValue: r => r.it ?? 0,       render: r => n(r.it) },
    { key: "SP",      label: "선적계획",          align: "right", getValue: r => r.shipPlan ?? 0, render: r => n(r.shipPlan) },
    { key: "DAILY",   label: "일 예상판매량",      align: "right", getValue: r => r.daily ?? 0,    render: r => n(r.daily) },
    { key: "PRED120", label: "120일치 예상판매량", align: "right", getValue: r => r.poPred120 ?? 0, render: r => n(r.poPred120) },
    { key: "NEED45",  label: "45일치 필요재고",    align: "right", getValue: r => r.need45d ?? 0,  render: r => n(r.need45d) },
    {
        key: "FINAL_PO", label: "발주량", align: "right",
        getValue: r => r.finalPoQty ?? 0,
        render: r => n(r.finalPoQty),
        cellClassName: r => r.finalPoQty > 0 ? "!bg-[#ffe0e0] text-[#c62828] font-semibold" : "bg-inherit",
    },
];

export default function PoTable2({ filters }: { filters: FilterState }) {
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

    const displayRows = useMemo<DisplayRow[]>(() => {
        let calc = computePoCalc(rows, filters.logicMode);

        calc = calc.filter(r => MAIN_SKU_MAP.get(r.sku)?.IsOn !== "FALSE");

        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            calc = calc.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            calc = calc.filter(r => filters.factory.includes(MAIN_SKU_MAP.get(r.sku)?.Factory ?? "-"));
        }
        if (filters.warehouse.length > 0) {
            calc = calc.filter(r => filters.warehouse.includes(r.wh));
        }

        // 발주량 > 0인 SKU가 위로, SKU 내에서는 창고/발주량 순
        const skuPoSum = new Map<string, number>();
        for (const r of calc) skuPoSum.set(r.sku, (skuPoSum.get(r.sku) ?? 0) + r.finalPoQty);
        calc.sort((a, b) => {
            const sa = skuPoSum.get(a.sku) ?? 0;
            const sb = skuPoSum.get(b.sku) ?? 0;
            if (sa !== sb) return sb - sa;
            if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
            return b.finalPoQty - a.finalPoQty;
        });

        return calc.map(r => ({
            ...r,
            factory: MAIN_SKU_MAP.get(r.sku)?.Factory ?? "-",
            producing: MAIN_SKU_MAP.get(r.sku)?.IsOn === "TRUE" ? "생산" : "-",
        }));
    }, [rows, filters]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable
                columns={COLUMNS}
                rows={displayRows}
                rowKey={r => r.key}
                fileName="발주_Table2"
            />
        </div>
    );
}
