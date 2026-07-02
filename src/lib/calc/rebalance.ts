// 선적 비율 재배분 (Target Ratio 직접분배 v3.0 — engine_ship.py 이식)
// Step 1: Zero-Ship Case — 빈 창고(현재고=이동중=Need28=0) 채우기
// Step 2: Target Ratio 직접분배 — 4WH 총 기준선적량은 보존, Target Ratio(or 재고기반)로 재분배

export type RatioWh = "CA" | "TX" | "NJ" | "GA";

export const TARGET_RATIO: Record<RatioWh, number> = {
    CA: 0.18,
    TX: 0.20,
    NJ: 0.30,
    GA: 0.32,
};

export const RATIO_WAREHOUSES: RatioWh[] = ["CA", "TX", "NJ", "GA"];

export type Week1AllocMode = "target_ratio" | "inventory_aware";

export type RebalanceWhInput = {
    wh: RatioWh;
    oh: number;
    it: number;
    shipPlan: number;
    need28d: number;
    baseShip: number;
};

function largestRemainderInt(raw: Record<RatioWh, number>, targetTotal: number): Record<RatioWh, number> {
    const floors = {} as Record<RatioWh, number>;
    for (const wh of RATIO_WAREHOUSES) floors[wh] = Math.floor(Math.max(0, raw[wh]));
    let remainder = targetTotal - RATIO_WAREHOUSES.reduce((s, wh) => s + floors[wh], 0);

    const fracs = RATIO_WAREHOUSES
        .map((wh) => [wh, Math.max(0, raw[wh]) - floors[wh]] as [RatioWh, number])
        .sort((a, b) => b[1] - a[1]);

    const result = { ...floors };
    let i = 0;
    while (remainder > 0 && fracs.length > 0) {
        result[fracs[i % fracs.length][0]] += 1;
        remainder -= 1;
        i += 1;
    }
    while (remainder < 0) {
        let reduced = false;
        for (let j = fracs.length - 1; j >= 0; j--) {
            const wh = fracs[j][0];
            if (result[wh] > 0) {
                result[wh] -= 1;
                remainder += 1;
                reduced = true;
                break;
            }
        }
        if (!reduced) break;
    }
    return result;
}

export type RebalanceResult = {
    shipQty: Record<RatioWh, number>;
    /** 창고별 Zero-Ship Case(빈 창고 채우기) 적용 여부 */
    zeroFlag: Record<RatioWh, boolean>;
    /** SKU 전체에 대해 Step2(Target Ratio 분배)가 적용됐는지 (분배할 base가 있으면 항상 적용) */
    gapFlag: boolean;
};

/** 단일 SKU에 대해 CA/TX/NJ/GA 4개 창고의 선적량을 재배분한다. WF는 대상 아님(호출부에서 별도 유지). */
export function rebalanceSku(
    rows: RebalanceWhInput[],
    mode: Week1AllocMode,
): RebalanceResult {
    const byWh = new Map(rows.map(r => [r.wh, r]));
    const result = {} as Record<RatioWh, number>;
    const zeroFlag = {} as Record<RatioWh, boolean>;
    for (const wh of RATIO_WAREHOUSES) {
        result[wh] = byWh.get(wh)?.baseShip ?? 0;
        zeroFlag[wh] = false;
    }

    // ── Step 1: Zero-Ship Case ──
    const totalNeed4wh = RATIO_WAREHOUSES.reduce((s, wh) => s + (byWh.get(wh)?.need28d ?? 0), 0);
    if (totalNeed4wh > 0) {
        for (const wh of RATIO_WAREHOUSES) {
            const r = byWh.get(wh);
            if (!r) continue;
            if (r.baseShip === 0 && r.oh === 0 && r.it === 0 && r.need28d === 0) {
                result[wh] = Math.round(totalNeed4wh * TARGET_RATIO[wh]);
                zeroFlag[wh] = true;
            }
        }
    }

    // ── Step 2: Target Ratio 직접분배 (cap 없음, 총량 보존) ──
    const totalBaseShip = RATIO_WAREHOUSES.reduce((s, wh) => s + result[wh], 0);
    if (totalBaseShip <= 0) return { shipQty: result, zeroFlag, gapFlag: false };

    const ratioSum = RATIO_WAREHOUSES.reduce((s, wh) => s + TARGET_RATIO[wh], 0);
    const normTarget = {} as Record<RatioWh, number>;
    for (const wh of RATIO_WAREHOUSES) normTarget[wh] = TARGET_RATIO[wh] / ratioSum;

    let rawAlloc: Record<RatioWh, number>;

    if (mode === "inventory_aware") {
        const avail = {} as Record<RatioWh, number>;
        for (const wh of RATIO_WAREHOUSES) {
            const r = byWh.get(wh);
            avail[wh] = (r?.oh ?? 0) + (r?.it ?? 0) + (r?.shipPlan ?? 0);
        }
        const postTotal = RATIO_WAREHOUSES.reduce((s, wh) => s + avail[wh], 0) + totalBaseShip;
        const ideal = {} as Record<RatioWh, number>;
        for (const wh of RATIO_WAREHOUSES) ideal[wh] = Math.max(0, normTarget[wh] * postTotal - avail[wh]);
        const idealSum = RATIO_WAREHOUSES.reduce((s, wh) => s + ideal[wh], 0);

        rawAlloc = {} as Record<RatioWh, number>;
        if (idealSum >= totalBaseShip && idealSum > 0) {
            for (const wh of RATIO_WAREHOUSES) rawAlloc[wh] = totalBaseShip * ideal[wh] / idealSum;
        } else if (idealSum > 0) {
            const remain = totalBaseShip - idealSum;
            for (const wh of RATIO_WAREHOUSES) rawAlloc[wh] = ideal[wh] + remain * normTarget[wh];
        } else {
            for (const wh of RATIO_WAREHOUSES) rawAlloc[wh] = totalBaseShip * normTarget[wh];
        }
    } else {
        rawAlloc = {} as Record<RatioWh, number>;
        for (const wh of RATIO_WAREHOUSES) rawAlloc[wh] = totalBaseShip * normTarget[wh];
    }

    const targetIntTotal = Math.round(totalBaseShip);
    const shipQty = largestRemainderInt(rawAlloc, targetIntTotal);
    return { shipQty, zeroFlag, gapFlag: true };
}
