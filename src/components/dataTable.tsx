"use client";

import { useMemo, useRef, useState } from "react";

export type DataTableColumn<T> = {
    key: string;
    label: string;
    align?: "left" | "right";
    getValue: (row: T) => string | number;
    render?: (row: T) => React.ReactNode;
    cellClassName?: (row: T) => string;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

const MIN_PERCENT = 4;

function csvEscape(v: string): string {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
}

export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    visibleRows = 15,
    rowHeight = 36,
    headerHeight = 36,
    rowClassName,
    fileName,
    defaultSort,
}: {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    visibleRows?: number;
    rowHeight?: number;
    headerHeight?: number;
    rowClassName?: (row: T) => string;
    fileName?: string;
    /** 사용자가 컬럼을 직접 정렬하기 전(sort===null)에만 적용되는 기본 정렬 비교함수. rows 자체는 항상 안정적인
     * 순서(예: SKU→창고)로 넘겨야, 컬럼 정렬 중 계산모드가 바뀌어도 동점 행 순서가 흔들리지 않는다. */
    defaultSort?: (a: T, b: T) => number;
}) {
    const [sort, setSort] = useState<SortState>(null);
    // 마지막 컬럼을 제외한 나머지 컬럼의 폭(퍼센트). 마지막 컬럼은 잔여 100%를 차지한다.
    // SKU는 "CHA-MS-CPS-BK-2PK" 같은 긴 값이 안 잘리도록 넓게, 제작공장은 값이 짧아(HR/MT 등) 좁게 시작한다.
    const [colPercents, setColPercents] = useState<number[]>(() => {
        const weight = (key: string) => (key === "SKU" ? 2.0 : key === "FACTORY" ? 0.8 : 1);
        const totalWeight = columns.reduce((s, c) => s + weight(c.key), 0);
        return columns.slice(0, -1).map((c) => (weight(c.key) / totalWeight) * 100);
    });
    const tableRef = useRef<HTMLTableElement>(null);
    const resizingRef = useRef<{ index: number; startX: number; startCur: number; startNext: number } | null>(null);

    const widths = useMemo(() => {
        const rest = colPercents;
        const lastWidth = Math.max(MIN_PERCENT, 100 - rest.reduce((s, v) => s + v, 0));
        return [...rest, lastWidth];
    }, [colPercents]);

    const sortedRows = useMemo(() => {
        if (!sort) {
            if (!defaultSort) return rows;
            return [...rows].sort(defaultSort);
        }
        const column = columns.find((c) => c.key === sort.key);
        if (!column) return rows;
        const dir = sort.direction === "asc" ? 1 : -1;
        return [...rows].sort((a, b) => {
            const va = column.getValue(a);
            const vb = column.getValue(b);
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
    }, [rows, sort, columns, defaultSort]);

    function handleSort(key: string) {
        setSort((prev) => {
            if (!prev || prev.key !== key) return { key, direction: "asc" };
            if (prev.direction === "asc") return { key, direction: "desc" };
            return null;
        });
    }

    // index: 리사이즈 핸들이 달린 컬럼의 인덱스. 이 컬럼과 바로 다음 컬럼끼리 폭을 주고받는다.
    function startResize(e: React.MouseEvent, index: number) {
        e.stopPropagation();
        e.preventDefault();
        const tableWidth = tableRef.current?.clientWidth ?? 1000;
        resizingRef.current = {
            index,
            startX: e.clientX,
            startCur: widths[index],
            startNext: widths[index + 1],
        };

        function onMove(ev: MouseEvent) {
            const state = resizingRef.current;
            if (!state) return;
            const deltaPercent = ((ev.clientX - state.startX) / tableWidth) * 100;
            const pairTotal = state.startCur + state.startNext;
            let newCur = state.startCur + deltaPercent;
            newCur = Math.max(MIN_PERCENT, Math.min(pairTotal - MIN_PERCENT, newCur));
            const newNext = pairTotal - newCur;

            setColPercents((prev) => {
                const next = [...prev];
                next[state.index] = newCur;
                if (state.index + 1 < next.length) next[state.index + 1] = newNext;
                return next;
            });
        }
        function onUp() {
            resizingRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    function handleDownload() {
        // 1. 현재 날짜/시간 생성
        const now = new Date();
        
        // YYYY-MM-DD hh:mm:ss 포맷팅 (padStart로 두 자릿수 맞춤)
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        // 2. CSV 로직
        const header = columns.map((c) => csvEscape(c.label)).join(",");
        const lines = sortedRows.map((row) =>
            columns.map((c) => csvEscape(String(c.getValue(row)))).join(",")
        );
        const csv = [header, ...lines].join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        
        // 3. 파일명에 타임스탬프 적용
        // (파일명에 콜론(:)은 사용이 불가능할 수 있으니 언더바(_)나 하이픈(-)으로 바꾸는 걸 추천해요)
        const safeTimestamp = timestamp.replace(/:/g, '-'); 
        a.download = `${fileName ?? "table"}_${safeTimestamp}.csv`;
        
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="w-full">
            {fileName && (
                <div className="mb-2 flex justify-end">
                    <button
                        onClick={handleDownload}
                        className="w-50 h-10 rounded-md border border-gray-300 bg-white px-3 py-1 text-md text-gray-600 hover:text-[#ff4b4b] hover:border-[#ff4b4b]
                        active:text-white active:bg-[#ff4b4b]"
                    >
                        ⬇️ Download 
                    </button>
                </div>
            )}
            <div
                className="hover-scroll w-full overflow-auto rounded-md border border-gray-300 bg-white"
                style={{ height: `calc(${headerHeight}px + ${visibleRows} * ${rowHeight}px)` }}
            >
                <table
                    ref={tableRef}
                    className="w-full"
                    style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "14px", tableLayout: "fixed" }}
                >
                    <colgroup>
                        {columns.map((col, i) => (
                            <col key={col.key} style={{ width: `${widths[i]}%` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr style={{ height: `${headerHeight}px` }}>
                            {columns.map((col, i) => {
                                const isSorted = sort?.key === col.key;
                                const isLast = i === columns.length - 1;
                                return (
                                    <th
                                        key={col.key}
                                        onClick={() => handleSort(col.key)}
                                        className="sticky top-0 z-10 px-3 font-normal whitespace-nowrap cursor-pointer select-none text-gray-400 bg-[#f8f9fb] hover:bg-gray-200 hover:text-gray-600 text-left py-2 relative overflow-hidden"
                                        style={{
                                            boxShadow: "inset 0 -1px 0 0 #d1d5db, inset -1px 0 0 0 #d1d5db",
                                            verticalAlign: "middle",
                                        }}
                                    >
                                        <span className="flex h-full items-center gap-1">
                                            {col.label}
                                            <span className="text-gray-400">
                                                {isSorted ? (sort?.direction === "asc" ? "▲" : "▼") : ""}
                                            </span>
                                        </span>
                                        {!isLast && (
                                            <div
                                                onMouseDown={(e) => startResize(e, i)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none hover:bg-blue-300/50 z-20"
                                            />
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((row) => (
                            <tr key={rowKey(row)} className={`bg-white hover:bg-gray-50 ${rowClassName ? rowClassName(row) : ""}`} style={{ height: `${rowHeight}px` }}>
                                {columns.map((col) => (
                                    <td
                                        key={col.key}
                                        className={`${col.cellClassName ? col.cellClassName(row) : "bg-inherit"} px-3 overflow-hidden text-ellipsis whitespace-nowrap ${
                                            col.align === "right" ? "text-right" : "text-left"
                                        }`}
                                        style={{
                                            boxShadow: "inset 0 -1px 0 0 #e5e7eb, inset -1px 0 0 0 #e5e7eb",
                                            verticalAlign: "middle",
                                        }}
                                    >
                                        {col.render ? col.render(row) : col.getValue(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
