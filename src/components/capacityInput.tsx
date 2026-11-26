"use client";

// 사이드바: 공장별 주간 캐파 입력 (공장당 한 칸). 1주차 선적에만 상한으로 쓰고, 비운 공장은 상한 없음.
// 숫자를 입력하고 옆의 [적용](또는 Enter)을 눌러야 계산에 반영된다 — 칠 때마다 다시 계산하지 않게.
// 입력칸 안의 ×는 그 공장 캐파를 바로 지운다(상한 없음으로 적용).

import { useState } from "react";
import type { CapacityTable } from "@/lib/calc/capacity";
import { useLang } from "@/lib/i18n";

function parseNum(s: string): number | null {
    const v = s.replace(/[,\s]/g, "");
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function CapacityInput({
    factories,
    capacity,
    onChange,
}: {
    factories: string[];
    capacity: CapacityTable;
    onChange: (c: CapacityTable) => void;
}) {
    const { t } = useLang();
    // 아직 적용 안 한 입력값. 없으면(undefined) 적용된 값을 그대로 보여준다.
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const appliedText = (f: string) => {
        const v = capacity[f]?.[0];
        return v == null ? "" : String(v);
    };

    function commit(f: string, raw: string) {
        const value = parseNum(raw);
        const next = { ...capacity };
        if (value == null) delete next[f];
        else next[f] = [value];
        onChange(next);
        setDrafts(d => {
            const n = { ...d };
            delete n[f];
            return n;
        });
    }

    return (
        <div className="flex flex-col gap-1 text-sm">
            {factories.map(f => {
                const text = drafts[f] ?? appliedText(f);
                // 적용됨 = 저장된 캐파가 있고 칸의 값이 그 값과 같음 → 빨간 바탕. 아니면(입력만 했거나 비어 있음) 테두리만.
                const applied = capacity[f]?.[0] != null && parseNum(text) === capacity[f]![0];
                return (
                    <div key={f} className="flex items-center" style={{ gap: 8 }}>
                        <span className="flex-shrink-0 font-medium text-gray-700" style={{ width: 40 }}>{f}</span>
                        <div className="relative flex-shrink-0" style={{ width: 120 }}>
                            <input
                                inputMode="numeric"
                                placeholder={t("캐파 없음", "No limit")}
                                value={text}
                                onChange={e => setDrafts(d => ({ ...d, [f]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") commit(f, text); }}
                                style={{ width: 120, paddingRight: 24 }}
                                className="h-8 rounded bg-white pl-2 text-right text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
                            />
                            {text !== "" && (
                                <button
                                    type="button"
                                    aria-label={t(`${f} 캐파 지우기`, `Clear ${f} capacity`)}
                                    onClick={() => commit(f, "")}
                                    className="absolute text-gray-400 hover:text-gray-700"
                                    style={{ right: 6, top: "50%", transform: "translateY(-50%)", lineHeight: 1, fontSize: 15 }}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => commit(f, text)}
                            className="h-8 flex-shrink-0 rounded text-sm font-medium hover:opacity-90"
                            style={applied
                                ? { padding: "0 14px", minWidth: 68, whiteSpace: "nowrap", backgroundColor: "#ff4b4b", color: "#ffffff", border: "1px solid #ff4b4b", cursor: "pointer" }
                                : { padding: "0 14px", minWidth: 68, whiteSpace: "nowrap", backgroundColor: "#ffffff", color: "#ff4b4b", border: "1px solid #ff4b4b", cursor: "pointer" }}
                        >
                            {applied ? t("적용됨", "Applied") : t("적용", "Apply")}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
