"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { medianTrend, type TrendMedianWindow } from "@/lib/calc/logicMode";
import { useLang } from "@/lib/i18n";

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

/** SKU 단위 판매량 비교 행. PO는 창고 구분이 필요 없으므로 창고별 부분합을 다시 더하지 않고
 *  SUMMARY_QUERY가 이미 SKU 전체로 낸 TOTAL 컬럼을 그대로 쓴다. */
type PoRow = {
    sku: string;
    factory: string;
    producing: string;
    curr7: number;
    curr28: number;
    curr56: number;
    /** 발주 추세용 작년 오늘 -30~+150일 6구간(30일씩) 판매 중위값. 데이터 없으면 undefined. */
    trendWindow: TrendMedianWindow | undefined;
    /** trendWindow로부터 구한 인접 구간 비율 5개(추세1~5). */
    trendRatios: [number, number, number, number, number];
};

function n(v: number | undefined | null): string {
    return v == null ? "-" : v.toLocaleString();
}

function toPoRow(row: SummaryRow, trendMedians: Record<string, TrendMedianWindow>): PoRow {
    const trendWindow = trendMedians[row.SKU];
    const { ratios } = medianTrend(trendWindow);
    return {
        sku: row.SKU,
        factory: factoryOf(row.SKU),
        producing: producingOf(row.SKU),
        curr7: row.CURR_YEAR_1WEEK_TOTAL_SALES_QTY ?? 0,
        curr28: row.CURR_YEAR_1MONTH_TOTAL_SALES_QTY ?? 0,
        curr56: row.CURR_YEAR_2MONTH_TOTAL_SALES_QTY ?? 0,
        trendWindow, trendRatios: ratios,
    };
}

function pct(v: number): string {
    return `${(v * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildColumns(t: (ko: string, en: string) => string): DataTableColumn<PoRow>[] {
    return [
    { key: "SKU",       label: "SKU",                       align: "left",  getValue: (row) => row.sku },
    { key: "CURR_1WEEK",  label: t("올해 과거 7일", "This Year: Last 7 Days Sales"),align: "right", getValue: (row) => row.curr7  ?? 0, render: (row) => n(row.curr7) },
    { key: "CURR_28",     label: t("올해 과거 28일", "This Year: Last 28 Days Sales"),align: "right", getValue: (row) => row.curr28 ?? 0, render: (row) => n(row.curr28) },
    { key: "CURR_56",     label: t("올해 과거 56일", "This Year: Last 56 Days Sales"),align: "right", getValue: (row) => row.curr56 ?? 0, render: (row) => n(row.curr56) },
    { key: "MED_W0", label: t("중위값 -30~0일", "Last Year Median (Day -30 to 0)"),align: "right", getValue: (row) => row.trendWindow?.w0 ?? 0, render: (row) => n(row.trendWindow?.w0) },
    { key: "MED_W1", label: t("중위값 0~30일", "Last Year Median (Day 0 to 30)"),align: "right", getValue: (row) => row.trendWindow?.w1 ?? 0, render: (row) => n(row.trendWindow?.w1) },
    { key: "MED_W2", label: t("중위값 30~60일", "Last Year Median (Day 30 to 60)"),align: "right", getValue: (row) => row.trendWindow?.w2 ?? 0, render: (row) => n(row.trendWindow?.w2) },
    { key: "MED_W3", label: t("중위값 60~90일", "Last Year Median (Day 60 to 90)"),align: "right", getValue: (row) => row.trendWindow?.w3 ?? 0, render: (row) => n(row.trendWindow?.w3) },
    { key: "MED_W4", label: t("중위값 90~120일", "Last Year Median (Day 90 to 120)"),align: "right", getValue: (row) => row.trendWindow?.w4 ?? 0, render: (row) => n(row.trendWindow?.w4) },
    { key: "MED_W5", label: t("중위값 120~150일", "Last Year Median (Day 120 to 150)"),align: "right", getValue: (row) => row.trendWindow?.w5 ?? 0, render: (row) => n(row.trendWindow?.w5) },
    { key: "TREND1", label: t("추세1(w1/w0)", "Trend 1 (Day 0 to 30 ÷ Day -30 to 0)"), align: "right", getValue: (row) => row.trendRatios[0], render: (row) => pct(row.trendRatios[0]) },
    { key: "TREND2", label: t("추세2(w2/w1)", "Trend 2 (Day 30 to 60 ÷ Day 0 to 30)"), align: "right", getValue: (row) => row.trendRatios[1], render: (row) => pct(row.trendRatios[1]) },
    { key: "TREND3", label: t("추세3(w3/w2)", "Trend 3 (Day 60 to 90 ÷ Day 30 to 60)"), align: "right", getValue: (row) => row.trendRatios[2], render: (row) => pct(row.trendRatios[2]) },
    { key: "TREND4", label: t("추세4(w4/w3)", "Trend 4 (Day 90 to 120 ÷ Day 60 to 90)"), align: "right", getValue: (row) => row.trendRatios[3], render: (row) => pct(row.trendRatios[3]) },
    { key: "TREND5", label: t("추세5(w5/w4)", "Trend 5 (Day 120 to 150 ÷ Day 90 to 120)"), align: "right", getValue: (row) => row.trendRatios[4], render: (row) => pct(row.trendRatios[4]) },
    ];
}

export default function PoTable({ filters }: { filters: FilterState }) {
    const { t } = useLang();
    const columns = useMemo(() => buildColumns(t), [t]);
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [trendMedians, setTrendMedians] = useState<Record<string, TrendMedianWindow>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch("/api/salessummary");
                const json = await res.json();
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setTrendMedians(json.trendMedians ?? {});
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const displayRows = useMemo(() => {
        let result = rows.map(row => toPoRow(row, trendMedians));
        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            result = result.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            result = result.filter(r => filters.factory.includes(r.factory));
        }
        result.sort((a, b) => a.sku.localeCompare(b.sku));
        return result;
    }, [rows, filters, trendMedians]);

    if (loading) return <div className="px-2 py-4 text-gray-500">{t("불러오는 중...", "Loading...")}</div>;
    if (error) return <div className="px-2 py-4 text-red-500">{t("오류", "Error")}: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable columns={columns} rows={displayRows} rowKey={(row) => row.sku} fileName={t("발주_Table1", "PurchaseOrder_Table1")} />
        </div>
    );
}
