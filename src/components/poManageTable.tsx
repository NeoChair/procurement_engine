"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import type { IntransitPoRow, PlanPoRow } from "@/app/api/pomanage/route";
import type { FilterState } from "@/components/sidebarFilters";

type Source = "intransit" | "plan";

/** 이동중재고/선적계획 두 테이블을 화면 표시용으로 정규화한 SKU 단위 라인. */
type PoDetailRow = {
    source: Source;
    poNo: string;
    sku: string;
    wrhs: string;
    qty: number;
    etd: string | null;
    eta: string | null;
    contNo: string | null;
    suplFact: string | null;
    yearWeek: string | null;
    gathDe: string | null;
};

/** PO 번호 단위 마스터 행(펼치기 전 요약). */
type PoMasterRow = {
    poNo: string;
    sources: Source[];
    totalQty: number;
    warehouses: string[];
    factories: string[];
    etdMin: string | null;
    etaMax: string | null;
    details: PoDetailRow[];
};

// TB_INTRANSIT_STOCK_DAIL / TB_SHIPPING_PLAN_STOCK의 WRHS_NM 원본 코드 -> 사람이 읽는 창고명.
// salessummary/route.ts의 생산계획(SP) 창고 코드 매핑과 동일한 기준을 쓴다.
const WRHS_LABELS: Record<string, string> = {
    "0": "WF",
    "14361": "CA1",
    "14630": "CA",
    "14631": "CA2",
    "14632": "GA",
    "14633": "GA2",
    "14634": "NJ",
    "14635": "SC",
    "14636": "TX",
};

function whLabel(code: string): string {
    return WRHS_LABELS[code] ?? code;
}

// 사이드바 "창고 필터"(CA/GA/NJ/TX/WF 5개 그룹) 매칭용. shipCalc.ts의 WH_GROUPS와 동일하게 CA/CA2->CA, GA/GA2/SC->GA로 묶는다.
const WRHS_GROUPS: Record<string, string> = {
    "0": "WF",
    "14361": "CA",
    "14630": "CA",
    "14631": "CA",
    "14632": "GA",
    "14633": "GA",
    "14634": "NJ",
    "14635": "GA",
    "14636": "TX",
};

function whGroup(code: string): string {
    return WRHS_GROUPS[code] ?? code;
}

// TB_INTRANSIT_STOCK_DAIL의 SUPL_FACT(공급공장) 코드 -> 공장 약칭.
const SUPL_FACT_LABELS: Record<string, string> = {
    "2644": "HR",
    "17253": "MD",
    "2645": "MT",
    "20963": "TYJ",
    "10914": "DMS",
};

function suplFactLabel(code: string | null): string {
    if (!code) return "-";
    return SUPL_FACT_LABELS[code] ?? code;
}

