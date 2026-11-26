// 선적 요약(선적 필요 SKU 수 / 총 선적 수량 / 정상 SKU 수).
import type { SummaryRow } from "@/app/api/salessummary/route";
import type { FilterState } from "@/components/sidebarFilters";
import { computeShipTables, type ForecastMap, type TrendMedianByWhMap } from "./shipCalc";
import type { ActualRatio } from "./rebalance";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };

export type ShipSummary = {
    needCount: number;
    totalQty: number;
    healthyCount: number;
};

export function computeShipSummary(
    rows: SummaryRow[],
    filters: FilterState,
    shipRatio84d: Record<string, ActualRatio>,
    forecastMap: ForecastMap,
    trendMediansByWh: TrendMedianByWhMap,
    baseDate?: Date,
): ShipSummary {
    const skuMeta = new Map<string, { Factory: string; IsOn: string }>(
        (mainSkuData as MainSkuRecord[]).map(r => [r.SKU, r])
    );
    const { table2 } = computeShipTables(rows, skuMeta, filters.logicMode, filters.rebalance, filters.week1AllocMode, shipRatio84d, forecastMap, trendMediansByWh, baseDate, { enabled: true, capacity: filters.capacity });
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
}
