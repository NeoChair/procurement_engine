"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // 스냅샷은 하루 두 번(AM/PM)만 바뀐다. 탭을 오갈 때는 5분 동안 캐시를 그대로 쓴다.
                staleTime: 5 * 60 * 1000,
                refetchOnWindowFocus: false,
                retry: 1,
            },
        },
    }));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
