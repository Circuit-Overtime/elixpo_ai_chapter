"use client";

import { Box, Button, Chip, Container, Grid, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";

// Senders brand list for the trust logos
const SENDER_BRANDS = ["Gmail", "Outlook", "Yahoo", "iCloud", "Zoho", "Proton", "Fastmail", "SMTP"];

export default function PixelHero({ authed }: { authed?: boolean | null }) {
    const signedIn = authed === true;
    const primaryHref = signedIn ? "/dashboard" : "/api/auth/login";
    const primaryLabel = signedIn ? "Go to your dashboard" : "Get started with Elixpo";
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <Box sx={{ minHeight: "100vh" }} />;

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                background: "var(--background)",
                color: "var(--fg)",
                pt: { xs: 8, md: 12 },
                pb: { xs: 6, md: 10 },
                overflow: "hidden",
            }}
        >
            <style>{`
                @keyframes pulseSlow {
                    0%, 100% { opacity: 0.15; transform: scale(1); }
                    50% { opacity: 0.25; transform: scale(1.05); }
                }
            `}</style>

            {/* Centered Hero Header */}
            <Box sx={{ maxWidth: 880, mx: "auto", px: 2.5, textAlign: "center" }}>
                {/* Taxonomy Chip */}
                <Typography
                    sx={{
                        color: "#ff7759", // Coral
                        fontFamily: "var(--font-mono)",
                        fontSize: "13px",
                        fontWeight: 500,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        mb: 2.5,
                        display: "inline-block",
                    }}
                >
                    Event-based transactional email
                </Typography>

                {/* Monumental Display Headline */}
                <Typography
                    component="h1"
                    sx={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 500,
                        fontSize: { xs: "3.2rem", sm: "4.8rem", md: "5.5rem" },
                        lineHeight: 0.95,
                        letterSpacing: "-0.04em",
                        color: "var(--fg)",
                        mb: 3,
                        "& span": {
                            fontFamily: "Georgia, serif",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--fg-muted)",
                        },
                    }}
                >
                    Email <span>infrastructure</span> <br />
                    built for developers.
                </Typography>

                {/* Body paragraph */}
                <Typography
                    sx={{
                        fontFamily: "var(--font-sans)",
                        color: "var(--fg-muted)",
                        fontSize: { xs: "1.05rem", md: "1.18rem" },
                        lineHeight: 1.6,
                        maxWidth: 620,
                        mx: "auto",
                        mb: 4.5,
                    }}
                >
                    Bring your own sender, design templates with a live preview, and send them
                    one-time to anyone — no login — or trigger them from your app via a signed
                    webhook. One branded workspace for your whole team.
                </Typography>

                {/* Actions: Pill CTA & Underlined Action Link */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={3}
                    justifyContent="center"
                    alignItems="center"
                    sx={{ mb: 8 }}
                >
                    <Button
                        component="a"
                        href={primaryHref}
                        sx={{
                            background: "var(--fg)",
                            color: "var(--bg)",
                            borderRadius: "32px",
                            px: 3.5,
                            py: 1.4,
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            textTransform: "none",
                            boxShadow: "none",
                            "&:hover": {
                                background: "var(--fg-muted)",
                            },
                        }}
                    >
                        {primaryLabel}
                    </Button>
                    <Button
                        component={Link}
                        href="/docs"
                        sx={{
                            color: "var(--fg)",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            textTransform: "none",
                            borderRadius: "32px",
                            px: 3.5,
                            py: 1.4,
                            background: "var(--surface-2)",
                            backdropFilter: "blur(12px)",
                            border: "1px solid var(--border)",
                            fontFamily: "var(--font-sans)",
                            transition: "all 0.22s ease-in-out",
                            "&:hover": {
                                background: "var(--overlay)",
                                borderColor: "var(--fg)",
                            },
                        }}
                    >
                        Explore the documentation →
                    </Button>
                </Stack>
            </Box>

            {/* Centered monochrome quiet Trust Logo Strip */}
            <Box sx={{ borderTop: "1px solid var(--border)", pt: 6, mt: 4 }}>
                <Container maxWidth="lg">
                    <Typography
                        sx={{
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: 500,
                            letterSpacing: "0.08em",
                            color: "var(--fg-faint)",
                            textTransform: "uppercase",
                            mb: 4,
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        Compatible with any mailbox provider
                    </Typography>

                    <Stack
                        direction="row"
                        spacing={{ xs: 4, sm: 6, md: 8 }}
                        justifyContent="center"
                        alignItems="center"
                        sx={{
                            flexWrap: "wrap",
                            rowGap: 3,
                            "& span": {
                                fontSize: "1.1rem",
                                fontWeight: 700,
                                color: "var(--fg-faint)",
                                letterSpacing: "-0.01em",
                                transition: "color 0.2s ease",
                                cursor: "default",
                                "&:hover": {
                                    color: "var(--fg)",
                                },
                            },
                        }}
                    >
                        {SENDER_BRANDS.map((brand) => (
                            <Typography key={brand} component="span">
                                {brand}
                            </Typography>
                        ))}
                    </Stack>
                </Container>
            </Box>
        </Box>
    );
}
