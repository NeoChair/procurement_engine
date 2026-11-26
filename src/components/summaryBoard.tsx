"use client";

import { useEffect, useMemo } from "react";
import { baseDateFromGathDe } from "@/lib/snapshot";
import { computePoCalc } from "@/lib/calc/poCalc";
import { computeShipSummary } from "@/lib/calc/shipSummary";
import type { FilterState } from "@/components/sidebarFilters";
import { useSalesSummary, useForecastMap, EMPTY_SUMMARY } from "@/lib/queries";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import { useLang } from "@/lib/i18n";

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
    onSnapshotDate?: (date: string | null, gathDe: string | null) => void;
}) {
    const summaryQuery = useSalesSummary(filters.gathDe);
    const forecastMap = useForecastMap();
    const { data: rows, shipRatio84d, trendMedians, trendMediansByWh } = summaryQuery.data ?? EMPTY_SUMMARY;
    const loading = summaryQuery.isPending;
    const { t } = useLang();

    useEffect(() => {
        if (summaryQuery.data) onSnapshotDate?.(summaryQuery.data.snapshotDate, summaryQuery.data.gathDe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [summaryQuery.data]);

    const poSummary = useMemo(() => {
        let calc = computePoCalc(rows, filters.logicMode, shipRatio84d, forecastMap, trendMedians, baseDateFromGathDe(filters.gathDe));

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
    }, [rows, filters, shipRatio84d, forecastMap, trendMedians]);

    const shipSummary = useMemo(
        () => computeShipSummary(rows, filters, shipRatio84d, forecastMap, trendMediansByWh, baseDateFromGathDe(filters.gathDe)),
        [rows, filters, shipRatio84d, forecastMap, trendMediansByWh],
    );

    if (loading) {
        return (
            <div className="w-full px-2 py-4 text-gray-400">
                {t("요약 데이터 불러오는 중...", "Loading summary...")}
            </div>
        );
    }

    const summary = activeTab === "po" ? poSummary : shipSummary;
    const needLabel = activeTab === "po" ? t("발주 필요 SKU", "SKUs Needing Purchase Order") : t("선적 필요 SKU", "SKUs Needing Shipping Plan");
    const qtyLabel = activeTab === "po" ? t("총 발주 수량", "Total Purchase Order Qty") : t("총 선적 수량", "Total Shipping Plan Qty");

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
                    <span>{t("정상 SKU수", "Healthy SKUs")}</span>
                    <span className="text-4xl">{summary.healthyCount.toLocaleString()}{t("개", "")}</span>
                </div>
            </div>
        </div>
    );
}
