"use client";

import { useState } from "react";
import PoTable from "@/components/poTable";
import PoTable2 from "@/components/poTable2";
import ShipTable1 from "@/components/shipTable1";
import ShipTable2 from "@/components/shipTable2";
import PoManageTable from "@/components/poManageTable";
import SummaryBoard from "@/components/summaryBoard";
import SidebarFilter, { type FilterState } from "@/components/sidebarFilters";
import ForecastManage from "@/components/forecastManage";
import { LanguageProvider, useLang } from "@/lib/i18n";
import { formatGathDe } from "@/lib/snapshot";

const DEFAULT_FILTERS: FilterState = {
    skuQuery: "",
    factory: [],
    warehouse: [],
    logicMode: "default_manual",
    rebalance: false,
    week1AllocMode: "actual_ratio",
    gathDe: "",
};

export default function Home() {
    return (
        <LanguageProvider>
            <HomeContent />
        </LanguageProvider>
    );
}

function HomeContent() {
    const { t } = useLang();
    const [activeTab, setActiveTab] = useState<"po" | "ship" | "pomanage">("po");
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    // 화면에 실제로 불러온 스냅샷(GATH_DE). undefined=불러오는 중, null=정보 없음
    const [dataGathDe, setDataGathDe] = useState<string | null | undefined>(undefined);

    return (
        <div className="flex h-screen overflow-hidden ">
            <SidebarFilter filters={filters} onFilterChange={setFilters} />

            <div className="flex-1 overflow-y-auto px-10 ">
                <div className="w-full my-[130px]">
                    <div className="w-auto bg-[#1C83E11A] h-15  mb-8 flex flex-row items-center ps-4 rounded-md gap-2">
                        <span className="text-[#004280] font-medium">Selected Data Date (PST):</span>
                        <span className="text-[#004280] font-normal">
                            {/* 과거 날짜를 고르면 그 날짜를 바로 보여주고(PO 목록 탭에서도), 최신이면 실제 불러온 최신 스냅샷을 보여준다. */}
                            {filters.gathDe ? formatGathDe(filters.gathDe)
                                : dataGathDe === undefined ? t("불러오는 중...", "Loading...")
                                : dataGathDe === null ? t("기준일 정보 없음", "No snapshot date")
                                : `${formatGathDe(dataGathDe)} (${t("최신", "Latest")})`}
                        </span>
                    </div>

                    <h1 className="text-5xl font-bold mb-4">🚢 Neo Supply Chain Optimization & Planning Engine</h1>

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
                                📦 {t("발주 엔진", "Purchase Order Engine")}
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
                                🚢 {t("선적 엔진", "Shipping Plan Engine")}
                            </button>
                        </li>
                        <li>
                            <button
                                id="poManageTab"
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "pomanage"}
                                onClick={() => setActiveTab("pomanage")}
                                className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                                    activeTab === "pomanage"
                                        ? "border-b-2 border-[rgb(255,75,75)] text-[rgb(255,75,75)]"
                                        : "text-gray-500"
                                }`}
                            >
                                📑 {t("PO 목록", "PO List")}
                            </button>
                        </li>
                    </ul>

                    {activeTab !== "pomanage" && (
                        <SummaryBoard key={filters.gathDe} filters={filters} activeTab={activeTab} onSnapshotDate={(_, gathDe) => setDataGathDe(gathDe)} />
                    )}

                    <hr className="border-gray-300 my-4" />

                    <div key={`${activeTab}__${filters.gathDe}`} className="animate-fade-in py-4">
                        {activeTab === "po" && (
                            <div id="tab1" role="tabpanel" aria-labelledby="poTab">
                                <h2 className="text-3xl font-bold mb-4">📋 {t("발주 Table 1 (판매량 비교)", "Purchase Order Table 1 (Sales Comparison)")}</h2>
                                <PoTable filters={filters} />

                                <hr className="border-gray-300 my-6" />

                                <h2 className="text-3xl font-bold mb-4">📦 {t("발주 Table 2 (발주수량)", "Purchase Order Table 2 (Purchase Order Qty)")}</h2>
                                <PoTable2 filters={filters} />
                            </div>
                        )}
                        {activeTab === "ship" && (
                            <div id="tab2" role="tabpanel" aria-labelledby="shipTab">
                                <h2 className="text-3xl font-bold mb-4">📋 {t("선적 Table 1 (판매량 비교)", "Shipping Plan Table 1 (Sales Comparison)")}</h2>
                                <ShipTable1 filters={filters} />

                                <hr className="border-gray-300 my-6" />

                                <h2 className="text-3xl font-bold mb-4">🚢 {t("선적 Table 2 (선적수량)", "Shipping Plan Table 2 (Shipping Plan Qty)")}</h2>
                                <ShipTable2 filters={filters} />
                            </div>
                        )}
                        {activeTab === "pomanage" && (
                            <div id="tab3" role="tabpanel" aria-labelledby="poManageTab">
                                <h2 className="text-3xl font-bold mb-4">📑 {t("PO 목록 (PO 번호별 SKU/수량/창고)", "PO List (SKU / Qty / Warehouse by PO Number)")}</h2>
                                <PoManageTable filters={filters} />
                            </div>
                        )}
                    </div>

                    <hr className="border-gray-300 my-6" />

                    <h2 className="text-3xl font-bold mb-4">📝 {t("매뉴얼 발주예측(FRCST_QTY)", "Manual Purchase Order Forecast (FRCST_QTY)")}</h2>
                    <ForecastManage />
                </div>
            </div>
        </div>
    );
}
