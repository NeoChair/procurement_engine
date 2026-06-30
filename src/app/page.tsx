"use client";

import { useState } from "react";
import PoTable from "@/components/poTable";
import ShipTable from "@/components/shipTable";
import SummaryBoard from "@/components/summaryBoard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"po" | "ship">("po");

  return (
    <div className="w-full">
      <div className="w-full">
        <SummaryBoard/>
        <ul className="flex gap-2 border-b border-gray-300">
          <li>
            <button
              id="poTab"
              type="button"
              role="tab"
              aria-selected={activeTab === "po"}
              onClick={() => setActiveTab("po")}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "po"
                  ? "border-b-2 border-[rgb(255,75,75)] text-[rgb(255,75,75)]"
                  : "text-gray-500"
              }`}
            >
              발주 엔진
            </button>
          </li>
          <li>
            <button
              id="shipTab"
              type="button"
              role="tab"
              aria-selected={activeTab === "ship"}
              onClick={() => setActiveTab("ship")}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "ship"
                  ? "border-b-2 border-[rgb(255,75,75)] text-[rgb(255,75,75)]"
                  : "text-gray-500"
              }`}
            >
              선적 엔진
            </button>
          </li>
        </ul>
        <div>
          {activeTab === "po" && (
            <div id="tab1" role="tabpanel" aria-labelledby="poTab">
              <PoTable />
            </div>
          )}
          {activeTab === "ship" && (
            <div id="tab2" role="tabpanel" aria-labelledby="shipTab">
              <ShipTable />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}