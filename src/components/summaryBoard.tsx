"use client";

import { useEffect, useMemo, useState } from "react";
import type { SummaryRow } from "@/app/api/salessummary/route";
import { computePoCalc } from "@/lib/calc/poCalc";
import { computeShipTables } from "@/lib/calc/shipCalc";
import type { FilterState } from "@/components/sidebarFilters";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const MAIN_SKU_MAP = new Map<string, MainSkuRecord>(
    (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
);

export default function SummaryBoard({
    filters,
    activeTab,
    onSnapshotDate,
}: {
    filters: FilterState;
    activeTab: "po" | "ship";
    onSnapshotDate?: (date: string | null) => void;
}) {
    const [rows, setRows] = useState<SummaryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/salessummary")
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setRows(json.data as SummaryRow[]);
                    onSnapshotDate?.(json.snapshotDate ?? null);
                }
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const poSummary = useMemo(() => {
        let calc = computePoCalc(rows, filters.logicMode);

        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            calc = calc.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            calc = calc.filter(r => filters.factory.includes(MAIN_SKU_MAP.get(r.sku)?.Factory ?? "-"));
        }
        if (filters.warehouse.length > 0) {
            calc = calc.filter(r => filters.warehouse.includes(r.wh));
        }

        const skuPoSum = new Map<string, number>();
        for (const r of calc) skuPoSum.set(r.sku, (skuPoSum.get(r.sku) ?? 0) + r.finalPoQty);

        const totalSkuCount = skuPoSum.size;
        const needCount = [...skuPoSum.values()].filter(v => v > 0).length;
        const totalQty = calc.reduce((sum, r) => sum + r.finalPoQty, 0);
        const healthyCount = totalSkuCount - needCount;

        return { needCount, totalQty, healthyCount };
    }, [rows, filters]);

    const shipSummary = useMemo(() => {
        const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
            (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
        );
        const { table2 } = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode);
        let calc = table2;

        if (filters.skuQuery) {
            const q = filters.skuQuery.toUpperCase();
            calc = calc.filter(r => r.sku.toUpperCase().includes(q));
        }
        if (filters.factory.length > 0) {
            calc = calc.filter(r => filters.factory.includes(r.factory));
        }
        if (filters.warehouse.length > 0) {
            calc = calc.filter(r => filters.warehouse.includes(r.wh));
        }

        const skuShipSum = new Map<string, number>();
        for (const r of calc) skuShipSum.set(r.sku, (skuShipSum.get(r.sku) ?? 0) + r.shipQty);

        const totalSkuCount = skuShipSum.size;
        const needCount = [...skuShipSum.values()].filter(v => v > 0).length;
        const totalQty = calc.reduce((sum, r) => sum + r.shipQty, 0);
        const healthyCount = totalSkuCount - needCount;

        return { needCount, totalQty, healthyCount };
    }, [rows, filters]);

    if (loading) {
        return (
            <div className="w-full px-2 py-4 text-gray-400">
                요약 데이터 불러오는 중...
            </div>
        );
    }

    const summary = activeTab === "po" ? poSummary : shipSummary;
    const needLabel = activeTab === "po" ? "발주 필요 SKU" : "선적 필요 SKU";
    const qtyLabel = activeTab === "po" ? "총 발주 수량" : "총 선적 수량";

    return (
        <div className="w-full px-2 py-4">
            <div className="flex flex-row justify-between">
                <div className="flex flex-col items-start flex-1">
                    <span>{needLabel}</span>
                    <span className="text-4xl">{summary.needCount.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-start flex-1">
                    <span>{qtyLabel}</span>
                    <span className="text-4xl">{summary.totalQty.toLocaleString()}EA</span>
                </div>
                <div className="flex flex-col items-start flex-1">
                    <span>정상 SKU수</span>
                    <span className="text-4xl">{summary.healthyCount.toLocaleString()}개</span>
                </div>
            </div>
        </div>
    );
}
