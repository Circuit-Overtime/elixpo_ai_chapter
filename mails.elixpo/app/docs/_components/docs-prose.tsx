"use client";

import { Box, Chip, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";

const CORAL = "#ff7759";
const ACTION_BLUE = "var(--action-fg)";
const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

export function DocTitle({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h1"
            sx={{
                fontWeight: 500,
                fontSize: "2.2rem",
                letterSpacing: "-0.03em",
                mb: 2,
                color: "var(--fg)",
                fontFamily: "var(--font-display)",
                lineHeight: 1.1,
            }}
        >
            {children}
        </Typography>
    );
}

export function DocLead({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                color: SLATE,
                fontSize: "1.05rem",
                lineHeight: 1.6,
                mb: 3.5,
                fontFamily: "var(--font-sans)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocH2({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h2"
            sx={{
                fontWeight: 500,
                fontSize: "1.45rem",
                mt: 4.5,
                mb: 1.8,
                color: "var(--fg)",
                letterSpacing: "-0.02em",
                fontFamily: "var(--font-display)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocH3({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h3"
            sx={{
                fontWeight: 500,
                fontSize: "1.15rem",
                mt: 3.5,
                mb: 1.2,
                color: "var(--fg)",
                fontFamily: "var(--font-display)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocP({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                color: INK,
                lineHeight: 1.65,
                mb: 2,
                fontSize: "0.95rem",
                fontFamily: "var(--font-sans)",
            }}
        >
            {children}
        </Typography>
    );
}

export function DocList({ items }: { items: React.ReactNode[] }) {
    return (
        <Box
            component="ul"
            sx={{
                color: INK,
                pl: 3,
                mb: 2.5,
                fontFamily: "var(--font-sans)",
                "& li": { mb: 1, lineHeight: 1.6, fontSize: "0.95rem" },
            }}
        >
            {items.map((it, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static docs list
                <li key={i}>{it}</li>
            ))}
        </Box>
    );
}

export function Code({ children }: { children: React.ReactNode }) {
    return (
        <Box
            component="code"
            sx={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.85rem",
                background: "var(--surface-3)",
                color: "var(--code-fg)",
                px: 0.6,
                py: 0.2,
                borderRadius: "4px",
                border: `1px solid ${HAIRLINE}`,
            }}
        >
            {children}
        </Box>
    );
}

export function BaseUrlChip() {
    return (
        <Chip
            label="Base URL: https://mails.elixpo.com"
            sx={{
                bgcolor: "var(--surface-3)",
                color: INK,
                border: `1px solid ${HAIRLINE}`,
                fontFamily: "var(--font-mono)",
                fontSize: "0.82rem",
                borderRadius: "4px",
                mb: 4,
            }}
        />
    );
}

/** A note / tip callout box. */
export function Callout({
    title,
    children,
    tone = "info",
}: {
    title?: string;
    children: React.ReactNode;
    tone?: "info" | "warn";
}) {
    const isWarn = tone === "warn";
    const borderColor = isWarn ? CORAL : ACTION_BLUE;
    const bgColor = isWarn ? "var(--callout-warn-bg)" : "var(--callout-info-bg)";

    return (
        <Box
            sx={{
                my: 3,
                p: 2.5,
                borderRadius: "8px",
                border: `1px solid ${isWarn ? "rgba(255, 119, 89, 0.25)" : "rgba(24, 99, 220, 0.15)"}`,
                background: bgColor,
                borderLeft: `3px solid ${borderColor}`,
            }}
        >
            {title && (
                <Typography
                    sx={{
                        fontWeight: 600,
                        fontSize: "0.88rem",
                        color: isWarn ? CORAL : ACTION_BLUE,
                        mb: 0.8,
                        letterSpacing: "0.02em",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                    }}
                >
                    {title}
                </Typography>
            )}
            <Box
                sx={{
                    color: INK,
                    fontSize: "0.92rem",
                    lineHeight: 1.6,
                    fontFamily: "var(--font-sans)",
                    "& a": { color: ACTION_BLUE, textDecoration: "underline" },
                }}
            >
                {children}
            </Box>
        </Box>
    );
}

/** A "next:" navigation link at the bottom of a page. */
export function NextLink({ href, label }: { href: string; label: string }) {
    return (
        <Box sx={{ mt: 5 }}>
            <Box
                component={Link}
                href={href}
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    color: ACTION_BLUE,
                    fontWeight: 500,
                    fontSize: "0.92rem",
                    textDecoration: "none",
                    px: 3,
                    py: 1,
                    borderRadius: "32px", // Pill outline
                    border: `1px solid ${HAIRLINE}`,
                    fontFamily: "var(--font-sans)",
                    transition: "all 0.2s ease",
                    "&:hover": {
                        borderColor: "var(--fg)",
                        background: "var(--overlay)",
                    },
                }}
            >
                Next: {label} →
            </Box>
        </Box>
    );
}
