"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { WH_GROUPS, type WhKey, type LyWindowMap } from "@/lib/calc/shipCalc";
import { RATIO_WAREHOUSES, type RatioWh } from "@/lib/calc/rebalance";

const WAREHOUSES = ["CA", "GA", "NJ", "TX", "WF"] as const;
type Warehouse = (typeof WAREHOUSES)[number];

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };

function sumParts(r: SummaryRow, parts: string[], suffix: string): number {
    return parts.reduce((acc, p) => {
        const key = `${p}_${suffix}` as keyof SummaryRow;
        return acc + ((r[key] as number) ?? 0);
    }, 0);
}

const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map((record) => [record.SKU, record])
);

function factoryOf(sku: string): string {
    return MAIN_SKU_MAP.get(sku)?.Factory || "-";
}

function producingOf(sku: string): string {
    return MAIN_SKU_MAP.get(sku)?.IsOn === "TRUE" ? "생산" : "-";
}

/** 창고별 원본 판매 비교치 (SKU 통합 전 중간 형태). */
type PoRowByWh = {
    sku: string;
    warehouse: Warehouse;
    /** 작년 동일 시점 기준 forward 14일 실제 판매수량. RATIO_WAREHOUSES(CA/TX/NJ/GA) 대상 외(WF)는 null. */
    lyForward14: number | null;
    /** 작년 동일 시점 기준 backward 14일 실제 판매수량. RATIO_WAREHOUSES(CA/TX/NJ/GA) 대상 외(WF)는 null. */
    lyBackward14: number | null;
    curr7: number;
    curr28: number;
    curr56: number;
};

/** SKU 단위로 합산한 판매량 비교 행. */
type PoRow = {
    sku: string;
    factory: string;
    producing: string;
    lyForward14: number | null;
    lyBackward14: number | null;
    curr7: number;
    curr28: number;
    curr56: number;
};

function n(v: number | undefined | null): string {
    return v == null ? "-" : v.toLocaleString();
}

function expandRow(row: SummaryRow, wh: Warehouse, lyBackward14d: LyWindowMap, lyForward14d: LyWindowMap): PoRowByWh {
    const { parts } = WH_GROUPS[wh as WhKey];

    const lyForward14 = RATIO_WAREHOUSES.includes(wh as RatioWh)
        ? lyForward14d[row.SKU]?.[wh as RatioWh] ?? 0
        : null;
    const lyBackward14 = RATIO_WAREHOUSES.includes(wh as RatioWh)
        ? lyBackward14d[row.SKU]?.[wh as RatioWh] ?? 0
        : null;

    return {
        sku: row.SKU,
        warehouse: wh,
        lyForward14,
        lyBackward14,
        curr7:  sumParts(row, parts, "CURR_YEAR_1WEEK_SALES_QTY"),
        curr28: sumParts(row, parts, "CURR_YEAR_1MONTH_SALES_QTY"),
        curr56: sumParts(row, parts, "CURR_YEAR_2MONTH_SALES_QTY"),
    };
}

function aggregateBySku(rows: PoRowByWh[]): PoRow[] {
    const map = new Map<string, PoRow>();

    for (const r of rows) {
        const cur = map.get(r.sku) ?? {
            sku: r.sku,
            factory: factoryOf(r.sku),
            producing: producingOf(r.sku),
            lyForward14: null, lyBackward14: null,
            curr7: 0, curr28: 0, curr56: 0,
        };

        if (r.lyForward14 != null) cur.lyForward14 = (cur.lyForward14 ?? 0) + r.lyForward14;
        if (r.lyBackward14 != null) cur.lyBackward14 = (cur.lyBackward14 ?? 0) + r.lyBackward14;
        cur.curr7 += r.curr7;
        cur.curr28 += r.curr28;
        cur.curr56 += r.curr56;

        map.set(r.sku, cur);
    }

    return [...map.values()];
}

const COLUMNS: DataTableColumn<PoRow>[] = [
    { key: "SKU",       label: "SKU",                       align: "left",  getValue: (row) => row.sku },
    { key: "FACTORY",   label: "제작공장",                  align: "left",  getValue: (row) => row.factory },
    { key: "PRODUCING", label: "생산여부",                  align: "left",  getValue: (row) => row.producing },
    { key: "LY_FWD14",  label: "작년 오늘 +28일",                align: "right", getValue: (row) => row.lyForward14 ?? 0, render: (row) => n(row.lyForward14) },
    { key: "LY_BACK14", label: "작년 오늘 -28일",                align: "right", getValue: (row) => row.lyBackward14 ?? 0, render: (row) => n(row.lyBackward14) },
    { key: "CURR_1WEEK",  label: "올해 과거 7일",           align: "right", getValue: (row) => row.curr7  ?? 0, render: (row) => n(row.curr7) },
    { key: "CURR_28",     label: "올해 과거 28일",          align: "right", getValue: (row) => row.curr28 ?? 0, render: (row) => n(row.curr28) },
    { key: "CURR_56",     label: "올해 과거 56일",          align: "right", getValue: (row) => row.curr56 ?? 0, render: (row) => n(row.curr56) },
];

export default function PoTable({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [lyBackward14d, setLyBackward14d] = useState<LyWindowMap>({});
    const [lyForward14d, setLyForward14d] = useState<LyWindowMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch("/api/salessummary");
                const json = await res.json();
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setLyBackward14d(json.lyBackward14d ?? {});
                setLyForward14d(json.lyForward14d ?? {});
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const displayRows = useMemo(() => {
        let byWh = rows.flatMap((row) => WAREHOUSES.map((wh) => expandRow(row, wh, lyBackward14d, lyForward14d)));
        if (filters.warehouse.length > 0) {
            byWh = byWh.filter(r => filters.warehouse.includes(r.warehouse));
        }

        let result = aggregateBySku(byWh);
        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            result = result.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            result = result.filter(r => filters.factory.includes(r.factory));
        }
        result.sort((a, b) => a.sku.localeCompare(b.sku));
        return result;
    }, [rows, filters, lyBackward14d, lyForward14d]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable columns={COLUMNS} rows={displayRows} rowKey={(row) => row.sku} fileName="발주_Table1" />
        </div>
    );
}
