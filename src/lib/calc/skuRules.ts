// SKU 필터(allowed prefix/ghost/drop) + 롤업/병합 — 자리만 잡아둠
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";

/** MAIN_SKU에 창고별 on/off 컬럼이 있는 창고(컬럼명 = 앱 창고 코드). */
const WH_FLAG_COLUMNS = new Set(["CA", "GA", "TX", "NJ"]);

const WH_FLAGS = new Map<string, Record<string, string>>(
    (mainSkuData as Record<string, string>[]).map(r => [r.SKU, r])
);

/** MAIN_SKU에서 해당 SKU의 그 창고 값이 "TRUE"일 때만 true.
 *  마스터에 없는 SKU, 창고별 컬럼이 없는 창고(WF 등)는 기존처럼 그대로 보여준다(true). */
export function isWhOn(sku: string, wh: string): boolean {
    const rec = WH_FLAGS.get(sku);
    if (!rec || !WH_FLAG_COLUMNS.has(wh) || rec[wh] === undefined) return true;
    return rec[wh] === "TRUE";
}
