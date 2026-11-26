// 선적량 1~5주차 계산 + 소량 SKU 최소 보유(제안 3) + 공장별 주간 캐파 상한(제안 4).
//
// 캐파가 넘치면 공장 단위로 아래 순서대로 줄이고, 캐파 안에 들어오는 단계에서 멈춘다.
//   ① 소량 SKU 50개 채우는 물량 (비율로 일부만 줄일 수도 있음)
//   ② 보유 목표 일수 28일 → 14일까지 하루씩 (모든 SKU·창고 같이)
//   ③ 증감배수(추세)를 절반으로 — 늘어난 부분만 절반 (1.6배 → 1.3배)
//   ④ 증감배수 빼기 (1배)
// ④까지 해도 넘치면 더 줄이지 않고 경고(over=true)만 남긴다.
//
// 캐파는 1주차에만 건다. 2~5주차는 줄인 1주차 선적량으로 예상재고를 넘겨서 기존 식(rollMultiWeek)대로 계산한다.
// 캐파가 없으면 결과는 기존 계산과 1개도 다르지 않다.

export const LOW_VOLUME_MIN_QTY = 50;
export const MIN_TARGET_DAYS = 14;
export const CAP_WEEKS = 5;
/** ② 단계에서 줄일 수 있는 최대 일수 (28 → 14). */
const MAX_DAYS_CUT = 14;

/** 공장 → 1~5주차 캐파. null(빈칸)은 직전 주 값을 그대로 쓴다. 1주차부터 비어 있으면 그 주는 상한 없음. */
export type CapacityTable = Record<string, (number | null)[]>;

export type CapStep = 0 | 1 | 2 | 3 | 4;

type CutLevel = {
    step: CapStep;
    /** 소량 SKU 50개 채움 비율 (1=전부, 0=안 채움). */
    lowFill: number;
    /** 보유 목표 일수에서 뺄 일수. */
    daysCut: number;
    /** 추세의 늘어난 부분에 곱할 비율 (1=그대로, 0.5=절반, 0=추세 없음). */
    trendScale: number;
};

const FULL_LEVEL: CutLevel = { step: 0, lowFill: 1, daysCut: 0, trendScale: 1 };

export type ShipCtx = {
    whOn: boolean;
    /** 현재고 + 이동중재고 + 생산계획 (정수) */
    avail: number;
    lt: number;
    /** 기본 보유 일수 (28, 일부 SKU 42) */
    safetyDays: number;
    /** 창고 7일 중앙값 0이라 평균 기준을 쓰는 소량 SKU → 최소 50개 보유 */
    isLow: boolean;
    /**
     * 추세 모드(default_manual, 매뉴얼 예측 없음)일 때만 값이 있다.
     * shipTrend: 1일치에 곱하는 추세(1~2), segments: 리드타임 30일 구간별 (일수, 추세 1~2).
     */
    trend: { baseDaily: number; shipTrend: number; segments: { days: number; t: number }[] } | null;
    /** 추세 모드가 아닐 때 1일치 (매뉴얼 예측 또는 엔진값) */
    flatDaily: number;
};

export type LevelCalc = {
    daily: number;
    /** 화면/엑셀에 찍히는 1일치(소수 2자리). 2~5주차 소비량 계산도 이 값으로 한다. */
    shownDaily: number;
    /** 보유 목표 수량 (소량 SKU는 최소 50, lowFill 비율 반영) */
    need: number;
    predPeriod: number;
    days: number;
};

function levelCalc(ctx: ShipCtx, lv: CutLevel): LevelCalc {
    const days = Math.max(MIN_TARGET_DAYS, ctx.safetyDays - lv.daysCut);
    const scale = (t: number) => 1 + (t - 1) * lv.trendScale;
    let daily: number;
    let pred: number;
    if (ctx.trend) {
        daily = ctx.trend.baseDaily * scale(ctx.trend.shipTrend);
        pred = ctx.trend.segments.reduce((acc, s) => acc + ctx.trend!.baseDaily * scale(s.t) * s.days, 0);
    } else {
        daily = ctx.flatDaily;
        pred = daily * ctx.lt;
    }
    const needNormal = Math.round(daily * days);
    const needLow = ctx.isLow ? Math.max(needNormal, LOW_VOLUME_MIN_QTY) : needNormal;
    return {
        daily,
        shownDaily: Math.round(daily * 100) / 100,
        need: needNormal + (needLow - needNormal) * lv.lowFill,
        predPeriod: Math.round(pred),
        days,
    };
}

