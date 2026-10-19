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
                minHeight: { md: "calc(100svh - 94px)" },
                pt: { xs: 10, md: 15 },
                pb: { xs: 6, md: 8 },
                overflow: "hidden",
            }}
        >
            <style>{`
                @keyframes pulseSlow {
                    0%, 100% { opacity: 0.15; transform: scale(1); }
                    50% { opacity: 0.25; transform: scale(1.05); }
                }
            `}</style>

            <Box aria-hidden sx={{ display: { xs: "none", lg: "block" } }}>
                <Box
                    sx={{
                        position: "absolute",
                        width: 430,
                        height: 430,
                        border: "1px solid rgba(20,32,24,.2)",
                        borderRadius: "50%",
                        right: -120,
                        top: 80,
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        width: 155,
                        height: 155,
                        borderRadius: "45% 55% 66% 34%",
                        bgcolor: "#f0b526",
                        right: "12%",
                        top: "23%",
                        transform: "rotate(13deg)",
                        boxShadow: "0 28px 75px rgba(20,32,24,.14)",
                    }}
                />
                <Box
                    sx={{
                        position: "absolute",
                        width: 190,
                        height: 112,
                        border: "1px solid var(--border)",
                        borderRadius: "18px",
                        bgcolor: "rgba(255,255,255,.72)",
                        right: "25%",
                        bottom: "18%",
                        transform: "rotate(7deg)",
                        backdropFilter: "blur(12px)",
                        display: "grid",
                        placeItems: "center",
                        color: "#3a65c7",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        fontSize: ".72rem",
                        letterSpacing: ".14em",
                    }}
                >
                    EVENT → EMAIL
                </Box>
            </Box>

            {/* Editorial hero header */}
            <Box
                sx={{
                    maxWidth: 1450,
                    mx: "auto",
                    px: { xs: 2.5, md: 4 },
                    textAlign: "left",
                    position: "relative",
                    zIndex: 1,
                }}
            >
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
                    Elixpo Mails / Delivery platform
                </Typography>

                {/* Monumental Display Headline */}
                <Typography
                    component="h1"
                    sx={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 500,
                        fontSize: { xs: "3.35rem", sm: "5rem", md: "clamp(5rem,7.6vw,7.7rem)" },
                        lineHeight: 0.9,
                        letterSpacing: "-0.067em",
                        color: "var(--fg)",
                        mb: 3,
                        maxWidth: 1120,
                        "& span": {
                            fontFamily: "Georgia, serif",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--fg-muted)",
                        },
                    }}
                >
                    Transactional email,
                    <br />
                    under <span>your control.</span>
                </Typography>

                {/* Body paragraph */}
                <Typography
                    sx={{
                        fontFamily: "var(--font-sans)",
                        color: "var(--fg-muted)",
                        fontSize: { xs: "1.05rem", md: "1.18rem" },
                        lineHeight: 1.6,
                        maxWidth: 720,
                        mb: 4.5,
                    }}
                >
                    Elixpo Mails is the control plane between your product events and your own SMTP
                    provider. Your team designs, approves, triggers, and audits expected email; your
                    provider remains the sender of record.
                </Typography>

                {/* Actions: Pill CTA & Underlined Action Link */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={3}
                    justifyContent="flex-start"
                    alignItems={{ xs: "stretch", sm: "center" }}
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
            <Box
                sx={{
                    borderTop: "1px solid var(--border)",
                    pt: 5,
                    mt: { xs: 4, md: 6 },
                    position: "relative",
                    zIndex: 1,
                }}
            >
                <Container maxWidth="lg">
                    <Typography
                        sx={{
                            textAlign: { xs: "left", md: "center" },
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
                        justifyContent={{ xs: "flex-start", md: "center" }}
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