// TB_INTRANSIT_STOCK_DAIL는 "20260924"(구분자 없음), TB_SHIPPING_PLAN_STOCK은 "2026-09-27" 형식으로
// 날짜를 서로 다르게 담고 있어, 둘 다 YYYYMMDD 8자리로 정규화한 뒤 다시 조립한다.
function toYmd8(v: string | null): string | null {
    if (!v) return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    if (/^\d{8}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}

function fmtDate(v: string | null): string {
    const ymd = toYmd8(v);
    if (!ymd) return "-";
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 정렬용 키. 빈 값은 정렬 시 맨 뒤로 가도록 최댓값을 준다. */
function etdSortKey(v: string | null): string {
    return toYmd8(v) ?? "99999999";
}

function n(v: number): string {
    return v.toLocaleString();
}

function toDetailRows(intransit: IntransitPoRow[], plan: PlanPoRow[]): PoDetailRow[] {
    const fromIntransit: PoDetailRow[] = intransit.map((r) => ({
        source: "intransit",
        poNo: r.PO_NO,
        sku: r.ITM_ID,
        wrhs: r.WRHS_NM ?? "-",
        qty: r.QTY ?? 0,
        etd: r.ETD,
        eta: r.ETA,
        contNo: r.CONT_NO,
        suplFact: r.SUPL_FACT,
        yearWeek: null,
        gathDe: r.GATH_DE,
    }));

    const fromPlan: PoDetailRow[] = plan.map((r) => ({
        source: "plan",
        poNo: r.PO_NO,
        sku: r.ITM_ID,
        wrhs: r.WRHS_NM ?? "-",
        qty: r.QTY ?? 0,
        etd: r.ETD,
        eta: r.ETA,
        contNo: null,
        suplFact: r.SUPL_FACT,
        yearWeek: r.YEAR_WEEK_NO,
        gathDe: r.GATH_DE,
    }));

    return [...fromIntransit, ...fromPlan];
}

function toMasterRows(details: PoDetailRow[]): PoMasterRow[] {
    const byPo = new Map<string, PoDetailRow[]>();
    for (const row of details) {
        if (!byPo.has(row.poNo)) byPo.set(row.poNo, []);
        byPo.get(row.poNo)!.push(row);
    }

    const masters: PoMasterRow[] = [];
    for (const [poNo, rows] of byPo) {
        const whSet = new Set(rows.map((r) => r.wrhs).filter((w) => w && w !== "-").map(whLabel));
        const factorySet = new Set(rows.map((r) => suplFactLabel(r.suplFact)).filter((f) => f && f !== "-"));
        const sourceSet = new Set(rows.map((r) => r.source));
        const etds = rows.map((r) => r.etd).filter((v): v is string => !!v).sort();
        const etas = rows.map((r) => r.eta).filter((v): v is string => !!v).sort();

        masters.push({
            poNo,
            sources: [...sourceSet],
            totalQty: rows.reduce((sum, r) => sum + r.qty, 0),
            warehouses: [...whSet],
            factories: [...factorySet],
            etdMin: etds[0] ?? null,
            etaMax: etas[etas.length - 1] ?? null,
            details: rows.sort((a, b) => a.sku.localeCompare(b.sku) || a.wrhs.localeCompare(b.wrhs)),
        });
    }

    return masters.sort((a, b) => etdSortKey(a.etdMin).localeCompare(etdSortKey(b.etdMin)));
}

function SourceBadge({ source }: { source: Source }) {
    const isIntransit = source === "intransit";
    return (
        <span
            className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${
                isIntransit ? "bg-[#1C83E11A] text-[#004280]" : "bg-[#ff4b4b1A] text-[#c0392b]"
            }`}
        >
            {isIntransit ? "이동중재고" : "생산계획재고"}
        </span>
    );
}

type MasterSortKey = "poNo" | "factory" | "warehouse" | "source" | "totalQty" | "etd" | "eta";

const MASTER_COLUMNS: { label: string; key: MasterSortKey; align: "left" | "center"; getValue: (r: PoMasterRow) => string | number }[] = [
    { label: "PO 번호", key: "poNo", align: "left", getValue: (r) => r.poNo },
    { label: "공장", key: "factory", align: "center", getValue: (r) => r.factories.join(", ") },
    { label: "창고", key: "warehouse", align: "center", getValue: (r) => r.warehouses.join(", ") },
    {
        label: "구분", key: "source", align: "center",
        getValue: (r) => r.sources.map((s) => (s === "intransit" ? "이동중재고" : "생산계획재고")).join(", "),
    },
    { label: "총 수량", key: "totalQty", align: "center", getValue: (r) => r.totalQty },
    { label: "ETD", key: "etd", align: "center", getValue: (r) => etdSortKey(r.etdMin) },
    { label: "ETA", key: "eta", align: "center", getValue: (r) => etdSortKey(r.etaMax) },
];

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 flex-shrink-0 fill-gray-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
            <path d="M12 16a.47.47 0 01-.35-.15l-5-5a.49.49 0 01.7-.7L12 14.79l4.65-4.64a.49.49 0 11.7.7l-5 5A.47.47 0 0112 16z" />
        </svg>
    );
}

export default function PoManageTable({ filters }: { filters: FilterState }) {
    const [intransit, setIntransit] = useState<IntransitPoRow[]>([]);
    const [plan, setPlan] = useState<PlanPoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [poQuery, setPoQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [sort, setSort] = useState<{ key: MasterSortKey; direction: "asc" | "desc" } | null>(null);

    useEffect(() => {
        fetch("/api/pomanage")
            .then((r) => r.json())
            .then((json) => {
                if (!json.success) throw new Error(json.error ?? "데이터 조회 실패");
                setIntransit(json.intransit as IntransitPoRow[]);
                setPlan(json.plan as PlanPoRow[]);
            })
            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }, []);

    const allMasterRows = useMemo(() => toMasterRows(toDetailRows(intransit, plan)), [intransit, plan]);

    const masterRows = useMemo(() => {
        let rows = allMasterRows;

        if (poQuery.trim()) {
            const q = poQuery.trim().toUpperCase();
            rows = rows.filter((r) => r.poNo.toUpperCase().includes(q));
        }

        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            rows = rows
                .map((r) => ({ ...r, details: r.details.filter((d) => d.sku.toUpperCase().includes(q)) }))
                .filter((r) => r.details.length > 0);
        }

        if (filters.warehouse.length > 0) {
            rows = rows
                .map((r) => ({ ...r, details: r.details.filter((d) => filters.warehouse.includes(whGroup(d.wrhs))) }))
                .filter((r) => r.details.length > 0);
        }

        if (filters.factory.length > 0) {
            rows = rows
                .map((r) => ({ ...r, details: r.details.filter((d) => filters.factory.includes(suplFactLabel(d.suplFact))) }))
                .filter((r) => r.details.length > 0);
        }

        return rows;
    }, [allMasterRows, poQuery, filters.skuQuery, filters.warehouse, filters.factory]);

    const sortedMasterRows = useMemo(() => {
        if (!sort) return masterRows;
        const column = MASTER_COLUMNS.find((c) => c.key === sort.key);
        if (!column) return masterRows;
        const dir = sort.direction === "asc" ? 1 : -1;
        return [...masterRows].sort((a, b) => {
            const va = column.getValue(a);
            const vb = column.getValue(b);
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
    }, [masterRows, sort]);

    function handleSort(key: MasterSortKey) {
        setSort((prev) => {
            if (!prev || prev.key !== key) return { key, direction: "asc" };
            if (prev.direction === "asc") return { key, direction: "desc" };
            return null;
        });
    }

    function toggle(poNo: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(poNo)) next.delete(poNo);
            else next.add(poNo);
            return next;
        });
    }

    async function handleDownload() {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Sheet1");

        const header = ["PO 번호", "구분", "SKU", "창고", "수량", "ETD", "ETA", "컨테이너", "공급공장", "주차"];
        sheet.addRow(header);
        sheet.getRow(1).font = { bold: true };

        for (const row of sortedMasterRows) {
            for (const d of row.details) {
                sheet.addRow([
                    row.poNo,
                    d.source === "intransit" ? "이동중재고" : "생산계획재고",
                    d.sku,
                    whLabel(d.wrhs),
                    d.qty,
                    fmtDate(d.etd),
                    fmtDate(d.eta),
                    d.contNo ?? "",
                    suplFactLabel(d.suplFact),
                    d.yearWeek ?? "",
                ]);
            }
        }

        header.forEach((_, i) => {
            sheet.getColumn(i + 1).width = 18;
        });

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `PO_목록_${timestamp}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (loading) return <div className="px-2 py-4 text-gray-500">불러오는 중...</div>;
    if (error) return <div className="px-2 py-4 text-red-500">오류: {error}</div>;

    return (
        <div className="w-full px-2 py-4">
            <div className="mb-3 flex items-center gap-2">
                <input
                    value={poQuery}
                    onChange={(e) => setPoQuery(e.target.value)}
                    placeholder="PO 번호 검색 (예: PO-MD-WF-26-39)"
                    className="h-10 w-80 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
                />
                <span className="text-sm text-gray-400">총 {masterRows.length.toLocaleString()}건 PO</span>
                <button
                    onClick={handleDownload}
                    className="ml-auto h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-600 hover:border-[#ff4b4b] hover:text-[#ff4b4b] active:bg-[#ff4b4b] active:text-white"
                >
                    ⬇️ Download
                </button>
            </div>

            <div className="hover-scroll w-full overflow-auto rounded-md border border-gray-300 bg-white" style={{ maxHeight: "70vh" }}>
                <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                        <tr>
                            <th className="sticky top-0 z-10 w-10 bg-[#f8f9fb]" style={{ boxShadow: "inset 0 -2px 0 0 #77727980" }} />
                            {MASTER_COLUMNS.map((col) => {
                                const isSorted = sort?.key === col.key;
                                return (
                                    <th
                                        key={col.key}
                                        onClick={() => handleSort(col.key)}
                                        className={`sticky top-0 z-10 whitespace-nowrap bg-[#f8f9fb] px-3 py-2 font-normal text-gray-500 cursor-pointer select-none hover:bg-gray-200 hover:text-gray-700 ${
                                            col.align === "left" ? "text-left" : "text-center"
                                        }`}
                                        style={{ boxShadow: "inset 0 -2px 0 0 #77727980" }}
                                    >
                                        <span className={`flex w-full items-center gap-1 ${col.align === "center" ? "justify-center" : "justify-start"}`}>
                                            {col.label}
                                            <span className="text-gray-400">{isSorted ? (sort?.direction === "asc" ? "▲" : "▼") : ""}</span>
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {masterRows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                                    표시할 PO가 없습니다.
                                </td>
                            </tr>
                        )}
                        {sortedMasterRows.map((row) => {
                            const isOpen = expanded.has(row.poNo);
                            return (
                                <Fragment key={row.poNo}>
                                    <tr
                                        onClick={() => toggle(row.poNo)}
                                        className="cursor-pointer bg-white hover:bg-gray-50"
                                    >
                                        <td className="px-3 py-2.5" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            <ChevronIcon open={isOpen} />
                                        </td>
                                        <td className="px-3 py-2.5 font-medium text-gray-800" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {row.poNo}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {row.factories.join(", ") || "-"}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {row.warehouses.join(", ") || "-"}
                                        </td>
                                        <td className="px-3 py-2.5 text-center" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            <div className="flex justify-center gap-1">
                                                {row.sources.map((s) => (
                                                    <SourceBadge key={s} source={s} />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center font-semibold text-gray-800" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {n(row.totalQty)}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {fmtDate(row.etdMin)}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>
                                            {fmtDate(row.etaMax)}
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr className="bg-[#f5f5f5]">
                                            <td colSpan={8} className="px-4 py-3">
                                                <div className="overflow-hidden rounded-md border border-gray-300 bg-white">
                                                    <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                                                        <colgroup>
                                                            <col style={{ width: "35%" }} />
                                                            <col style={{ width: "15%" }} />
                                                            <col style={{ width: "15%" }} />
                                                            <col style={{ width: "35%" }} />
                                                        </colgroup>
                                                        <thead>
                                                            <tr>
                                                                {["SKU", "창고", "수량", "컨테이너"].map((label) => (
                                                                    <th
                                                                        key={label}
                                                                        className={`whitespace-nowrap bg-[#fafafa] px-3 py-2 font-normal text-gray-500 ${
                                                                            label === "SKU" ? "text-left" : "text-center"
                                                                        }`}
                                                                        style={{ boxShadow: "inset 0 -1px 0 0 #d1d5db" }}
                                                                    >
                                                                        {label}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {row.details.map((d, i) => (
                                                                <tr key={`${d.sku}-${d.wrhs}-${i}`} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-gray-800" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>{d.sku}</td>
                                                                    <td className="px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>{whLabel(d.wrhs)}</td>
                                                                    <td className="px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-center text-gray-800" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>{n(d.qty)}</td>
                                                                    <td className="px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap text-center text-gray-600" style={{ boxShadow: "inset 0 -1px 0 0 #e5e7eb" }}>{d.contNo ?? "-"}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