type RowState = { prevProjected: number; prevShip: number };

/** 한 행의 k주차(0=1주차) 선적량. 기존 shipCalc/rollMultiWeek 식과 같다. */
function weekShip(ctx: ShipCtx, lc: LevelCalc, k: number, st: RowState): { ship: number; nextProjected: number } {
    const projected = k === 0 ? ctx.avail - lc.predPeriod : st.prevProjected + st.prevShip - lc.shownDaily * 7;
    const ship = ctx.whOn ? Math.round(Math.min(Math.max(0, lc.need - projected), Math.max(0, lc.need))) : 0;
    return { ship, nextProjected: Math.max(0, projected) };
}

export type ShipWeeksResult = {
    ships: number[];
    /** 1주차에 쓴 계산값 (화면 1일치/28일치/리드타임 소요량 표시용) */
    week1: LevelCalc;
    /** 주차별 적용 단계 설명 ("" = 줄이지 않음) */
    stepLabels: string[];
    /** 이 행이 속한 공장이 어느 주차든 캐파로 줄었는지 */
    adjusted: boolean;
};

export type CapReportRow = {
    factory: string;
    week: number;
    cap: number;
    /** 줄이기 전 필요 선적량 합계 */
    need: number;
    /** 줄인 뒤 선적량 합계 */
    shipped: number;
    step: CapStep;
    label: string;
    /** ④까지 줄여도 캐파를 넘음 */
    over: boolean;
};

function capFor(caps: (number | null)[] | undefined, k: number): number | null {
    if (!caps) return null;
    for (let i = k; i >= 0; i--) {
        const v = caps[i];
        if (v != null && Number.isFinite(v)) return v;
    }
    return null;
}

/** 행별 설명: 그 행의 원래 보유 일수(28/42) → 줄인 일수까지 적는다. */
function rowStepLabel(lv: CutLevel, ctx: ShipCtx): string {
    if (lv.step === 0) return "";
    if (lv.step === 1) return ctx.isLow ? `소량50: ${Math.round(lv.lowFill * 100)}%` : "";
    const days = Math.max(MIN_TARGET_DAYS, ctx.safetyDays - lv.daysCut);
    const parts = [`일수: ${days}일`];
    // ③④ 단계: 추세(1일치에 곱하는 배수)가 얼마에서 얼마로 내려갔는지. 추세가 없는 행(매뉴얼 등)은 생략.
    if (lv.step >= 3 && ctx.trend && ctx.trend.shipTrend > 1) {
        const t = ctx.trend.shipTrend;
        parts.push(`추세: ${t.toFixed(2)}→${(1 + (t - 1) * lv.trendScale).toFixed(2)}`);
    }
    return parts.join(" · ");
}

function stepLabel(lv: CutLevel): string {
    switch (lv.step) {
        case 0: return "";
        case 1: return `① 소량50 ${Math.round(lv.lowFill * 100)}%`;
        case 2: return `② 목표 ${28 - lv.daysCut}일`;
        case 3: return "③ 증감배수 ½";
        case 4: return "④ 증감배수 없음";
    }
}

/** 줄이는 순서대로 후보 단계 (① 제외 — ①은 비율을 따로 찾는다). */
function laterLevels(): CutLevel[] {
    const out: CutLevel[] = [];
    for (let d = 1; d <= MAX_DAYS_CUT; d++) out.push({ step: 2, lowFill: 0, daysCut: d, trendScale: 1 });
    out.push({ step: 3, lowFill: 0, daysCut: MAX_DAYS_CUT, trendScale: 0.5 });
    out.push({ step: 4, lowFill: 0, daysCut: MAX_DAYS_CUT, trendScale: 0 });
    return out;
}

