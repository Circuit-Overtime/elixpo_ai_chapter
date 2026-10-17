"use client";

/** URL-driven time-range selector. Updates ?range= so server pages re-fetch. */

import { C } from "@/components/ui";
import { RANGES } from "@/lib/range";
import { Box } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TimeRange() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const current = params.get("range") || "24h";

    const set = (key: string) => {
        const p = new URLSearchParams(params.toString());
        p.set("range", key);
        router.push(`${pathname}?${p.toString()}`);
    };

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                p: 0.25,
                borderRadius: "8px",
                bgcolor: "rgba(255,255,255,0.04)",
                border: `1px solid ${C.border}`,
            }}
        >
            {RANGES.map((r) => {
                const active = current === r.key;
                return (
                    <Box
                        key={r.key}
                        component="button"
                        onClick={() => set(r.key)}
                        sx={{
                            border: "none",
                            cursor: "pointer",
                            px: 1.1,
                            py: 0.4,
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            fontFamily: "inherit",
                            color: active ? "#fff" : C.textMuted,
                            bgcolor: active ? C.accent : "transparent",
                            "&:hover": {
                                color: active ? "#fff" : C.text,
                                bgcolor: active
                                    ? C.accent
                                    : "rgba(255,255,255,0.06)",
                            },
                        }}
                    >
                        {r.label}
                    </Box>
                );
            })}
        </Box>
    );
}
