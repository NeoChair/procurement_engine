"use client";

import { useEffect, useMemo, useState } from "react";
import { baseDateFromGathDe } from "@/lib/snapshot";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type Ship2Row } from "@/lib/calc/shipCalc";
import type { CapReportRow } from "@/lib/calc/capacity";
import { useSalesSummary, useForecastMap, EMPTY_SUMMARY } from "@/lib/queries";
import { isWhOn } from "@/lib/calc/skuRules";
import { useLang } from "@/lib/i18n";

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

/** 화면에서 사람이 직접 고칠 수 있는 필드. SKU+창고(row.key)별로 필드 단위 오버라이드를 둔다.
 *  세션 임시 상태일 뿐 서버/DB에는 저장하지 않는다 — 새로고침하면 사라진다. */
type WeekField = "shipQty" | "week2" | "week3" | "week4" | "week5";
type RowOverride = Partial<Record<WeekField, number>>;
const WEEK_FIELDS: WeekField[] = ["shipQty", "week2", "week3", "week4", "week5"];

/** rollMultiWeek(shipCalc.ts)과 동일한 롤링 계산을, 사람이 고친 주차를 반영해서 다시 굴린다.
 *  각 주차는 "바로 앞 주차의 실제 값(오버라이드가 있으면 그 값, 없으면 계산값) + 그 시점 예상재고"만
 *  참조하므로, 어느 주차를 고치든 그 뒤 주차들은 자동으로 새 값을 반영해서 이어진다 — xlsx로 내려받을 때
 *  쓰는 수식 체인과 동일한 규칙. proj[0]=리드타임 지난 시점 초기 예상재고, proj[1..3]=2~4주차 이후 예상재고
 *  (도움 컬럼 캐시값으로 쓰인다). overridden은 그 필드를 "사람이 직접" 고쳤는지 여부(화면 강조용). */
function computeEffective(r: Ship2Row, ov: RowOverride | undefined) {
    const daily = r.manualDaily ?? r.daily ?? 0;
    // 리드타임 소요량은 엔진(shipCalc)이 계산한 predPeriod를 그대로 쓴다 — 1주차 선적량과 같은 기준이어야
    // 1주차↔2~5주차가 이어진다(daily×lt로 다시 계산하면 추세 구간별 합산과 달라져서 어긋남).
    const predPeriod = r.predPeriod ?? 0;
    const avail = (r.oh ?? 0) + (r.it ?? 0) + (r.shipPlan ?? 0);
    const need28 = r.need28d ?? 0;
    // MAIN_SKU에서 이 창고가 FALSE면 2~5주차 계산값도 0(사람이 직접 입력한 값은 그대로 존중).
    const whOn = isWhOn(r.sku, r.wh);
    const computedBase: Record<WeekField, number> = {
        shipQty: r.shipQty ?? 0, week2: r.week2 ?? 0, week3: r.week3 ?? 0, week4: r.week4 ?? 0, week5: r.week5 ?? 0,
    };

    const values = {} as Record<WeekField, number>;
    const overridden = {} as Record<WeekField, boolean>;
    const proj: number[] = [Math.max(0, avail - predPeriod)];

    let prevProjected = proj[0];
    let prevShip = 0;
    // 앞 주차를 사람이 고치지 않았으면 엔진 값을 그대로 쓴다 — 엔진 값엔 캐파 줄임이 들어 있어서
    // 여기서 다시 굴리면 캐파가 풀린다. (캐파가 없으면 엔진 값과 다시 굴린 값은 같다.)
    let editedBefore = false;
    WEEK_FIELDS.forEach((f, i) => {
        let computed: number;
        if (i === 0) {
            computed = computedBase.shipQty;
        } else {
            const projectedThisWeek = prevProjected + prevShip - daily * 7;
            computed = !editedBefore
                ? computedBase[f]
                : whOn ? Math.round(Math.min(Math.max(0, need28 - projectedThisWeek), Math.max(0, need28))) : 0;
            prevProjected = Math.max(0, projectedThisWeek);
            proj.push(prevProjected);
        }
        const overrideVal = ov?.[f];
        const effective = overrideVal ?? computed;
        values[f] = effective;
        overridden[f] = overrideVal != null;
        if (overrideVal != null) editedBefore = true;
        prevShip = effective;
    });

    return { values, overridden, proj };
}