/**
 * 모든 행의 1~5주차 선적량을 계산한다. capacity가 null이면 캐파 없이(기존과 동일) 계산.
 * items[i]의 결과가 results[i]로 나온다.
 */
export function runShipWeeks(
    items: { ctx: ShipCtx; factory: string }[],
    capacity: CapacityTable | null,
): { results: ShipWeeksResult[]; report: CapReportRow[] } {
    const results: ShipWeeksResult[] = new Array(items.length);
    const report: CapReportRow[] = [];

    const byFactory = new Map<string, number[]>();
    items.forEach((it, i) => {
        const list = byFactory.get(it.factory);
        if (list) list.push(i);
        else byFactory.set(it.factory, [i]);
    });

    for (const [factory, idxs] of byFactory) {
        const caps = capacity?.[factory];
        const hasCap = !!caps && Array.from({ length: CAP_WEEKS }, (_, k) => capFor(caps, k)).some(v => v != null);

        const states: RowState[] = idxs.map(() => ({ prevProjected: 0, prevShip: 0 }));
        const ships: number[][] = idxs.map(() => []);
        const labels: string[][] = idxs.map(() => []);
        let week1: LevelCalc[] = [];
        let factoryAdjusted = false;

        for (let k = 0; k < CAP_WEEKS; k++) {
            // 캐파는 1주차(이번에 실제로 정하는 선적)에만 건다. 2~5주차는 줄인 1주차를 이어받아 기존 식대로 계산.
            const cap = hasCap && k === 0 ? capFor(caps, 0) : null;
            const calcAt = (lv: CutLevel) => idxs.map((i, j) => {
                const lc = levelCalc(items[i].ctx, lv);
                return { lc, ...weekShip(items[i].ctx, lc, k, states[j]) };
            });
            const sum = (rows: { ship: number }[]) => rows.reduce((a, r) => a + r.ship, 0);

            let chosen = FULL_LEVEL;
            let rows = calcAt(FULL_LEVEL);
            const needSum = sum(rows);
            let over = false;

            if (cap != null && needSum > cap) {
                // ① 소량 50 채움 물량을 비율로 줄여서 들어가는지
                const noLow = calcAt({ step: 1, lowFill: 0, daysCut: 0, trendScale: 1 });
                if (sum(noLow) <= cap) {
                    let lo = 0, hi = 1;
                    for (let it = 0; it < 30; it++) {
                        const mid = (lo + hi) / 2;
                        if (sum(calcAt({ step: 1, lowFill: mid, daysCut: 0, trendScale: 1 })) <= cap) lo = mid;
                        else hi = mid;
                    }
                    chosen = { step: 1, lowFill: lo, daysCut: 0, trendScale: 1 };
                    rows = calcAt(chosen);
                } else {
                    // ②~④ 차례로
                    let found = false;
                    for (const lv of laterLevels()) {
                        const r = calcAt(lv);
                        chosen = lv;
                        rows = r;
                        if (sum(r) <= cap) { found = true; break; }
                    }
                    over = !found;
                }
                factoryAdjusted = true;
            }

            rows.forEach((r, j) => {
                ships[j].push(r.ship);
                labels[j].push(rowStepLabel(chosen, items[idxs[j]].ctx));
                states[j] = { prevProjected: r.nextProjected, prevShip: r.ship };
            });
            if (k === 0) week1 = rows.map(r => r.lc);

            if (cap != null) {
                report.push({ factory, week: k + 1, cap, need: needSum, shipped: sum(rows), step: chosen.step, label: stepLabel(chosen), over });
            }
        }

        idxs.forEach((i, j) => {
            results[i] = { ships: ships[j], week1: week1[j], stepLabels: labels[j], adjusted: factoryAdjusted };
        });
    }

    return { results, report };
}
