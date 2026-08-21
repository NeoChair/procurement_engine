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

/** cy7/cy28/cy56은 이제 각 구간 합계가 아니라 일별 판매량의 중위값으로 들어오므로, 일수로 나누지 않고 가중치만 곱한다. */
export function newProductDaily(cy7: number, cy28: number, cy56: number): number {
    return 0.7 * cy7 + 0.2 * cy28 + 0.1 * cy56;
}

/** 발주/선적 추세 계산에 쓰는 작년 오늘 기준 -30일~+150일 6구간(30일씩) 판매 중위값. */
export type TrendMedianWindow = { w0: number; w1: number; w2: number; w3: number; w4: number; w5: number };

function safeMedianRatio(numer: number, denom: number): number {
    return denom > 0 ? numer / denom : 1;
}

/**
 * 발주(PO) 전용 추세 — 선적엔진의 lyForward14/lyBackward14 단순비교와 별개다.
 * 작년 오늘 기준 30일씩 6구간(w0~w5)의 일별 판매 중위값으로 인접 구간 비율 5개(추세1~5, ratios)를 구한 뒤,
 * 가장 최근 구간부터 거꾸로 인접 추세끼리 차이를 본다: (추세5-추세4) → (추세4-추세3) → (추세3-추세2) → (추세2-추세1)
 * 순서로 확인하되, 두 추세가 둘 다 1 미만(둘 다 하락 구간)이면 그 pair는 건너뛴다. 나머지 중 처음으로
 * 0 이상(증가)인 차이값을 그대로 배수로 쓴다. 못 찾으면(끝까지 스킵되거나 전부 감소) 추세1 자체를 배수로
 * 쓰되, 추세1마저 1 미만(하락)이면 보정 없이 그대로 둔다(trend=1, 즉 기본 일판매량 그대로 표시).
 */
export function medianTrend(w: TrendMedianWindow | undefined): { ratios: [number, number, number, number, number]; trend: number } {
    const m = w ?? { w0: 0, w1: 0, w2: 0, w3: 0, w4: 0, w5: 0 };
    const ratios: [number, number, number, number, number] = [
        safeMedianRatio(m.w1, m.w0),
        safeMedianRatio(m.w2, m.w1),
        safeMedianRatio(m.w3, m.w2),
        safeMedianRatio(m.w4, m.w3),
        safeMedianRatio(m.w5, m.w4),
    ];

    let trend = 1;
    let found = false;
    for (let i = ratios.length - 1; i >= 1; i--) {
        if (ratios[i] < 1 && ratios[i - 1] < 1) continue;
        const diff = ratios[i] - ratios[i - 1];
        if (diff >= 0) {
            trend = diff;
            found = true;
            break;
        }
    }
    if (!found) {
        trend = ratios[0] >= 1 ? ratios[0] : 1;
    }

    return { ratios, trend };
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
