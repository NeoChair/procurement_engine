"use client";

import { useEffect, useMemo, useState } from "react";
import type { ForecastRow } from "@/app/api/forecast/route";
import mainSkuData from "@/data/sku-master/MAIN_SKU_260211.json";
import DataTable, { type DataTableColumn } from "@/components/dataTable";
import { useLang } from "@/lib/i18n";

type MainSkuRecord = { SKU: string; IsOn: string; Factory: string };
const KNOWN_SKUS = new Set((mainSkuData as MainSkuRecord[]).map(r => r.SKU));

type ParsedRow = { sku: string; ym: string; qty: number };

const inputClass = "h-10 rounded-md border border-gray-300 bg-white px-3 text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]";
const primaryBtnClass = "h-10 rounded-md bg-[#ff4b4b] px-5 text-sm font-medium text-white transition-colors hover:bg-[#e03e3e] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtnClass = "h-10 rounded-md border border-gray-300 bg-white px-5 text-sm font-medium text-gray-600 transition-colors hover:border-[#ff4b4b] hover:text-[#ff4b4b] disabled:cursor-not-allowed disabled:opacity-50";

function validateRow(sku: string, ym: string, qty: string, t: (ko: string, en: string) => string): string | null {
    if (!sku.trim()) return t("SKU를 입력하세요.", "Please enter a SKU.");
    if (!/^\d{6}$/.test(ym.trim())) return t("YM은 YYYYMM 형식(예: 202611)이어야 합니다.", "YM must be in YYYYMM format (e.g. 202611).");
    const n = Number(qty);
    if (!Number.isFinite(n) || n < 0) return t("FRCST_QTY는 0 이상의 숫자여야 합니다.", "FRCST_QTY (forecast quantity) must be a number of 0 or more.");
    return null;
}

function parseBulkText(text: string, t: (ko: string, en: string) => string): { rows: ParsedRow[]; errors: string[] } {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    for (const [i, line] of lines.entries()) {
        const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map(p => p.trim());
        if (parts.length < 3) {
            errors.push(t(`${i + 1}번째 줄: 컬럼이 3개(SKU, YM, FRCST_QTY) 미만입니다.`, `Line ${i + 1}: fewer than 3 columns (SKU, YM, FRCST_QTY).`));
            continue;
        }
        const [sku, ym, qtyRaw] = parts;
        if (sku.toUpperCase() === "SKU") continue; // header row skip

        const err = validateRow(sku, ym, qtyRaw, t);
        if (err) {
            errors.push(t(`${i + 1}번째 줄 (${sku}): ${err}`, `Line ${i + 1} (${sku}): ${err}`));
            continue;
        }
        rows.push({ sku: sku.trim(), ym: ym.trim(), qty: Math.round(Number(qtyRaw)) });
    }
    return { rows, errors };
}

function Banner({ type, children }: { type: "error" | "success"; children: React.ReactNode }) {
    const cls = type === "error"
        ? "border-red-200 bg-red-50 text-red-600"
        : "border-green-200 bg-green-50 text-green-700";
    return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    const { t } = useLang();
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
            onClick={onClose}
        >
            <div
                className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-md bg-white p-6 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-800">📝 {t("예측치 등록 / 일괄입력", "Add Forecast / Bulk Input")}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("닫기", "Close")}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export default function ForecastManage() {
    const { t, lang } = useLang();
    const [rows, setRows] = useState<ForecastRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [entryMode, setEntryMode] = useState<"select" | "single" | "bulk">("select");

    const [skuQuery, setSkuQuery] = useState("");
    const [ymFilter, setYmFilter] = useState("");

    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState("");
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const [newSku, setNewSku] = useState("");
    const [newYm, setNewYm] = useState("");
    const [newQty, setNewQty] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    const [bulkText, setBulkText] = useState("");
    const [bulkErrors, setBulkErrors] = useState<string[]>([]);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null);

    function fetchRows() {
        fetch("/api/forecast")
            .then(r => r.json())
            .then(json => {
                if (!json.success) throw new Error(json.error ?? t("조회 실패", "Failed to load"));
                setRows(json.data as ForecastRow[]);
                setError(null);
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false));
    }

    useEffect(() => { fetchRows(); }, []);

    const ymOptions = useMemo(() => {
        const set = new Set(rows.map(r => r.YEAR_MONTH));
        return [...set].sort();
    }, [rows]);

    const displayRows = useMemo(() => {
        let result = rows;
        if (skuQuery) {
            const q = skuQuery.toUpperCase();
            result = result.filter(r => r.SKU.toUpperCase().includes(q));
        }
        if (ymFilter) {
            result = result.filter(r => r.YEAR_MONTH === ymFilter);
        }
        return result;
    }, [rows, skuQuery, ymFilter]);

    async function saveQty(sku: string, ym: string, qty: number) {
        const key = `${sku}__${ym}`;
        setSavingKey(key);
        try {
            const res = await fetch("/api/forecast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sku, ym, qty }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? t("저장 실패", "Failed to save"));
            fetchRows();
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
        } finally {
            setSavingKey(null);
            setEditingKey(null);
        }
    }

    async function deleteRow(sku: string, ym: string) {
        if (!confirm(t(`${sku} / ${ym} 예측치를 삭제할까요?`, `Delete the forecast for ${sku} / ${ym}?`))) return;
        try {
            const res = await fetch(`/api/forecast?sku=${encodeURIComponent(sku)}&ym=${encodeURIComponent(ym)}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? t("삭제 실패", "Failed to delete"));
            setRows(prev => prev.filter(r => !(r.SKU === sku && r.YEAR_MONTH === ym)));
        } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
        }
    }

    async function handleAdd() {
        const err = validateRow(newSku, newYm, newQty, t);
        if (err) { setAddError(err); return; }
        if (!KNOWN_SKUS.has(newSku.trim())) {
            if (!confirm(t(`"${newSku.trim()}"은(는) SKU 마스터에 없는 값이에요. 그래도 추가할까요?`, `"${newSku.trim()}" is not in the SKU master. Add it anyway?`))) return;
        }
        setAdding(true);
        setAddError(null);
        try {
            const res = await fetch("/api/forecast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sku: newSku.trim(), ym: newYm.trim(), qty: Math.round(Number(newQty)) }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? t("추가 실패", "Failed to add"));
            setNewSku(""); setNewYm(""); setNewQty("");
            fetchRows();
        } catch (err) {
            setAddError(err instanceof Error ? err.message : String(err));
        } finally {
            setAdding(false);
        }
    }

    function handleBulkParse() {
        const { rows: parsed, errors } = parseBulkText(bulkText, t);
        setBulkErrors(errors);
        setBulkResult(errors.length === 0 ? { ok: true, message: t(`${parsed.length}행 확인됨. 저장 버튼을 눌러주세요.`, `${parsed.length} rows validated. Click Save.`) } : null);
        return parsed;
    }

    async function handleBulkSave() {
        const parsed = handleBulkParse();
        if (parsed.length === 0) return;
        setBulkSaving(true);
        setBulkResult(null);
        try {
            const res = await fetch("/api/forecast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: parsed }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? t("일괄 저장 실패", "Bulk save failed"));
            setBulkResult({ ok: true, message: t(`${json.count}행 저장 완료`, `${json.count} rows saved`) });
            setBulkText("");
            fetchRows();
        } catch (err) {
            setBulkResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
        } finally {
            setBulkSaving(false);
        }
    }

    const columns: DataTableColumn<ForecastRow>[] = useMemo(() => [
        { key: "SKU", label: "SKU", align: "left", getValue: r => r.SKU },
        { key: "YM", label: t("YM", "Year-Month (YM)"), align: "left", getValue: r => r.YEAR_MONTH },
        {
            key: "QTY", label: "FRCST_QTY", align: "right",
            getValue: r => r.FRCST_STOCK,
            render: r => {
                const key = `${r.SKU}__${r.YEAR_MONTH}`;
                const isEditing = editingKey === key;
                if (isEditing) {
                    return (
                        <input
                            autoFocus
                            type="number"
                            value={editingValue}
                            onChange={e => setEditingValue(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onBlur={() => {
                                const n = Number(editingValue);
                                if (Number.isFinite(n) && n >= 0) saveQty(r.SKU, r.YEAR_MONTH, Math.round(n));
                                else setEditingKey(null);
                            }}
                            onKeyDown={e => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingKey(null);
                            }}
                            className="w-24 rounded-md border border-[#ff4b4b] px-2 py-0.5 text-right focus:outline-none"
                        />
                    );
                }
                return (
                    <span
                        onClick={() => { setEditingKey(key); setEditingValue(String(r.FRCST_STOCK)); }}
                        className="inline-block w-full cursor-pointer rounded px-2 py-0.5 text-right hover:bg-[#ff4b4b]/10"
                        title={t("클릭해서 수정", "Click to edit")}
                    >
                        {savingKey === key ? t("저장 중...", "Saving...") : r.FRCST_STOCK.toLocaleString()}
                    </span>
                );
            },
        },
        {
            key: "MDFY_DT", label: t("수정일시", "Modified At"), align: "left",
            getValue: r => r.MDFY_DT,
            render: r => <span className="text-gray-400">{new Date(r.MDFY_DT).toLocaleString(lang === "en" ? "en-US" : "ko-KR")}</span>,
        },
        {
            key: "DELETE", label: t("삭제", "Delete"), align: "left",
            getValue: () => "",
            render: r => (
                <button
                    type="button"
                    onClick={() => deleteRow(r.SKU, r.YEAR_MONTH)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={t("삭제", "Delete")}
                >
                    🗑
                </button>
            ),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [editingKey, editingValue, savingKey, t, lang]);

    if (loading) {
        return <div className="w-full px-2 py-4 text-gray-400">{t("예측치 데이터 불러오는 중...", "Loading forecast data...")}</div>;
    }

    const BackButton = (
        <button
            type="button"
            onClick={() => setEntryMode("select")}
            className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-[#ff4b4b]"
        >
            ← {t("다른 방식 선택", "Choose another method")}
        </button>
    );

    const modalContent = entryMode === "select" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <button
                type="button"
                onClick={() => setEntryMode("single")}
                className="flex flex-col items-center gap-3 rounded-md border border-gray-300 bg-white p-8 text-center transition-colors hover:border-[#ff4b4b] hover:bg-[#ff4b4b]/5"
            >
                <span className="text-4xl">➕</span>
                <span className="text-lg font-bold text-gray-800">{t("개별 추가 / 수정", "Add / Edit One")}</span>
                <span className="text-sm text-gray-500">{t("SKU 한 건씩 직접 입력", "Enter SKUs one at a time")}</span>
            </button>
            <button
                type="button"
                onClick={() => setEntryMode("bulk")}
                className="flex flex-col items-center gap-3 rounded-md border border-gray-300 bg-white p-8 text-center transition-colors hover:border-[#ff4b4b] hover:bg-[#ff4b4b]/5"
            >
                <span className="text-4xl">📋</span>
                <span className="text-lg font-bold text-gray-800">{t("엑셀 붙여넣기", "Paste from Excel")}</span>
                <span className="text-sm text-gray-500">{t("여러 SKU를 한 번에 붙여넣어 일괄 저장", "Paste many SKUs at once and save in bulk")}</span>
            </button>
        </div>
    ) : entryMode === "single" ? (
        <div>
            {BackButton}
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={newSku}
                        onChange={e => setNewSku(e.target.value)}
                        placeholder={t("SKU (예: CHA-GM-NEX-BK)", "SKU (e.g. CHA-GM-NEX-BK)")}
                        className={`${inputClass} w-56 flex-1`}
                    />
                    <input
                        value={newYm}
                        onChange={e => setNewYm(e.target.value)}
                        placeholder={t("YM (예: 202611)", "Year-Month (YYYYMM, e.g. 202611)")}
                        className={`${inputClass} w-32`}
                    />
                    <input
                        value={newQty}
                        onChange={e => setNewQty(e.target.value)}
                        placeholder="FRCST_QTY"
                        type="number"
                        className={`${inputClass} w-32`}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={handleAdd} disabled={adding} className={primaryBtnClass}>
                        {adding ? t("저장 중...", "Saving...") : t("추가 / 수정", "Add / Update")}
                    </button>
                    {addError && <span className="text-sm text-red-600">{addError}</span>}
                </div>
            </div>
        </div>
    ) : (
        <div>
            {BackButton}
            <div className="flex flex-col gap-3">
                <span className="text-sm text-gray-500">{t("SKU, YM, FRCST_QTY 3개 컬럼을 엑셀에서 복사해서 그대로 붙여넣으세요. (헤더 행은 자동으로 무시됩니다)", "Copy the 3 columns SKU, YM, FRCST_QTY from Excel and paste them here. (Header row is ignored automatically)")}</span>
                <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder={"CHA-GM-NEX-BK\t202611\t550\nCHA-GM-NEX-BL\t202611\t200"}
                    rows={10}
                    className="w-full rounded-md border border-gray-300 p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleBulkParse} className={secondaryBtnClass}>{t("검증", "Validate")}</button>
                    <button
                        type="button"
                        onClick={handleBulkSave}
                        disabled={bulkSaving || !bulkText.trim()}
                        className={primaryBtnClass}
                    >
                        {bulkSaving ? t("저장 중...", "Saving...") : t("일괄 저장", "Save All")}
                    </button>
                </div>
                {bulkResult && <Banner type={bulkResult.ok ? "success" : "error"}>{bulkResult.message}</Banner>}
                {bulkErrors.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                        {bulkErrors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            {error && <Banner type="error">{error}</Banner>}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-gray-800">📄 {t("등록된 예측치", "Registered Forecasts")} <span className="font-normal text-gray-400">({displayRows.length.toLocaleString()}{t("건", " rows")})</span></h3>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={skuQuery}
                        onChange={e => setSkuQuery(e.target.value)}
                        placeholder={t("SKU 검색", "Search SKU")}
                        className={`${inputClass} w-56`}
                    />
                    <select
                        value={ymFilter}
                        onChange={e => setYmFilter(e.target.value)}
                        className={`${inputClass} w-32`}
                    >
                        <option value="">{t("전체 YM", "All Year-Months")}</option>
                        {ymOptions.map(ym => <option key={ym} value={ym}>{ym}</option>)}
                    </select>
                    <button type="button" onClick={() => { setEntryMode("select"); setModalOpen(true); }} className={primaryBtnClass}>
                        ➕ {t("등록 / 일괄입력", "Add / Bulk Input")}
                    </button>
                </div>
            </div>

            <DataTable
                columns={columns}
                rows={displayRows}
                rowKey={r => `${r.SKU}__${r.YEAR_MONTH}`}
                visibleRows={12}
                fileName={t("매뉴얼_발주예측", "manual_forecast")}
                defaultSort={(a, b) => a.YEAR_MONTH.localeCompare(b.YEAR_MONTH) || a.SKU.localeCompare(b.SKU)}
            />

            {modalOpen && <Modal onClose={() => setModalOpen(false)}>{modalContent}</Modal>}
        </div>
    );
}
