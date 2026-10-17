import type { SvgIconComponent } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";
import { GlassCard } from "./glass-card";

const CORAL = "var(--accent)";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const BORDER = "var(--border)";

export const PRIMARY_BTN = {
    textTransform: "none" as const,
    fontWeight: 600,
    fontSize: "0.88rem",
    color: "var(--accent-contrast)",
    px: 2.8,
    py: 1,
    borderRadius: "32px", // Pill
    background: "var(--accent)",
    boxShadow: "none",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--accent-2)" },
};

export const GHOST_BTN = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.88rem",
    color: TEXT,
    px: 2.6,
    py: 1,
    borderRadius: "32px", // Pill
    border: "1px solid var(--border)",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    "&:hover": { borderColor: "var(--accent-border)", background: "var(--accent-tint)" },
};

/** Page header: title + one-line description, optional right-aligned action. */
export function PageHeader({
    title,
    description,
    action,
}: {
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={2}
            sx={{ mb: { xs: 3.5, md: 4.5 } }}
        >
            <Box>
                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: { xs: "1.55rem", md: "1.9rem" },
                        letterSpacing: "-0.02em",
                        color: TEXT,
                        fontFamily: "var(--font-display)",
                    }}
                >
                    {title}
                </Typography>
                <Typography
                    sx={{
                        color: TEXT_55,
                        fontSize: "0.95rem",
                        mt: 0.5,
                        maxWidth: 620,
                        fontFamily: "var(--font-sans)",
                    }}
                >
                    {description}
                </Typography>
            </Box>
            {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
    );
}

/** A "coming soon" / present primary action button (defaults to disabled-style link). */
export function ActionButton({
    label,
    href = "#",
    icon: Icon,
    comingSoon = false,
}: {
    label: string;
    href?: string;
    icon?: SvgIconComponent;
    comingSoon?: boolean;
}) {
    return (
        <Button
            component={href.startsWith("/") ? Link : "a"}
            href={href}
            startIcon={Icon ? <Icon sx={{ fontSize: "1rem !important" }} /> : undefined}
            sx={{
                ...PRIMARY_BTN,
                ...(comingSoon
                    ? {
                          background: "var(--overlay)",
                          color: "var(--fg-faint)",
                          boxShadow: "none",
                          border: `1px solid ${BORDER}`,
                          "&:hover": { background: "var(--overlay-strong)" },
                      }
                    : {}),
            }}
        >
            {label}
        </Button>
    );
}

/** Centered empty-state inside a GlassCard: icon + headline + subtext + CTA. */
export function EmptyState({
    icon: Icon,
    accent = CORAL,
    headline,
    subtext,
    cta,
}: {
    icon: SvgIconComponent;
    accent?: string;
    headline: string;
    subtext: string;
    cta?: React.ReactNode;
}) {
    return (
        <GlassCard sx={{ py: { xs: 6, md: 8 } }}>
            <Stack alignItems="center" textAlign="center" spacing={2.2}>
                <Box
                    sx={{
                        width: 64,
                        height: 64,
                        borderRadius: "18px",
                        display: "grid",
                        placeItems: "center",
                        color: accent,
                        background: `${accent}14`,
                        border: `1px solid ${accent}33`,
                    }}
                >
                    <Icon sx={{ fontSize: 32 }} />
                </Box>
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 500,
                            fontSize: "1.2rem",
                            color: TEXT,
                            mb: 0.8,
                            fontFamily: "var(--font-display)",
                            letterSpacing: "-0.01em",
                        }}
                    >
                        {headline}
                    </Typography>
                    <Typography
                        sx={{
                            color: TEXT_55,
                            fontSize: "0.95rem",
                            lineHeight: 1.65,
                            maxWidth: 460,
                            mx: "auto",
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        {subtext}
                    </Typography>
                </Box>
                {cta}
            </Stack>
        </GlassCard>
    );
}
