"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * 화면 표시 언어(한국어/영어) 전환. 표시 문구만 바꾸고 계산 로직·숫자에는 관여하지 않는다.
 * 고른 언어는 localStorage에 저장해서 새로고침해도 유지된다.
 *
 * 사용법: const { t, lang } = useLang();  t("발주량", "Purchase Order Qty")
 * → 한국어 모드면 첫 번째, 영어 모드면 두 번째 문구를 돌려준다. 한국어 원문 바로 옆에 영어를 같이
 *   적어 두는 방식이라, 문구를 고칠 때 두 언어를 한눈에 보면서 같이 고칠 수 있다.
 */
export type Lang = "ko" | "en";

const STORAGE_KEY = "nscope-lang";
const listeners = new Set<() => void>();

function readLang(): Lang {
    try {
        return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ko";
    } catch {
        return "ko";
    }
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    // 다른 탭에서 언어를 바꿨을 때도 따라가도록 storage 이벤트를 같이 듣는다.
    window.addEventListener("storage", cb);
    return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
    };
}

function writeLang(lang: Lang) {
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        // 저장 불가(사생활 보호 모드 등)여도 이번 화면에서는 바뀌도록 아래에서 알림만 보낸다.
    }
    listeners.forEach(cb => cb());
}

type LangContextValue = {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (ko: string, en: string) => string;
};

const LangContext = createContext<LangContextValue>({
    lang: "ko",
    setLang: () => {},
    t: (ko) => ko,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    // 서버 렌더링 시점엔 localStorage가 없으므로 한국어로 그리고, 브라우저에서 저장값으로 바꾼다.
    const lang = useSyncExternalStore(subscribe, readLang, () => "ko" as Lang);

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((l: Lang) => writeLang(l), []);
    const t = useCallback((ko: string, en: string) => (lang === "en" ? en : ko), [lang]);
    const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

    return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
    return useContext(LangContext);
}
