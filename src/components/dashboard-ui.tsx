"use client";

import { Box, Typography } from "@mui/material";
import { createTheme } from "@mui/material/styles";
import type React from "react";

/** Surface tokens — reference the CSS theme variables so they flip light/dark. */
export const SURFACE = "var(--app-surface)";
export const SURFACE_HOVER = "var(--app-surface-2)";
export const BORDER = "var(--app-border)";

/** Build the MUI theme for the dashboard in either mode. */
export function makeDashboardTheme(mode: "light" | "dark") {
    return createTheme({
        palette: {
            mode,
            primary: { main: mode === "dark" ? "#9b7bf7" : "#7c5cff" },
            // Concrete colors (not CSS vars): MUI runs decomposeColor/alpha on
            // palette values internally and throws on var(...). The theme is
            // rebuilt per-mode via makeDashboardTheme, so these track the toggle.
            background: {
                default: mode === "dark" ? "#0b0d12" : "#ffffff",
                paper: mode === "dark" ? "#13161d" : "#ffffff",
            },
            text: {
                primary: mode === "dark" ? "#f5f5f4" : "#141413",
                secondary:
                    mode === "dark"
                        ? "rgba(245,245,244,0.62)"
                        : "rgba(20,20,19,0.66)",
            },
            // Concrete color (not a CSS var): MUI runs alpha()/decomposeColor on
            // palette.divider (e.g. inside <Divider>), which throws on var(...).
            divider:
                mode === "dark"
                    ? "rgba(255,255,255,0.09)"
                    : "rgba(20,20,19,0.12)",
        },
        typography: { fontFamily: "var(--font-geist-sans), Arial, sans-serif" },
        components: {
            MuiPaper: {
                styleOverrides: {
                    root: {
                        backgroundImage: "none",
                        background: "var(--app-surface)",
                        border: "1px solid var(--app-border)",
                        borderRadius: "12px",
                    },
                },
            },
        },
    });
}

/** Default (dark) theme — kept for any caller that doesn't switch modes. */
export const dashboardTheme = makeDashboardTheme("dark");

const SYMBOLS: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
};

export function formatMoney(minor: number, currency: string): string {
    const symbol = SYMBOLS[currency] ?? `${currency} `;
    return `${symbol}${(minor / 100).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}`;
}

export function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso.replace(" ", "T") + (iso.includes("T") ? "" : "Z"));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function GlassCard({
    children,
    sx,
}: {
    children: React.ReactNode;
    sx?: any;
}) {
    return (
        <Box
            sx={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: "12px",
                p: { xs: 2.5, md: 3 },
                boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

const STATUS_COLORS: Record<string, { c: string; bg: string; b: string }> = {
    captured: {
        c: "#4ade80",
        bg: "rgba(34,197,94,0.1)",
        b: "rgba(34,197,94,0.25)",
    },
    active: {
        c: "#4ade80",
        bg: "rgba(34,197,94,0.1)",
        b: "rgba(34,197,94,0.25)",
    },
    created: {
        c: "#fbbf24",
        bg: "rgba(251,191,36,0.1)",
        b: "rgba(251,191,36,0.25)",
    },
    open: {
        c: "#fbbf24",
        bg: "rgba(251,191,36,0.1)",
        b: "rgba(251,191,36,0.25)",
    },
    failed: {
        c: "#f87171",
        bg: "rgba(239,68,68,0.1)",
        b: "rgba(239,68,68,0.25)",
    },
    expired: {
        c: "#9ca3af",
        bg: "rgba(156,163,175,0.1)",
        b: "rgba(156,163,175,0.2)",
    },
    none: {
        c: "#9ca3af",
        bg: "rgba(156,163,175,0.1)",
        b: "rgba(156,163,175,0.2)",
    },
};

export function StatusChip({ status }: { status: string }) {
    const s = STATUS_COLORS[status] ?? STATUS_COLORS.none;
    return (
        <Box
            component="span"
            sx={{
                display: "inline-block",
                px: 1.1,
                py: 0.3,
                borderRadius: "6px",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: s.c,
                background: s.bg,
                border: `1px solid ${s.b}`,
                textTransform: "capitalize",
            }}
        >
            {status}
        </Box>
    );
}

export function StatCard({
    label,
    value,
    sub,
    accent = "#9b7bf7",
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: string;
}) {
    return (
        <GlassCard>
            <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.2 }}
            >
                <Box
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: accent,
                    }}
                />
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.76rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                    }}
                >
                    {label}
                </Typography>
            </Box>
            <Typography
                sx={{
                    fontWeight: 700,
                    fontSize: "1.85rem",
                    color: "var(--app-fg)",
                    lineHeight: 1.1,
                }}
            >
                {value}
            </Typography>
            {sub && (
                <Typography
                    sx={{
                        color: "var(--app-fg-faint)",
                        fontSize: "0.82rem",
                        mt: 0.6,
                    }}
                >
                    {sub}
                </Typography>
            )}
        </GlassCard>
    );
}
