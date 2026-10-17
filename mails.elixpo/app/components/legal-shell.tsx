"use client";

import { Box, Container, Stack, Typography } from "@mui/material";
import type React from "react";
import PageShell from "./page-shell";

const CORAL = "#ff7759";
const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

/** Chrome for a legal/policy document: aurora shell + centered prose column. */
export function LegalShell({
    title,
    updated,
    intro,
    children,
}: {
    title: string;
    updated: string;
    intro?: string;
    children: React.ReactNode;
}) {
    return (
        <PageShell variant="docs">
            <Container maxWidth="md" sx={{ pt: { xs: 7, md: 10 }, pb: { xs: 8, md: 12 } }}>
                <Box sx={{ maxWidth: 720, mx: "auto" }}>
                    <Typography
                        sx={{
                            color: CORAL,
                            fontWeight: 500,
                            fontSize: "12px",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            mb: 2.5,
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        Legal
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "2.2rem", md: "3.2rem" },
                            letterSpacing: "-0.03em",
                            lineHeight: 1.05,
                            color: "var(--fg)",
                            mb: 2,
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        {title}
                    </Typography>
                    <Typography
                        sx={{
                            color: SLATE,
                            fontSize: "0.85rem",
                            mb: intro ? 3.5 : 5,
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        Last updated {updated}
                    </Typography>
                    {intro && (
                        <Typography
                            sx={{
                                color: INK,
                                fontSize: "1.05rem",
                                lineHeight: 1.65,
                                mb: 5,
                                fontFamily: "var(--font-sans)",
                            }}
                        >
                            {intro}
                        </Typography>
                    )}
                    <Stack spacing={4.5}>{children}</Stack>

                    <Box
                        sx={{
                            mt: 7,
                            pt: 3,
                            borderTop: `1px solid ${HAIRLINE}`,
                            color: SLATE,
                            fontSize: "0.88rem",
                            lineHeight: 1.6,
                        }}
                    >
                        Questions about this policy? Contact us at{" "}
                        <Box
                            component="a"
                            href="mailto:hello@elixpo.com"
                            sx={{
                                color: "var(--action-fg)",
                                textDecoration: "underline",
                                "&:hover": { color: "var(--accent)" },
                            }}
                        >
                            hello@elixpo.com
                        </Box>
                        .
                    </Box>
                </Box>
            </Container>
        </PageShell>
    );
}

/** A titled section within a legal document. */
export function LegalSection({
    heading,
    children,
}: { heading: string; children: React.ReactNode }) {
    return (
        <Box component="section">
            <Typography
                component="h2"
                sx={{
                    fontWeight: 500,
                    fontSize: { xs: "1.3rem", md: "1.5rem" },
                    letterSpacing: "-0.018em",
                    color: "var(--fg)",
                    mb: 2,
                    fontFamily: "var(--font-display)",
                }}
            >
                {heading}
            </Typography>
            <Stack spacing={1.8}>{children}</Stack>
        </Box>
    );
}

/** A paragraph of legal prose. */
export function LegalP({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                color: INK,
                fontSize: "0.95rem",
                lineHeight: 1.65,
                fontFamily: "var(--font-sans)",
            }}
        >
            {children}
        </Typography>
    );
}

/** A bulleted list of points. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
    return (
        <Stack component="ul" spacing={1.2} sx={{ m: 0, pl: 0, listStyle: "none" }}>
            {items.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list items
                <Stack key={i} component="li" direction="row" spacing={1.5} alignItems="flex-start">
                    <Box
                        aria-hidden
                        sx={{
                            mt: "0.6em",
                            flexShrink: 0,
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: CORAL,
                        }}
                    />
                    <Typography
                        sx={{
                            color: INK,
                            fontSize: "0.95rem",
                            lineHeight: 1.65,
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        {item}
                    </Typography>
                </Stack>
            ))}
        </Stack>
    );
}
