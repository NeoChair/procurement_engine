"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type Ship2Row, type ForecastMap, type LyWindowMap } from "@/lib/calc/shipCalc";
import type { ActualRatio } from "@/lib/calc/rebalance";
import type { ForecastRow } from "@/app/api/forecast/route";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

function n(v: number | undefined): string { return (v ?? 0).toLocaleString(); }
function nd(v: number | undefined): string {
    return (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v: number | null | undefined): string {
    return v == null ? "-" : `${(v * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// getValue는 컬럼 정렬뿐 아니라 CSV 다운로드 값으로도 그대로 쓰이므로, 이모지 없는 텍스트를 반환해야
// 엑셀에서 숫자(정렬용 코드)나 깨진 이모지 대신 "Red/Yellow/Green"이 그대로 찍힌다.
// dsiStatus가 null(현재고·이동중재고·판매량 전부 0인 죽은 조합)이면 빈칸으로 둔다.
type DsiStatus = Ship2Row["dsiStatus"];
const DSI_STATUS_TEXT: Record<NonNullable<DsiStatus>, string> = { red: "Red", yellow: "Yellow", green: "Green" };
const DSI_STATUS_LABEL: Record<NonNullable<DsiStatus>, string> = { red: "🔴 Red", yellow: "🟡 Yellow", green: "🟢 Green" };
const DSI_STATUS_CLASS: Record<NonNullable<DsiStatus>, string> = {
    red: "!bg-[#ffe0e0] text-[#c62828] font-semibold",
    yellow: "!bg-[#fff8e1] text-[#f57f17] font-semibold",
    green: "!bg-[#e8f5e9] text-[#2e7d32] font-semibold",
};
// 다운로드하는 xlsx에서 Status 셀만 칠할 배경/글자색(엑셀 기본 "빨강/노랑/녹색 텍스트" 조건부서식 팔레트와 동일).
const DSI_STATUS_FILL: Record<NonNullable<DsiStatus>, string> = {
    red: "FFC7CE",
    yellow: "FFEB9C",
    green: "C6EFCE",
};
const DSI_STATUS_FONT: Record<NonNullable<DsiStatus>, string> = {
    red: "9C0006",
    yellow: "9C6500",
    green: "006100",
};

function buildShip2Columns(logicMode: FilterState["logicMode"]): DataTableColumn<Ship2Row>[] {
    const columns: DataTableColumn<Ship2Row>[] = [
        { key: "SKU",      label: "SKU",              align: "left",  getValue: r => r.sku },
        { key: "FACTORY",  label: "제작공장",          align: "left",  getValue: r => r.factory },
        { key: "PROD",     label: "생산여부",          align: "left",  getValue: r => r.producing },
        { key: "WH",       label: "창고",              align: "left",  getValue: r => r.wh },
        { key: "ACTUAL_RATIO", label: "실출고 비율", align: "right", getValue: r => r.actualRatio ?? 0, render: r => pct(r.actualRatio) },
        { key: "OH",       label: "현재고",            align: "right", getValue: r => r.oh ?? 0,        render: r => n(r.oh) },
        { key: "IT",       label: "이동중재고",         align: "right", getValue: r => r.it ?? 0,        render: r => n(r.it) },
        { key: "SP",       label: "선적계획수량",       align: "right", getValue: r => r.shipPlan ?? 0,  render: r => n(r.shipPlan) },
        { key: "DAILY",    label: "1일치 예상출고량",   align: "right", getValue: r => r.manualDaily ?? r.daily ?? 0, render: r => nd(r.manualDaily ?? r.daily) },
        { key: "NEED28",   label: "28일치 예상출고량", align: "right", getValue: r => r.need28d ?? 0,   render: r => n(r.need28d) },
        {
            key: "SHIP_QTY",
            label: "선적량",
            align: "right",
            getValue: r => r.shipQty,
            render: r => n(r.shipQty),
            cellClassName: r => (r.shipQty ?? 0) > 0 ? "!bg-[#ffe0e0] text-[#c62828] font-semibold" : "bg-inherit",
        },
        { key: "WEEK2", label: "선적량 2주", align: "right", getValue: r => r.week2 ?? 0, render: r => n(r.week2) },
        { key: "WEEK3", label: "선적량 3주", align: "right", getValue: r => r.week3 ?? 0, render: r => n(r.week3) },
        { key: "WEEK4", label: "선적량 4주", align: "right", getValue: r => r.week4 ?? 0, render: r => n(r.week4) },
        { key: "WEEK5", label: "선적량 5주", align: "right", getValue: r => r.week5 ?? 0, render: r => n(r.week5) },
        {
            key: "STATUS",
            label: "Status",
            align: "left",
            getValue: r => r.dsiStatus == null ? "" : DSI_STATUS_TEXT[r.dsiStatus],
            render: r => r.dsiStatus == null ? "" : DSI_STATUS_LABEL[r.dsiStatus],
            cellClassName: r => r.dsiStatus == null ? "bg-inherit" : DSI_STATUS_CLASS[r.dsiStatus],
            exportFill: r => r.dsiStatus == null ? undefined : DSI_STATUS_FILL[r.dsiStatus],
            exportFontColor: r => r.dsiStatus == null ? undefined : DSI_STATUS_FONT[r.dsiStatus],
        },
    ];

    if (logicMode === "manual" || logicMode === "default_manual") {
        columns.push({ key: "MANUAL_FLAG", label: "비고", align: "left", getValue: r => r.manualDaily != null ? "매뉴얼" : "", render: r => r.manualDaily != null ? "ℹ️ 매뉴얼" : "" });
    }

    return columns;
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

export default function ShipTable2({ filters }: { filters: FilterState }) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [shipRatio84d, setShipRatio84d] = useState<Record<string, ActualRatio>>({});
    const [forecastMap, setForecastMap] = useState<ForecastMap>({});
    const [lyBackward14d, setLyBackward14d] = useState<LyWindowMap>({});
    const [lyForward14d, setLyForward14d] = useState<LyWindowMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setShipRatio84d(json.shipRatio84d ?? {});
                setLyBackward14d(json.lyBackward14d ?? {});
                setLyForward14d(json.lyForward14d ?? {});
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

    const displayRows = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode, shipRatio84d, forecastMap, lyBackward14d, lyForward14d);
        let r = tables.table2.filter(row => MAIN_SKU_MAP.get(row.sku)?.IsOn !== "FALSE");
        r = applyFilters(r, filters);
        // 계산모드/재배분과 무관하게 항상 같은 순서(SKU→창고)로 유지해야, 사용자가 컬럼 정렬 중일 때
        // 동점 행들의 순서가 계산모드 변경만으로 뒤섞이지 않는다. 선적량 큰 순 기본표시는 defaultSort로 처리.
        r = [...r].sort((a, b) => a.sku.localeCompare(b.sku) || a.wh.localeCompare(b.wh));
        return r;
    }, [rows, filters, shipRatio84d, forecastMap, lyBackward14d, lyForward14d]);

    const columns = useMemo(() => buildShip2Columns(filters.logicMode), [filters.logicMode]);

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <DataTable
                columns={columns}
                rows={displayRows}
                rowKey={r => r.key}
                fileName="선적_Table2"
                defaultSort={(a, b) => {
                    if ((a.shipQty > 0) !== (b.shipQty > 0)) return a.shipQty > 0 ? -1 : 1;
                    return b.shipQty - a.shipQty;
                }}
            />
        </div>
    );
}
