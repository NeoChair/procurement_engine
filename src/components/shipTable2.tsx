"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, WH_GROUPS, type Ship2Row, type ForecastMap, type TrendMedianByWhMap } from "@/lib/calc/shipCalc";
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
    const lt = WH_GROUPS[r.wh].lt;
    const avail = (r.oh ?? 0) + (r.it ?? 0) + (r.shipPlan ?? 0);
    const need28 = r.need28d ?? 0;
    const computedBase: Record<WeekField, number> = {
        shipQty: r.shipQty ?? 0, week2: r.week2 ?? 0, week3: r.week3 ?? 0, week4: r.week4 ?? 0, week5: r.week5 ?? 0,
    };

    const values = {} as Record<WeekField, number>;
    const overridden = {} as Record<WeekField, boolean>;
    const proj: number[] = [Math.max(0, avail - daily * lt)];

    let prevProjected = proj[0];
    let prevShip = 0;
    WEEK_FIELDS.forEach((f, i) => {
        let computed: number;
        if (i === 0) {
            computed = computedBase.shipQty;
        } else {
            const projectedThisWeek = prevProjected + prevShip - daily * 7;
            computed = Math.round(Math.min(Math.max(0, need28 - projectedThisWeek), Math.max(0, need28)));
            prevProjected = Math.max(0, projectedThisWeek);
            proj.push(prevProjected);
        }
        const overrideVal = ov?.[f];
        const effective = overrideVal ?? computed;
        values[f] = effective;
        overridden[f] = overrideVal != null;
        prevShip = effective;
    });

    return { values, overridden, proj };
}

/** WH_GROUPS(창고별 리드타임)를 엑셀 IF-체인 문자열로 펼친다. 별도 "리드타임" 컬럼을 안 두고
 *  이 식을 초기 예상재고 수식에 바로 박아 넣는 이유: 도움 컬럼 두 개가 나란히(연속으로) 숨김 처리되면
 *  ExcelJS가 xlsx로 저장할 때 뒤 컬럼의 hidden 속성을 누락시키는 버그가 있어서, 숨김 컬럼끼리 붙지
 *  않도록(항상 보이는 week 컬럼이 사이에 오도록) 구성해야 한다. */
function ltFormulaExpr(row: number): string {
    const entries = Object.entries(WH_GROUPS) as [string, { lt: number }][];
    let expr = `${entries[entries.length - 1][1].lt}`;
    for (let i = entries.length - 2; i >= 0; i--) {
        const [wh, { lt }] = entries[i];
        expr = `IF(C${row}="${wh}",${lt},${expr})`;
    }
    return expr;
}

/** 사람이 직접 고친 셀 표시(볼드+회색). 상태색(빨강 선적량 강조, Status 등)보다 우선한다 —
 *  "이 숫자는 자동계산이 아니라 내가 입력한 값"이라는 게 더 중요한 정보라서. */
const OVERRIDE_CLASS = "!bg-gray-200 text-gray-900 font-bold";

