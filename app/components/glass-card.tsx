"use client";

import { Box } from "@mui/material";
import type React from "react";

/** Theme-aware surface tokens (resolve against the active data-theme). */
export const SURFACE = "var(--surface)";
export const BORDER = "var(--border)";
export const SURFACE_DARK = "var(--surface)"; // compatibility exports
export const BORDER_DARK = "var(--border)";
export const SURFACE_LIGHT = "var(--surface)";
export const BORDER_LIGHT = "var(--border)";

/** Surface card used across marketing and dashboard surfaces. Adapts to the
 *  active theme via CSS variables. */
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
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "16px", // md radius token
                p: { xs: 2.5, md: 3 },
                boxShadow: "var(--card-shadow)",
                color: "var(--fg)",
                ...sx,
            }}
        >
            {children}
        </Box>
    );
}

export default GlassCard;
