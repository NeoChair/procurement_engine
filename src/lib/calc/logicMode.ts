// SKU 규칙 + 성장계수 + 로직모드

export type LogicMode = "default_manual" | "default" | "all_normal" | "all_new" | "manual";

const FORCE_NEW_SKU_PREFIXES = [
    "CHA-GM-NEX", "CHA-HC-CZPU", "CHA-MS-M28", "CHA-MS-DBSH",
    "CHA-MS-DBS", "CHA-PU-CORE", "CHA-PU-BLC", "CHA-MS-NEC", "MAT-HY-PL",
];
const FORCE_NEW_SKUS_EXACT = new Set(["CHA-MS-CPS-BK-2PK"]);
const DROP_SKU_PREFIXES = ["CHA-MT-CVS"];
const DROP_SKUS_EXACT = new Set(["CHA-PU-BLC-IV"]);

export function isForceNew(sku: string): boolean {
    const s = sku.trim();
    return FORCE_NEW_SKU_PREFIXES.some(p => s.startsWith(p)) || FORCE_NEW_SKUS_EXACT.has(s);
}

export function isDrop(sku: string): boolean {
    const s = sku.trim();
    return DROP_SKU_PREFIXES.some(p => s.startsWith(p)) || DROP_SKUS_EXACT.has(s);
}

export function weightedGrowthFactor(
    cy7: number, ly7: number,
    cy28: number, ly28: number,
    cy56: number, ly56: number,
): number {
    // 원본(Python _weighted_growth_factor)과 동일하게, 7/28/56일 중 하나라도
    // LY=0이라 비율을 낼 수 없으면 전체 성장계수를 NaN으로 취급한다(부분합으로 대체하지 않음).
    // 가중치를 재정규화해 부분합을 내면 표본 부족 구간에서 배율이 비정상적으로 튀는 버그가 생긴다.
    const r7  = ly7  > 0 ? cy7  / ly7  : NaN;
    const r28 = ly28 > 0 ? cy28 / ly28 : NaN;
    const r56 = ly56 > 0 ? cy56 / ly56 : NaN;
    const factor = 0.5 * r7 + 0.3 * r28 + 0.2 * r56;
    return isFinite(factor) ? factor : NaN;
}

export function newProductDaily(cy7: number, cy28: number, cy56: number): number {
    return 0.7 * (cy7 / 7) + 0.2 * (cy28 / 28) + 0.1 * (cy56 / 56);
}

/**
 * Default + Manual 모드에서 매뉴얼 예측치가 없는 SKU/창고에 쓰는 일 예상판매량.
 * 신제품 기준 계산(0.7/0.2/0.1)에, 작년 동일 시점 기준 "이제 막 시작되는 7일(forward)"이
 * "직전 7일(ly7, backward)"보다 얼마나 늘었는지를 나타내는 추세를 곱해 계절성을 반영한다.
 * lyForward7이 없거나(null) ly7이 0이면 비교 기준이 없으므로 추세=1(보정 없음)로 둔다.
 * 추세가 1 이하(역성장/보합)면 곱하지 않고 그대로 둔다 — 작년 forward 구간이 우연히 부진했다고
 * 해서 지금 잘 팔리고 있는 신제품 기준값을 깎아버리면 안 되므로, 상승 추세일 때만 가산 보정한다.
 */
export function trendAdjustedNewProductDaily(
    cy7: number, cy28: number, cy56: number,
    ly7: number, lyForward7: number | null,
): number {
    const rawTrend = (lyForward7 != null && ly7 > 0) ? lyForward7 / ly7 : 1;
    const trend = rawTrend > 1 ? rawTrend : 1;
    return newProductDaily(cy7, cy28, cy56) * trend;
}

export function isNewProduct(
    sku: string,
    ly7: number, ly28: number, ly56: number,
    growthFactor: number,
    logicMode: LogicMode,
): boolean {
    if (logicMode === "all_normal") return false;
    if (logicMode === "all_new") return true;
    const lySignal = ly7 + ly28 + ly56;
    return lySignal <= 0 || !isFinite(growthFactor) || isForceNew(sku);
}
