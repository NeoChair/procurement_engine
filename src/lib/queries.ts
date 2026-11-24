"use client";

// 여러 화면이 같이 쓰는 API 조회는 여기서 React Query 훅으로 한 번만 정의한다.
// 같은 queryKey를 쓰는 컴포넌트가 동시에 마운트돼도 요청은 한 번만 나가고, 결과는 캐시에서 나눠 쓴다.

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { salesSummaryUrl } from "@/lib/snapshot";
import type { SummaryRow } from "@/app/api/salessummary/route";
import type { ForecastRow } from "@/app/api/forecast/route";
import type { ForecastMap, TrendMedianByWhMap } from "@/lib/calc/shipCalc";
import type { ActualRatio } from "@/lib/calc/rebalance";
import type { TrendMedianWindow } from "@/lib/calc/logicMode";

export const queryKeys = {
    salesSummary: (gathDe: string) => ["salessummary", gathDe] as const,
    forecast: ["forecast"] as const,
};

export type SalesSummaryData = {
    data: SummaryRow[];
    shipRatio84d: Record<string, ActualRatio>;
    trendMedians: Record<string, TrendMedianWindow>;
    trendMediansByWh: TrendMedianByWhMap;
    snapshotDate: string | null;
    gathDe: string | null;
};

/** 아직 불러오지 못했거나 실패했을 때 쓰는 고정 빈 값 (렌더마다 새 객체가 생겨 useMemo가 다시 도는 것을 막는다). */
export const EMPTY_SUMMARY: SalesSummaryData = {
    data: [],
    shipRatio84d: {},
    trendMedians: {},
    trendMediansByWh: {},
    snapshotDate: null,
    gathDe: null,
};

async function getJson(url: string, fallbackError: string) {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? fallbackError);
    return json;
}

/** /api/salessummary (선택한 스냅샷 기준). gathDe가 빈 문자열이면 최신 스냅샷. */
export function useSalesSummary(gathDe: string) {
    return useQuery({
        queryKey: queryKeys.salesSummary(gathDe),
        queryFn: async (): Promise<SalesSummaryData> => {
            const json = await getJson(salesSummaryUrl(gathDe), "데이터 조회 실패");
            return {
                data: json.data as SummaryRow[],
                shipRatio84d: json.shipRatio84d ?? {},
                trendMedians: json.trendMedians ?? {},
                trendMediansByWh: json.trendMediansByWh ?? {},
                snapshotDate: json.snapshotDate ?? null,
                gathDe: json.gathDe ?? null,
            };
        },
    });
}

/** /api/forecast 원본 행 (매뉴얼 발주예측). */
export function useForecastRows() {
    return useQuery({
        queryKey: queryKeys.forecast,
        queryFn: async (): Promise<ForecastRow[]> => (await getJson("/api/forecast", "조회 실패")).data as ForecastRow[],
    });
}

/** /api/forecast를 SKU → YM → FRCST_STOCK 맵으로. 실패하면 빈 맵(기존 동작과 같음). */
export function useForecastMap(): ForecastMap {
    const { data } = useForecastRows();
    return useMemo(() => {
        const map: ForecastMap = {};
        for (const row of data ?? []) {
            (map[row.SKU] ??= {})[row.YEAR_MONTH] = row.FRCST_STOCK;
        }
        return map;
    }, [data]);
}

/** 예측치를 저장/삭제한 뒤 호출: 예측 관리 표와 발주·선적 계산이 모두 새 값으로 다시 그려진다. */
export function useInvalidateForecast() {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: queryKeys.forecast });
}
