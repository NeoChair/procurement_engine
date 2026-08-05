"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computePoCalc, type PoCalcRow } from "@/lib/calc/poCalc";
import type { ForecastMap } from "@/lib/calc/shipCalc";
import type { ActualRatio } from "@/lib/calc/rebalance";
import type { ForecastRow } from "@/app/api/forecast/route";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

type DisplayRow = PoCalcRow & { factory: string; producing: string };

function n(v: number | undefined) { return (v ?? 0).toLocaleString(); }
function pct(v: number | null | undefined): string {
    return v == null ? "-" : `${(v * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildColumns(logicMode: FilterState["logicMode"]): DataTableColumn<DisplayRow>[] {
    const columns: DataTableColumn<DisplayRow>[] = [
        { key: "SKU",     label: "SKU",              align: "left",  getValue: r => r.sku },
        { key: "FACTORY", label: "제작공장",          align: "left",  getValue: r => r.factory },
        { key: "PROD",    label: "생산여부",          align: "left",  getValue: r => r.producing },
        { key: "WH",      label: "창고",              align: "left",  getValue: r => r.wh },
    ];

    if (logicMode === "manual") {
        columns.push({ key: "ACTUAL_RATIO", label: "실출고 비율", align: "right", getValue: r => r.actualRatio ?? 0, render: r => pct(r.actualRatio) });
    }

    columns.push(
        { key: "OH",      label: "현재고",            align: "right", getValue: r => r.oh ?? 0,       render: r => n(r.oh) },
        { key: "IT",      label: "이동중재고",         align: "right", getValue: r => r.it ?? 0,       render: r => n(r.it) },
        { key: "SP",      label: "선적계획",          align: "right", getValue: r => r.shipPlan ?? 0, render: r => n(r.shipPlan) },
        { key: "DAILY",   label: "일 예상판매량",      align: "right", getValue: r => r.daily ?? 0,    render: r => n(r.daily) },
    );

    if (logicMode === "manual") {
        columns.push({ key: "MANUAL_DAILY", label: "매뉴얼 일 예상판매량", align: "right", getValue: r => r.manualDaily ?? 0, render: r => r.manualDaily == null ? "-" : n(r.manualDaily) });
    }

    columns.push(
        { key: "PRED120", label: "120일치 예상판매량", align: "right", getValue: r => r.poPred120 ?? 0, render: r => n(r.poPred120) },
        { key: "NEED45",  label: "45일치 필요재고",    align: "right", getValue: r => r.need45d ?? 0,  render: r => n(r.need45d) },
        {
            key: "FINAL_PO", label: "발주량", align: "right",
            getValue: r => r.finalPoQty ?? 0,
            render: r => n(r.finalPoQty),
            cellClassName: r => r.finalPoQty > 0 ? "!bg-[#ffe0e0] text-[#c62828] font-semibold" : "bg-inherit",
        },
    );

    return columns;
}

export default function PoTable2({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [shipRatio84d, setShipRatio84d] = useState<Record<string, ActualRatio>>({});
    const [forecastMap, setForecastMap] = useState<ForecastMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setShipRatio84d(json.shipRatio84d ?? {});
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));

        fetch("/api/forecast")
            .then(r => r.json())
            .then(json => {
                if (!json.success) return;
                const map: ForecastMap = {};
                for (const row of json.data as ForecastRow[]) {
                    (map[row.SKU] ??= {})[row.YEAR_MONTH] = row.FRCST_STOCK;
                }
                setForecastMap(map);
            });
    }, []);

    const displayRows = useMemo<DisplayRow[]>(() => {
        let calc = computePoCalc(rows, filters.logicMode, shipRatio84d, forecastMap);

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

        // 계산모드와 무관하게 항상 같은 순서(SKU→창고)로 유지. 발주량>0 SKU 우선 표시는 priorityKey로 처리.
        calc.sort((a, b) => a.sku.localeCompare(b.sku) || a.wh.localeCompare(b.wh));

        return calc.map(r => ({
            ...r,
            factory: MAIN_SKU_MAP.get(r.sku)?.Factory ?? "-",
            producing: MAIN_SKU_MAP.get(r.sku)?.IsOn === "TRUE" ? "생산" : "-",
        }));
    }, [rows, filters, shipRatio84d, forecastMap]);

    const skuPoSum = useMemo(() => {
        const map = new Map<string, number>();
        for (const r of displayRows) map.set(r.sku, (map.get(r.sku) ?? 0) + r.finalPoQty);
        return map;
    }, [displayRows]);

    const columns = useMemo(() => buildColumns(filters.logicMode), [filters.logicMode]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable
                columns={columns}
                rows={displayRows}
                rowKey={r => r.key}
                fileName="발주_Table2"
                defaultSort={(a, b) => {
                    const sa = skuPoSum.get(a.sku) ?? 0;
                    const sb = skuPoSum.get(b.sku) ?? 0;
                    if (sa !== sb) return sb - sa;
                    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
                    return b.finalPoQty - a.finalPoQty;
                }}
            />
        </div>
    );
}
