// 사이드바에서 고른 스냅샷 날짜(GATH_DE = 'YYYYMMDDAM' / 'YYYYMMDDPM') 관련 공용 함수.
// gathDe가 빈 문자열이면 "최신 스냅샷"(기존 동작)이다.

/** /api/salessummary 호출 URL. 선택한 스냅샷이 있으면 ?gathDe=를 붙인다. */
export function salesSummaryUrl(gathDe: string): string {
    return gathDe ? `/api/salessummary?gathDe=${encodeURIComponent(gathDe)}` : "/api/salessummary";
}

/** /api/pomanage 호출 URL. */
export function poManageUrl(gathDe: string): string {
    return gathDe ? `/api/pomanage?gathDe=${encodeURIComponent(gathDe)}` : "/api/pomanage";
}

/** 스냅샷 날짜 → 매뉴얼 예측 YM 기준일(Date, 로컬 자정). 최신(빈 문자열)이면 undefined → 오늘 PST. */
export function baseDateFromGathDe(gathDe: string): Date | undefined {
    if (!/^\d{8}(AM|PM)$/.test(gathDe)) return undefined;
    return new Date(Number(gathDe.slice(0, 4)), Number(gathDe.slice(4, 6)) - 1, Number(gathDe.slice(6, 8)));
}

/** 'YYYYMMDDAM' → '2026-11-19 AM' */
export function formatGathDe(gathDe: string): string {
    return `${gathDe.slice(0, 4)}-${gathDe.slice(4, 6)}-${gathDe.slice(6, 8)} ${gathDe.slice(8)}`;
}