function buildShip2Columns(
    logicMode: FilterState["logicMode"],
    overrides: Record<string, RowOverride>,
    onEdit: (key: string, field: WeekField, value: number | null) => void,
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
        { key: "FACTORY",  label: "제작공장",          align: "left",  getValue: r => r.factory },
        { key: "WH",       label: "창고",              align: "left",  getValue: r => r.wh },
        { key: "ACTUAL_RATIO", label: "실출고 비율", align: "right", getValue: r => r.actualRatio ?? 0, render: r => pct(r.actualRatio) },
        { key: "OH",       label: "현재고",            align: "right", getValue: r => r.oh ?? 0,        render: r => n(r.oh) },
        { key: "IT",       label: "이동중재고",         align: "right", getValue: r => r.it ?? 0,        render: r => n(r.it) },
        { key: "SP",       label: "생산계획수량",       align: "right", getValue: r => r.shipPlan ?? 0,  render: r => n(r.shipPlan) },
        { key: "DAILY",    label: "1일치 예상출고량",   align: "right", getValue: r => r.manualDaily ?? r.daily ?? 0, render: r => nd(r.manualDaily ?? r.daily) },
        { key: "NEED28",   label: "28일치 예상출고량", align: "right", getValue: r => r.need28d ?? 0,   render: r => n(r.need28d) },
        { ...weekColumn("shipQty", "선적량"), key: "SHIP_QTY" },
        // -- 아래 4개는 xlsx 다운로드에서 2~5주차 선적량을 살아있는 수식으로 재현하기 위한 도움 컬럼(화면엔 안 보임).
        // 숨김 컬럼끼리 나란히 붙으면 ExcelJS 저장 버그로 뒤엣것의 숨김이 풀리므로, 항상 보이는 week 컬럼을 사이에 둔다. --
        {
            key: "INIT_PROJ", label: "초기 예상재고", hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[0],
            getFormula: (_r, row) => `=MAX(0,(E${row}+F${row}+G${row})-H${row}*(${ltFormulaExpr(row)}))`,
        },
        {
            ...weekColumn("week2", "선적량 2주"), key: "WEEK2",
            getFormula: (r, row) => computeEffective(r, overrides[r.key]).overridden.week2
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(K${row}+J${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W2", label: "2주차 이후 예상재고", hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[1],
            getFormula: (_r, row) => `=MAX(0,K${row}+J${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week3", "선적량 3주"), key: "WEEK3",
            getFormula: (r, row) => computeEffective(r, overrides[r.key]).overridden.week3
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(M${row}+L${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W3", label: "3주차 이후 예상재고", hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[2],
            getFormula: (_r, row) => `=MAX(0,M${row}+L${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week4", "선적량 4주"), key: "WEEK4",
            getFormula: (r, row) => computeEffective(r, overrides[r.key]).overridden.week4
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(O${row}+N${row}-H${row}*7)),MAX(0,I${row})),0)`,
        },
        {
            key: "PROJ_W4", label: "4주차 이후 예상재고", hiddenInView: true,
            getValue: r => computeEffective(r, overrides[r.key]).proj[3],
            getFormula: (_r, row) => `=MAX(0,O${row}+N${row}-H${row}*7)`,
        },
        {
            ...weekColumn("week5", "선적량 5주"), key: "WEEK5",
            getFormula: (r, row) => computeEffective(r, overrides[r.key]).overridden.week5
                ? undefined
                : `=ROUND(MIN(MAX(0,I${row}-(Q${row}+P${row}-H${row}*7)),MAX(0,I${row})),0)`,
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
    const [trendMediansByWh, setTrendMediansByWh] = useState<TrendMedianByWhMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setRows(json.data as SummaryRow[]);
                setShipRatio84d(json.shipRatio84d ?? {});
                setTrendMediansByWh(json.trendMediansByWh ?? {});
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
        const tables = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode, shipRatio84d, forecastMap, trendMediansByWh);
        let r = tables.table2.filter(row => MAIN_SKU_MAP.get(row.sku)?.IsOn !== "FALSE");
        r = applyFilters(r, filters);
        // 계산모드/재배분과 무관하게 항상 같은 순서(SKU→창고)로 유지해야, 사용자가 컬럼 정렬 중일 때
        // 동점 행들의 순서가 계산모드 변경만으로 뒤섞이지 않는다. 선적량 큰 순 기본표시는 defaultSort로 처리.
        r = [...r].sort((a, b) => a.sku.localeCompare(b.sku) || a.wh.localeCompare(b.wh));
        return r;
    }, [rows, filters, shipRatio84d, forecastMap, trendMediansByWh]);

    const columns = useMemo(
        () => buildShip2Columns(filters.logicMode, overrides, handleEdit),
        [filters.logicMode, overrides],
    );

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
