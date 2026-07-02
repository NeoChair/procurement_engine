"use client";

import { useEffect, useRef, useState } from "react";
import type { LogicMode } from "@/lib/calc/logicMode";
import type { Week1AllocMode } from "@/lib/calc/rebalance";

export type FilterState = {
    skuQuery: string;
    factory: string[];
    warehouse: string[];
    logicMode: LogicMode;
    rebalance: boolean;
    week1AllocMode: Week1AllocMode;
};

function SelectArrowIcon() {
    return (
        <svg
            data-baseweb="icon"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 fill-gray-500"
        >
            <title>open</title>
            <path
                transform="rotate(270, 12, 12)"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9 12C9 12.2652 9.10536 12.5196 9.29289 12.7071L13.2929 16.7071C13.6834 17.0976 14.3166 17.0976 14.7071 16.7071C15.0976 16.3166 15.0976 15.6834 14.7071 15.2929L11.4142 12L14.7071 8.70711C15.0976 8.31658 15.0976 7.68342 14.7071 7.29289C14.3166 6.90237 13.6834 6.90237 13.2929 7.29289L9.29289 11.2929C9.10536 11.4804 9 11.7348 9 12Z"
            />
        </svg>
    );
}

function SidebarArrowIcon({ className = "" }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="currentColor"
            className={className}
        >
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
        </svg>
    );
}

type Option = { value: string; label: string };

