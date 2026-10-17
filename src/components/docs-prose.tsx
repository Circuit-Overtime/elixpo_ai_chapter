"use client";

import { Box, Chip, Typography } from "@mui/material";
import type React from "react";

export function DocTitle({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            component="h1"
            sx={{
                fontWeight: 500,
                fontSize: "2.4rem",
                letterSpacing: "-2%",
                mb: 2,
                color: "var(--app-fg)", // Ink Black
                fontFamily: "var(--font-sofia-sans)",
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
                color: "var(--app-fg)", // Charcoal
                fontSize: "1.05rem",
                lineHeight: 1.7,
                mb: 3.5,
                fontFamily: "var(--font-sofia-sans)",
                fontWeight: 450,
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
                fontSize: "1.5rem",
                mt: 5,
                mb: 2,
                color: "var(--app-fg)", // Ink Black
                letterSpacing: "-1%",
                fontFamily: "var(--font-sofia-sans)",
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
                color: "var(--app-fg)", // Charcoal
                lineHeight: 1.7,
                mb: 2,
                fontSize: "1rem",
                fontFamily: "var(--font-sofia-sans)",
                fontWeight: 450,
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
                color: "var(--app-fg)",
                pl: 3,
                mb: 2.5,
                fontFamily: "var(--font-sofia-sans)",
                "& li": { mb: 0.8, lineHeight: 1.65, fontWeight: 450 },
            }}
        >
            {items.map((it, i) => (
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
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.85rem",
                background: "var(--app-overlay)",
                color: "#CF4500", // Signal Orange
                px: 0.6,
                py: 0.2,
                borderRadius: "4px",
            }}
        >
            {children}
        </Box>
    );
}

export function BaseUrlChip() {
    return (
        <Chip
            label="Base URL: https://payouts.elixpo.com"
            sx={{
                bgcolor: "var(--app-overlay)",
                color: "var(--app-fg)",
                border: "1.5px solid var(--app-overlay)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.82rem",
                mb: 4,
            }}
        />
    );
}
