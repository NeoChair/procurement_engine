"use client";

import { useState } from "react";
import PoTable from "@/components/poTable";
import PoTable2 from "@/components/poTable2";
import ShipTable1 from "@/components/shipTable1";
import ShipTable2 from "@/components/shipTable2";
import SummaryBoard from "@/components/summaryBoard";
import SidebarFilter, { type FilterState } from "@/components/sidebarFilters";

const DEFAULT_FILTERS: FilterState = {
    skuQuery: "",
    factory: [],
    warehouse: [],
    logicMode: "default",
    rebalance: false,
    week1AllocMode: "target_ratio",
};

export default function Home() {
    const [activeTab, setActiveTab] = useState<"po" | "ship">("po");
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [snapshotDate, setSnapshotDate] = useState<string | null | undefined>(undefined);

    return (
        <div className="flex h-screen overflow-hidden ">
            <SidebarFilter filters={filters} onFilterChange={setFilters} />

            <div className="flex-1 overflow-y-auto px-10 ">
                <div className="w-full my-[130px]">
                    <div className="w-auto bg-[#1C83E11A] h-15  mb-8 flex flex-row items-center ps-4 rounded-md gap-2">
                        <span className="text-[#004280] font-medium">Last Updated: PST</span>
                        <span className="text-[#004280] font-normal">
                            {snapshotDate === undefined ? "불러오는 중..." : snapshotDate === null ? "기준일 정보 없음" : snapshotDate}
                        </span>
                    </div>

                    <h1 className="text-5xl font-bold mb-4">🚢 NeoChair Operations Hub</h1>

                    <ul className="flex gap-2 border-b border-gray-300 mb-4">
                        <li>
                            <button
                                id="poTab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "po"}
                                onClick={() => setActiveTab("po")}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                    activeTab === "po"
                                        ? "border-b-2 border-[rgb(255,75,75)] text-[rgb(255,75,75)]"
                                        : "text-gray-500"
                                }`}
                            >
                                📦 발주 엔진
                            </button>
                        </li>
                        <li>
                            <button
                                id="shipTab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "ship"}
                                onClick={() => setActiveTab("ship")}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                    activeTab === "ship"
                                        ? "border-b-2 border-[rgb(255,75,75)] text-[rgb(255,75,75)]"
                                        : "text-gray-500"
                                }`}
                            >
                                🚢 선적 엔진
                            </button>
                        </li>
                    </ul>

                    <SummaryBoard filters={filters} activeTab={activeTab} onSnapshotDate={setSnapshotDate} />

                    <hr className="border-gray-300 my-4" />

                    <div key={activeTab} className="animate-fade-in py-4">
                        {activeTab === "po" && (
                            <div id="tab1" role="tabpanel" aria-labelledby="poTab">
                                <h2 className="text-3xl font-bold mb-4">📋 발주 Table 1 (판매량 비교)</h2>
                                <PoTable filters={filters} />

                                <hr className="border-gray-300 my-6" />

                                <h2 className="text-3xl font-bold mb-4">📦 발주 Table 2 (발주수량)</h2>
                                <PoTable2 filters={filters} />
                            </div>
                        )}
                        {activeTab === "ship" && (
                            <div id="tab2" role="tabpanel" aria-labelledby="shipTab">
                                <h2 className="text-3xl font-bold mb-4">📋 선적 Table 1 (판매량 비교)</h2>
                                <ShipTable1 filters={filters} />

                                <hr className="border-gray-300 my-6" />

                                <h2 className="text-3xl font-bold mb-4">🚢 선적 Table 2 (선적수량)</h2>
                                <ShipTable2 filters={filters} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
