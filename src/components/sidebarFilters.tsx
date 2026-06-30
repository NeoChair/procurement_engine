"use client";

import { useEffect, useRef, useState } from "react";

function SelectArrowIcon() {
    return (
        <svg
            data-baseweb="icon"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 fill-gray-500"
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
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={`w-full rounded-md bg-white pl-2 pr-7 py-1.5 text-left text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[rgb(255,75,75)] ${
                    bordered ? "border border-gray-300" : ""
                } ${open ? "ring-1 ring-[rgb(255,75,75)]" : ""}`}
            >
                {selected?.label}
            </button>
            <SelectArrowIcon />

            {open && (
                <ul
                    role="listbox"
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-300 bg-white py-1 text-sm shadow-lg"
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
                            className={`cursor-pointer px-2 py-1.5 text-gray-800 hover:bg-[rgb(255,75,75)] hover:text-white ${
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

const LANGUAGE_OPTIONS: Option[] = [
    { value: "kr", label: "한국어" },
    { value: "en", label: "English" },
];

const FACTORY_OPTIONS: Option[] = [
    { value: "ALL", label: "공장 선택" },
    { value: "MT", label: "MT" },
    { value: "HR", label: "HR" },
    { value: "TYJ", label: "TYJ" },
    { value: "GF", label: "GF" },
    { value: "MD", label: "MD" },
    { value: "YB", label: "YB" },
];

const WAREHOUSE_OPTIONS: Option[] = [
    { value: "ALL", label: "창고 선택" },
    { value: "CA", label: "CA" },
    { value: "GA", label: "GA" },
    { value: "NJ", label: "NJ" },
    { value: "TX", label: "TX" },
    { value: "WF", label: "WF" },
];

export default function SidebarFilter() {
    const [language, setLanguage] = useState("kr");
    const [factory, setFactory] = useState("ALL");
    const [warehouse, setWarehouse] = useState("ALL");

    return (
        <div className="w-64 h-screen bg-[#f0f2f6] border-r border-gray-300 px-4 py-6 overflow-y-auto">
            <div className="flex flex-col gap-5">

                <div className="flex flex-col gap-1">
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
                    <label className="text-sm font-medium text-gray-700">🔎 SKU 검색</label>
                    <input
                        placeholder="SKU 키워드 입력 (예: CHA)"
                        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[rgb(255,75,75)]"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">🏭 공장 필터</label>
                    <CustomSelect options={FACTORY_OPTIONS} value={factory} onChange={setFactory} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">🏬 창고 필터</label>
                    <CustomSelect options={WAREHOUSE_OPTIONS} value={warehouse} onChange={setWarehouse} />
                </div>

                <hr className="border-gray-300" />

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">선적 비율 재배분</label>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-blue-500 transition-colors" />
                            <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                        </div>
                        <span className="ml-2 text-sm text-gray-700">ON / OFF</span>
                    </label>
                </div>

                <hr className="border-gray-300" />

                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">일 예상 판매 계산 모드</label>
                    <div className="flex flex-col gap-1.5 rounded-md border border-gray-300 p-2">
                        <div className="flex items-center gap-2">
                            <input type="radio" id="default" value="default" name="calcMode" className="accent-blue-500" />
                            <label htmlFor="default" className="text-sm text-gray-700">Default (자동 분류 유지)</label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="radio" id="normal" value="normal" name="calcMode" className="accent-blue-500" />
                            <label htmlFor="normal" className="text-sm text-gray-700">Normal (일반 강제)</label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="radio" id="new" value="new" name="calcMode" className="accent-blue-500" />
                            <label htmlFor="new" className="text-sm text-gray-700">New (신제품 강제)</label>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}