function CustomSelect({
    options,
    value,
    onChange,
    bordered = true,
}: {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    bordered?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selected = options.find((o) => o.value === value) ?? options[0];

    return (
        <div className="relative w-full min-w-[245px]" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={`h-10 w-full rounded-md bg-white pl-3 pr-9 text-left text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[rgb(255,75,75)] ${
                    bordered ? "border border-gray-300" : ""
                } ${open ? "ring-1 ring-[rgb(255,75,75)]" : ""}`}
            >
                {selected?.label}
            </button>
            <SelectArrowIcon />

            {open && (
                <ul
                    role="listbox"
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-300 bg-white py-1 text-base shadow-lg"
                >
                    {options.map((option) => (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={option.value === value}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                            className={`cursor-pointer px-3 py-2.5 text-gray-800 hover:bg-[rgb(255,75,75)] hover:text-white ${
                                option.value === value ? "bg-[rgb(255,75,75)]/10 font-medium" : ""
                            }`}
                        >
                            {option.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function DeleteIcon() {
    return (
        <svg viewBox="5 5 13.186 13.186" className="h-3.5 w-3.5 fill-current">
            <title>Delete</title>
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M7.29289 7.29289C7.68342 6.90237 8.31658 6.90237 8.70711 7.29289L12 10.5858L15.2929 7.29289C15.6834 6.90237 16.3166 6.90237 16.7071 7.29289C17.0976 7.68342 17.0976 8.31658 16.7071 8.70711L13.4142 12L16.7071 15.2929C17.0976 15.6834 17.0976 16.3166 16.7071 16.7071C16.3166 17.0976 15.6834 17.0976 15.2929 16.7071L12 13.4142L8.70711 16.7071C8.31658 17.0976 7.68342 17.0976 7.29289 16.7071C6.90237 16.3166 6.90237 15.6834 7.29289 15.2929L10.5858 12L7.29289 8.70711C6.90237 8.31658 6.90237 7.68342 7.29289 7.29289Z"
            />
        </svg>
    );
}

function MultiSelect({
    options,
    values,
    onChange,
    placeholder,
}: {
    options: Option[];
    values: string[];
    onChange: (values: string[]) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    function toggle(value: string) {
        if (values.includes(value)) {
            onChange(values.filter(v => v !== value));
        } else {
            onChange([...values, value]);
        }
    }

    return (
        <div className="relative w-full min-w-[245px]" ref={containerRef}>
            <div
                onClick={() => setOpen(prev => !prev)}
                className={`flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-md bg-white px-2 py-1.5 pr-9 focus-within:ring-1 focus-within:ring-[#ff4b4b] ${
                    open ? "ring-1 ring-[#ff4b4b]" : ""
                }`}
            >
                {values.length === 0 && (
                    <span className="px-1 text-base text-gray-400">{placeholder}</span>
                )}
                {values.map(v => {
                    const label = options.find(o => o.value === v)?.label ?? v;
                    return (
                        <span
                            key={v}
                            className="flex items-center gap-1 rounded-md bg-[#ff4b4b]/10 px-2 py-1 text-sm text-[#ff4b4b]"
                        >
                            <span title={label}>{label}</span>
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); toggle(v); }}
                                className="cursor-pointer hover:text-[#c0392b]"
                            >
                                <DeleteIcon />
                            </span>
                        </span>
                    );
                })}
            </div>
            <SelectArrowIcon />

            {open && (
                <ul
                    role="listbox"
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-300 bg-white py-1 text-base shadow-lg"
                >
                    {options.map((option) => {
                        const checked = values.includes(option.value);
                        return (
                            <li
                                key={option.value}
                                role="option"
                                aria-selected={checked}
                                onClick={() => toggle(option.value)}
                                className={`cursor-pointer px-3 py-2.5 text-gray-800 hover:bg-[#ff4b4b] hover:text-white ${
                                    checked ? "bg-[#ff4b4b]/10 font-medium" : ""
                                }`}
                            >
                                {option.label}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

const LANGUAGE_OPTIONS: Option[] = [
    { value: "kr", label: "한국어" },
    { value: "en", label: "English" },
];

const FACTORY_OPTIONS: Option[] = [
    { value: "MT", label: "MT" },
    { value: "HR", label: "HR" },
    { value: "TYJ", label: "TYJ" },
    { value: "GF", label: "GF" },
    { value: "MD", label: "MD" },
    { value: "YB", label: "YB" },
];

const WAREHOUSE_OPTIONS: Option[] = [
    { value: "CA", label: "CA" },
    { value: "GA", label: "GA" },
    { value: "NJ", label: "NJ" },
    { value: "TX", label: "TX" },
    { value: "WF", label: "WF" },
];

const LOGIC_MODE_OPTIONS: Option[] = [
    { value: "default", label: "Default (자동 분류 유지)" },
    { value: "all_normal", label: "Normal (일반 강제)" },
    { value: "all_new", label: "New (신제품 강제)" },
];

const MIN_WIDTH = 288;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;

export default function SidebarFilter({
    filters,
    onFilterChange,
}: {
    filters: FilterState;
    onFilterChange: (f: FilterState) => void;
}) {
    const [language, setLanguage] = useState("kr");
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [collapsed, setCollapsed] = useState(false);
    const isResizing = useRef(false);

    function update(partial: Partial<FilterState>) {
        onFilterChange({ ...filters, ...partial });
    }

    useEffect(() => {
        function handleMouseMove(e: MouseEvent) {
            if (!isResizing.current) return;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            setWidth(newWidth);
        }
        function handleMouseUp() {
            isResizing.current = false;
        }
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    return (
        <div
            className={`relative h-screen flex-shrink-0 overflow-hidden transition-[width,background-color] duration-75 ease-in-out ${
                collapsed ? "bg-white" : "bg-[#f0f2f6]"
            }`}
            style={{ width: collapsed ? 48 : width }}
        >
            <div
                className={`absolute inset-0 flex items-start justify-center pt-4 transition-opacity duration-75 ease-in-out ${
                    collapsed ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
            >
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    aria-label="사이드바 펼치기"
                    className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                >
                    <SidebarArrowIcon className="h-7 w-7" />
                </button>
            </div>

            <div
                className={`h-full overflow-y-auto px-5 py-6 transition-opacity duration-75 ease-in-out ${
                    collapsed ? "pointer-events-none opacity-0" : "opacity-100"
                }`}
                style={{ width }}
            >
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    aria-label="사이드바 접기"
                    className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 font-medium hover:bg-gray-200 hover:text-gray-800"
                >
                    ✕
                </button>
            </div>
            <div
                onMouseDown={() => { isResizing.current = true; }}
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[#ff4b4b]/40"
            />
            <div className="flex flex-col gap-7">
                <div className="flex flex-col gap-1 mt-[60px]">
                    <label className="text-sm font-medium text-gray-700">🌐 Language</label>
                    <CustomSelect
                        options={LANGUAGE_OPTIONS}
                        value={language}
                        onChange={setLanguage}
                        bordered={false}
                    />
                </div>

                <hr className="border-gray-300" />

                <div className="flex flex-col gap-1">
                    <label className="text-md font-medium text-gray-700">🔎 SKU 검색</label>
                    <input
                        value={filters.skuQuery}
                        onChange={e => update({ skuQuery: e.target.value })}
                        placeholder="SKU 키워드 입력 (예: CHA)"
                        className="h-10 w-full min-w-[245px] rounded-md bg-white px-3 text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-md font-medium text-gray-700">🏭 공장 필터</label>
                    <MultiSelect
                        options={FACTORY_OPTIONS}
                        values={filters.factory}
                        onChange={v => update({ factory: v })}
                        placeholder="공장 선택..."
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-md font-medium text-gray-700">🏬 창고 필터</label>
                    <MultiSelect
                        options={WAREHOUSE_OPTIONS}
                        values={filters.warehouse}
                        onChange={v => update({ warehouse: v })}
                        placeholder="창고 선택..."
                    />
                </div>

                <hr className="border-gray-300" />

                <div className="flex flex-col gap-6 mb-4">
                    <label className="text-xl font-bold text-gray-700">🎯 선적 비율 재배분</label>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={filters.rebalance}
                                onChange={e => update({ rebalance: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-[#ff4b4b] transition-colors" />
                            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                        </div>
                        <span className="ml-2 text-lg text-gray-700">🎯 선적 비율 재배분</span>
                    </label>

                    {filters.rebalance ? (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-[#ff4b4b]">⚡ 재배분 활성화됨</span>
                            <span className="text-sm text-gray-400">📌 Target: CA 18% · TX 20% · NJ 30% · GA 32%</span>
                            <span className="text-sm text-gray-400">📌 ±5% 범위 밖 SKU → 자동 재배분</span>
                            <span className="text-sm text-gray-400">📌 기준선적량(28일Need)이 base, 재배분은 보정 레이어</span>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-gray-500">📌 Rebalance OFF (모니터링 전용)</span>
                            <span className="text-sm text-gray-400">📌 Target Ratio 비교표는 표시되지만 선적량 변경 없음</span>
                            <span className="text-sm text-gray-400">📌 기준선적량 공식(28일 Need)으로만 선적량 계산</span>
                        </div>
                    )}

                    {filters.rebalance && (
                        <div className="flex flex-col gap-2">
                            <label className="text-md font-medium text-gray-700">📐 1주차 배분 방식</label>
                            <div className="flex flex-col gap-1.5 rounded-md py-1">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        id="week1-target"
                                        name="week1AllocMode"
                                        checked={filters.week1AllocMode === "target_ratio"}
                                        onChange={() => update({ week1AllocMode: "target_ratio" })}
                                        className="accent-[#ff4b4b] w-[15px] h-[15px]"
                                    />
                                    <label htmlFor="week1-target" className="text-sm text-gray-700">목표비율 (현행)</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        id="week1-inv"
                                        name="week1AllocMode"
                                        checked={filters.week1AllocMode === "inventory_aware"}
                                        onChange={() => update({ week1AllocMode: "inventory_aware" })}
                                        className="accent-[#ff4b4b] w-[15px] h-[15px]"
                                    />
                                    <label htmlFor="week1-inv" className="text-sm text-gray-700">현재고기반 (쏠림완화)</label>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <hr className="border-gray-300" />

                <div className="flex flex-col gap-2">
                    <label className="text-xl font-medium text-gray-700">일 예상 판매 계산 모드</label>
                    <div className="flex flex-col gap-1.5 rounded-md py-2 pe-2">
                        {LOGIC_MODE_OPTIONS.map(opt => (
                            <div key={opt.value} className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    id={opt.value}
                                    value={opt.value}
                                    name="calcMode"
                                    checked={filters.logicMode === opt.value}
                                    onChange={() => update({ logicMode: opt.value as LogicMode })}
                                    className="accent-[#ff4b4b] w-[15px] h-[15px]"
                                />
                                <label htmlFor={opt.value} className="text-md text-gray-700">{opt.label}</label>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