/** 사람이 직접 고친 셀 표시(볼드+회색). 상태색(빨강 선적량 강조, Status 등)보다 우선한다 —
 *  "이 숫자는 자동계산이 아니라 내가 입력한 값"이라는 게 더 중요한 정보라서. */
const OVERRIDE_CLASS = "!bg-gray-200 text-gray-900 font-bold";

function buildShip2Columns(
    logicMode: FilterState["logicMode"],
    rebalance: boolean,
    overrides: Record<string, RowOverride>,
    onEdit: (key: string, field: WeekField, value: number | null) => void,
    t: (ko: string, en: string) => string,
): DataTableColumn<Ship2Row>[] {
    function weekColumn(field: WeekField, label: string): DataTableColumn<Ship2Row> {
        return {
            key: field.toUpperCase(),
            label,
            align: "right",
            getValue: r => computeEffective(r, overrides[r.key]).values[field],
            render: r => n(computeEffective(r, overrides[r.key]).values[field]),
            cellClassName: r => {
                const { values, overridden } = computeEffective(r, overrides[r.key]);
                if (overridden[field]) return OVERRIDE_CLASS;
                if (field === "shipQty") return values.shipQty > 0 ? "!bg-[#ffe0e0] text-[#c62828] font-semibold" : "bg-inherit";
                return "bg-inherit";
            },
            editable: () => true,
            onEdit: (r, value) => onEdit(r.key, field, value),
        };
    }

    const columns: DataTableColumn<Ship2Row>[] = [
        { key: "SKU",      label: "SKU",              align: "left",  getValue: r => r.sku },
        { key: "FACTORY",  label: t("제작공장", "Factory"),align: "left",  getValue: r => r.factory },
        { key: "WH",       label: t("창고", "Warehouse"),align: "left",  getValue: r => r.wh },
        { key: "ACTUAL_RATIO", label: t("실출고 비율", "Actual Outbound Ratio"), align: "right", getValue: r => r.actualRatio ?? 0, render: r => pct(r.actualRatio) },
        { key: "OH",       label: t("현재고", "On-Hand"),align: "right", getValue: r => r.oh ?? 0,        render: r => n(r.oh) },
        { key: "IT",       label: t("이동중재고", "In-Transit"),align: "right", getValue: r => r.it ?? 0,        render: r => n(r.it) },
        { key: "SP",       label: t("생산계획수량", "Stuffing Plan"),align: "right", getValue: r => r.shipPlan ?? 0,  render: r => n(r.shipPlan) },
        { key: "DAILY",    label: t("1일치 예상출고량", "Daily Forecast Outbound"),align: "right", getValue: r => r.manualDaily ?? r.daily ?? 0, render: r => nd(r.manualDaily ?? r.daily) },
        { key: "NEED28",   label: t("28일치 예상출고량", "28-Day Forecast Outbound"), align: "right", getValue: r => r.need28d ?? 0,   render: r => n(r.need28d) },
        // J열: 리드타임 기간 동안 예상 소요량(엔진 predPeriod). 1주차 선적량과 엑셀 초기 예상재고가 모두 이 값을 쓴다.
        {
            key: "PRED_PERIOD", label: t("리드타임 소요량", "Lead-Time Demand"), align: "right",
            getValue: r => r.predPeriod ?? 0, render: r => n(r.predPeriod),
        },
        // K열: 1주차 선적량 = MIN(MAX(0, 28일치 − (가용재고 − 리드타임 소요량)), 28일치).
        // 재배분(Rebalance)이 켜져 있으면 재배분 결과라서 수식으로 재현할 수 없으므로 값 그대로 둔다.
        {
            ...weekColumn("shipQty", t("선적량", "Shipping Plan Qty")), key: "SHIP_QTY",
            getFormula: (r, row) => (rebalance || r.capAdjusted || computeEffective(r, overrides[r.key]).overridden.shipQty || !isWhOn(r.sku, r.wh))
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-((E${row}+F${row}+G${row})-J${row})),MAX(0,I${row})),0)`,
        },
        // -- 아래 4개는 xlsx 다운로드에서 2~5주차 선적량을 살아있는 수식으로 재현하기 위한 도움 컬럼(화면엔 안 보임).
        // 숨김 컬럼끼리 나란히 붙으면 ExcelJS 저장 버그로 뒤엣것의 숨김이 풀리므로, 항상 보이는 week 컬럼을 사이에 둔다. --
        {
            key: "INIT_PROJ", label: t("초기 예상재고", "Initial Projected Stock"), hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[0],
            getFormula: (_r, row) => `=MAX(0,(E${row}+F${row}+G${row})-J${row})`,
        },
        {
            ...weekColumn("week2", t("선적량 2주", "Shipping Plan Qty Week 2")), key: "WEEK2",
            getFormula: (r, row) => (r.capAdjusted || computeEffective(r, overrides[r.key]).overridden.week2 || !isWhOn(r.sku, r.wh))
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(L${row}+K${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W2", label: t("2주차 이후 예상재고", "Projected Stock after Week 2"), hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[1],
            getFormula: (_r, row) => `=MAX(0,L${row}+K${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week3", t("선적량 3주", "Shipping Plan Qty Week 3")), key: "WEEK3",
            getFormula: (r, row) => (r.capAdjusted || computeEffective(r, overrides[r.key]).overridden.week3 || !isWhOn(r.sku, r.wh))
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(N${row}+M${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W3", label: t("3주차 이후 예상재고", "Projected Stock after Week 3"), hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[2],
            getFormula: (_r, row) => `=MAX(0,N${row}+M${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week4", t("선적량 4주", "Shipping Plan Qty Week 4")), key: "WEEK4",
            getFormula: (r, row) => (r.capAdjusted || computeEffective(r, overrides[r.key]).overridden.week4 || !isWhOn(r.sku, r.wh))
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(P${row}+O${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W4", label: t("4주차 이후 예상재고", "Projected Stock after Week 4"), hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[3],
            getFormula: (_r, row) => `=MAX(0,P${row}+O${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week5", t("선적량 5주", "Shipping Plan Qty Week 5")), key: "WEEK5",
            getFormula: (r, row) => (r.capAdjusted || computeEffective(r, overrides[r.key]).overridden.week5 || !isWhOn(r.sku, r.wh))
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(R${row}+Q${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
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

    columns.push({
        // 기준판매량에 쓴 식: 7일 중앙값 0이라 평균값 식이 더 커서 쓴 행만 "평균", 나머지는 "중앙값".
        key: "BASE_RULE", label: t("기준", "Base"), align: "left",
        getValue: r => r.avgWins ? t("평균", "Average") : t("중앙값", "Median"),
        cellClassName: r => r.avgWins ? "!bg-[#e3f2fd] text-[#1565c0] font-semibold" : "bg-inherit",
    });
    columns.push({
        // 캐파로 1주차를 줄인 경우만: 줄인 보유 일수, 추세까지 줄였으면 추세 변화.
        key: "CAP_NOTE", label: t("캐파", "Capacity"), align: "left",
        getValue: r => r.capLabels[0] ?? "",
        cellClassName: r => r.capLabels[0] ? "!bg-[#fff3e0] text-[#e65100] font-semibold" : "bg-inherit",
    });

    if (logicMode === "manual" || logicMode === "default_manual") {
        columns.push({ key: "MANUAL_FLAG", label: t("비고", "Note"), align: "left", getValue: r => r.manualDaily != null ? t("매뉴얼", "Manual") : "", render: r => r.manualDaily != null ? `ℹ️ ${t("매뉴얼", "Manual")}` : "" });
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
    const { t } = useLang();
    const summaryQuery = useSalesSummary(filters.gathDe);
    const forecastMap = useForecastMap();
    const { data: rows, shipRatio84d, trendMediansByWh } = summaryQuery.data ?? EMPTY_SUMMARY;
    const loading = summaryQuery.isPending;
    const error = summaryQuery.error?.message ?? null;
    // SKU+창고(row.key)별 사람이 직접 고친 선적량/2~5주차. 세션 임시 상태 — DB에는 저장하지 않는다.
    const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});

    function handleEdit(key: string, field: WeekField, value: number | null) {
        setOverrides(prev => {
            const rowOv = { ...(prev[key] ?? {}) };
            if (value == null || Number.isNaN(value)) delete rowOv[field];
            else rowOv[field] = value;
            const next = { ...prev };
            if (Object.keys(rowOv).length === 0) delete next[key];
            else next[key] = rowOv;
            return next;
        });
    }

    const displayRows = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode, shipRatio84d, forecastMap, trendMediansByWh, baseDateFromGathDe(filters.gathDe),
            { enabled: true, capacity: filters.capacity });
        // 창고별 FALSE 행도 숨기지 않고 선적량 0으로 보여준다(계산은 shipCalc에서 0 처리).
        let r = tables.table2.filter(row => MAIN_SKU_MAP.get(row.sku)?.IsOn !== "FALSE");
        r = applyFilters(r, filters);
        // 계산모드/재배분과 무관하게 항상 같은 순서(SKU→창고)로 유지해야, 사용자가 컬럼 정렬 중일 때
        // 동점 행들의 순서가 계산모드 변경만으로 뒤섞이지 않는다. 선적량 큰 순 기본표시는 defaultSort로 처리.
        r = [...r].sort((a, b) => a.sku.localeCompare(b.sku) || a.wh.localeCompare(b.wh));
        return { rows: r, capReport: tables.capReport, capSkipped: tables.capSkippedByRebalance };
    }, [rows, filters, shipRatio84d, forecastMap, trendMediansByWh]);

    const columns = useMemo(
        () => buildShip2Columns(filters.logicMode, filters.rebalance, overrides, handleEdit, t),
        [filters.logicMode, filters.rebalance, overrides, t],
    );

    if (loading) return <div className="px-2 py-4 text-gray-500">{t("불러오는 중...", "Loading...")}</div>;
    if (error) return <div className="px-2 py-4 text-red-500">{t("오류", "Error")}: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            {Object.keys(filters.capacity).length > 0 && (
                <CapacityReport report={displayRows.capReport} skipped={displayRows.capSkipped} />
            )}
            <DataTable
                columns={columns}
                rows={displayRows.rows}
                rowKey={r => r.key}
                fileName={t("선적_Table2", "ShippingPlan_Table2")}
                defaultSort={(a, b) => {
                    if ((a.shipQty > 0) !== (b.shipQty > 0)) return a.shipQty > 0 ? -1 : 1;
                    return b.shipQty - a.shipQty;
                }}
            />
        </div>
    );
}

/** ④ 증감배수까지 빼도 캐파를 넘는 공장·주차만 경고한다 (넘치지 않으면 아무것도 안 보임). */
function CapacityReport({ report, skipped }: { report: CapReportRow[]; skipped: boolean }) {
    const { t } = useLang();
    if (skipped) {
        return <div className="mb-4 rounded-md bg-[#fff8e1] px-4 py-3 text-sm font-semibold text-[#f57f17]">⚠️ {t("선적 비율 재배분이 켜져 있어 캐파 상한을 적용하지 않았습니다.", "Capacity limit not applied because rebalancing is ON.")}</div>;
    }
    const overs = report.filter(r => r.over);
    if (overs.length === 0) return null;
    return (
        <div className="mb-4 rounded-md bg-[#ffe0e0] px-4 py-3 text-sm font-semibold text-[#c62828]">
            ⚠️ {t("증감배수까지 빼도 캐파를 넘습니다 — 공장 캐파가 평소 판매도 감당하지 못하는 상황입니다", "Still over capacity after removing the trend multiplier — capacity cannot cover base demand")}:{" "}
            {overs.map(r => `${r.factory} ${r.week}${t("주", "W")} (${r.shipped.toLocaleString()} / ${r.cap.toLocaleString()})`).join(", ")}
        </div>
    );
}
