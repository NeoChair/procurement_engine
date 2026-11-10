"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type Ship1Row, type TrendMedianByWhMap } from "@/lib/calc/shipCalc";
import { useLang } from "@/lib/i18n";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

function n(v: number | undefined | null): string { return v == null ? "-" : v.toLocaleString(); }
function pct(v: number): string {
    return `${(v * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildShip1Columns(t: (ko: string, en: string) => string): DataTableColumn<Ship1Row>[] {
    return [
    { key: "SKU",      label: "SKU",         align: "left",  getValue: r => r.sku },
    { key: "WH",       label: t("창고", "Warehouse"),align: "left",  getValue: r => r.wh },
    { key: "CY7",      label: t("올해 7일", "This Year: Last 7 Days Sales"),align: "right", getValue: r => r.cy7 ?? 0,       render: r => n(r.cy7) },
    { key: "CY28",     label: t("올해 28일", "This Year: Last 28 Days Sales"),align: "right", getValue: r => r.cy28 ?? 0,      render: r => n(r.cy28) },
    { key: "CY56",     label: t("올해 56일", "This Year: Last 56 Days Sales"),align: "right", getValue: r => r.cy56 ?? 0,      render: r => n(r.cy56) },
    { key: "MED_W0", label: t("중위값 -30~0일", "Last Year Median (Day -30 to 0)"),align: "right", getValue: r => r.trendWindow?.w0 ?? 0, render: r => n(r.trendWindow?.w0) },
    { key: "MED_W1", label: t("중위값 0~30일", "Last Year Median (Day 0 to 30)"),align: "right", getValue: r => r.trendWindow?.w1 ?? 0, render: r => n(r.trendWindow?.w1) },
    { key: "MED_W2", label: t("중위값 30~60일", "Last Year Median (Day 30 to 60)"),align: "right", getValue: r => r.trendWindow?.w2 ?? 0, render: r => n(r.trendWindow?.w2) },
    { key: "MED_W3", label: t("중위값 60~90일", "Last Year Median (Day 60 to 90)"),align: "right", getValue: r => r.trendWindow?.w3 ?? 0, render: r => n(r.trendWindow?.w3) },
    { key: "MED_W4", label: t("중위값 90~120일", "Last Year Median (Day 90 to 120)"),align: "right", getValue: r => r.trendWindow?.w4 ?? 0, render: r => n(r.trendWindow?.w4) },
    { key: "MED_W5", label: t("중위값 120~150일", "Last Year Median (Day 120 to 150)"),align: "right", getValue: r => r.trendWindow?.w5 ?? 0, render: r => n(r.trendWindow?.w5) },
    { key: "TREND1", label: t("추세1(w1/w0)", "Trend 1 (Day 0 to 30 ÷ Day -30 to 0)"), align: "right", getValue: r => r.trendRatios[0], render: r => pct(r.trendRatios[0]) },
    { key: "TREND2", label: t("추세2(w2/w1)", "Trend 2 (Day 30 to 60 ÷ Day 0 to 30)"), align: "right", getValue: r => r.trendRatios[1], render: r => pct(r.trendRatios[1]) },
    { key: "TREND3", label: t("추세3(w3/w2)", "Trend 3 (Day 60 to 90 ÷ Day 30 to 60)"), align: "right", getValue: r => r.trendRatios[2], render: r => pct(r.trendRatios[2]) },
    { key: "TREND4", label: t("추세4(w4/w3)", "Trend 4 (Day 90 to 120 ÷ Day 60 to 90)"), align: "right", getValue: r => r.trendRatios[3], render: r => pct(r.trendRatios[3]) },
    { key: "TREND5", label: t("추세5(w5/w4)", "Trend 5 (Day 120 to 150 ÷ Day 90 to 120)"), align: "right", getValue: r => r.trendRatios[4], render: r => pct(r.trendRatios[4]) },
    ];
}

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
    const { t } = useLang();
    const columns = useMemo(() => buildShip1Columns(t), [t]);
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [trendMediansByWh, setTrendMediansByWh] = useState<TrendMedianByWhMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setTrendMediansByWh(json.trendMediansByWh ?? {});
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const displayRows = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, undefined, undefined, undefined, undefined, trendMediansByWh);
        return applyFilters(tables.table1, filters);
    }, [rows, filters, trendMediansByWh]);

    if (loading) return <div className="px-2 py-4 text-gray-500">{t("불러오는 중...", "Loading...")}</div>;
    if (error) return <div className="px-2 py-4 text-red-500">{t("오류", "Error")}: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable columns={columns} rows={displayRows} rowKey={r => r.key} fileName={t("선적_Table1", "ShippingPlan_Table1")} />
        </div>
    );
}
