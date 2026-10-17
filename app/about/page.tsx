"use client";

import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import PageShell from "../components/page-shell";

const BLOCKS: { title: string; body: string; category: string }[] = [
    {
        title: "Hosted checkout",
        body: "We host the checkout page and send your customer there to pay. Their card details never touch your servers, so you stay out of scope for compliance.",
        category: "PAYMENTS",
    },
    {
        title: "Every payment tracked",
        body: "Every charge, split, and payout is recorded in one place — accurate, and safe to retry. So your numbers always reconcile.",
        category: "TRACKING",
    },
    {
        title: "Instant access on payment",
        body: "When a payment succeeds, we notify your app with a signed webhook so you can unlock access right away. You can also check a user's access anytime via the API.",
        category: "ACCESS",
    },
    {
        title: "Razorpay now, Stripe soon",
        body: "Use your own Razorpay account today. Stripe for international payments is coming soon — and you can switch or add providers without changing your code.",
        category: "ROUTING",
    },
    {
        title: "Creator payouts",
        body: "Keep your commission and pay the rest to your creators or sellers automatically — directly to their bank accounts, on a schedule.",
        category: "PAYOUTS",
    },
    {
        title: "Merchant dashboard",
        body: "Sign in with Elixpo Accounts to see your payments, set your prices, manage API keys, and track webhooks — all in real time.",
        category: "PORTAL",
    },
];

const ROADMAP: {
    phase: string;
    title: string;
    body: string;
    done?: boolean;
}[] = [
    {
        phase: "P0",
        title: "Billing core",
        body: "Hosted checkout, subscriptions with revenue splits, webhooks, and a merchant dashboard. Already powering billing across Elixpo's own apps.",
        done: true,
    },
    {
        phase: "P1",
        title: "Payouts to banks",
        body: "Pay merchant and creator balances to their connected bank accounts, with subscription splits and KYC verification.",
    },
    {
        phase: "P2",
        title: "Open to any platform",
        body: "Self-serve sign-up: register your own product, connect your own payment providers, and handle sales tax automatically.",
    },
    {
        phase: "P3",
        title: "More for marketplaces",
        body: "Usage-based billing, analytics dashboards, fraud detection, and localized checkout — including Stripe for international payments.",
    },
];

export default function AboutPage() {
    return (
        <PageShell variant="default">
            <Container
                maxWidth="lg"
                sx={{ pb: { xs: 8, md: 14 } }}
            >
                {/* Header */}
                <Stack
                    alignItems="center"
                    textAlign="center"
                    spacing={2}
                    sx={{ mb: { xs: 6, md: 10 } }}
                >
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: "#CF4500" }} />
                        <Typography
                            sx={{
                                fontSize: "14px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)",
                                textTransform: "uppercase",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            THE PLATFORM
                        </Typography>
                    </Stack>
                    <Typography
                        variant="h2"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "32px", md: "48px" },
                            letterSpacing: "-2%",
                            lineHeight: 1.1,
                            color: "var(--app-fg)",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Everything you need to take payments — in six parts
                    </Typography>
                    <Typography
                        sx={{
                            maxWidth: 640,
                            color: "var(--app-fg)",
                            fontSize: "16px",
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        Elixpo Pay lets your platform charge customers and pay your creators through one simple integration — so you never have to build payments yourself.
                    </Typography>
                </Stack>

                {/* Building Blocks Grid */}
                <Box
                    sx={{
                        display: "grid",
                        gap: 4,
                        gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(2, 1fr)",
                        },
                        mb: { xs: 8, md: 12 },
                    }}
                >
                    {BLOCKS.map((b) => (
                        <Box
                            key={b.title}
                            sx={{
                                p: { xs: 3.5, md: 4 },
                                borderRadius: "24px",
                                background: "var(--app-bg-2)", // Lifted Cream
                                border: "1.5px solid var(--app-overlay)",
                                boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                            }}
                        >
                            <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                sx={{ mb: 2 }}
                            >
                                <Box
                                    sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: "#CF4500", // Signal Orange eyebrow dot
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "11px",
                                        letterSpacing: "0.04em",
                                        color: "var(--app-fg-muted)",
                                        textTransform: "uppercase",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    {b.category}
                                </Typography>
                            </Stack>
                            <Typography
                                variant="h3"
                                sx={{
                                    fontWeight: 500,
                                    fontSize: "22px",
                                    letterSpacing: "-1%",
                                    color: "var(--app-fg)",
                                    mb: 1.5,
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                {b.title}
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--app-fg)", // Charcoal
                                    fontSize: "15px",
                                    lineHeight: 1.6,
                                    fontFamily: "var(--font-sofia-sans)",
                                    fontWeight: 450,
                                }}
                            >
                                {b.body}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {/* Roadmap Header */}
                <Typography
                    variant="h2"
                    sx={{
                        textAlign: "center",
                        fontWeight: 500,
                        fontSize: { xs: "28px", md: "36px" },
                        letterSpacing: "-2%",
                        color: "var(--app-fg)",
                        mb: { xs: 4, md: 6 },
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    Where the platform is headed
                </Typography>

                {/* Roadmap Stack */}
                <Stack spacing={3} sx={{ mb: { xs: 8, md: 12 } }}>
                    {ROADMAP.map((r) => (
                        <Stack
                            key={r.phase}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={4}
                            sx={{
                                p: { xs: 3.5, md: 4 },
                                borderRadius: "24px",
                                background: "var(--app-bg-2)", // Lifted Cream
                                border: "1.5px solid var(--app-overlay)",
                                boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                            }}
                        >
                            <Stack
                                direction="row"
                                spacing={2}
                                alignItems="center"
                                sx={{ minWidth: 160 }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "18px",
                                        fontWeight: 700,
                                        color: r.done ? "#CF4500" : "var(--app-fg-muted)",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    {r.phase}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontWeight: 500,
                                        fontSize: "18px",
                                        color: "var(--app-fg)",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    {r.title}
                                </Typography>
                            </Stack>

                            <Box sx={{ flexGrow: 1 }}>
                                <Typography
                                    sx={{
                                        color: "var(--app-fg)",
                                        fontSize: "15px",
                                        lineHeight: 1.5,
                                        fontFamily: "var(--font-sofia-sans)",
                                        fontWeight: 450,
                                    }}
                                >
                                    {r.body}
                                </Typography>
                            </Box>

                            {r.done && (
                                <Box sx={{ display: "flex", alignItems: "center" }}>
                                    <Box
                                        sx={{
                                            px: 2,
                                            py: 0.5,
                                            borderRadius: "999px",
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            color: "#FFFFFF",
                                            background: "#CF4500", // Signal Orange for compliance/consents
                                            border: "none",
                                            fontFamily: "var(--font-sofia-sans)",
                                        }}
                                    >
                                        Active
                                    </Box>
                                </Box>
                            )}
                        </Stack>
                    ))}
                </Stack>

                {/* Call to Action (CTA) */}
                <Stack
                    alignItems="center"
                    spacing={3}
                    sx={{
                        p: { xs: 4, md: 6 },
                        borderRadius: "32px",
                        background: "var(--app-ink)", // Ink Black surface
                        color: "var(--app-on-ink)",
                        textAlign: "center",
                    }}
                >
                    <Typography
                        variant="h3"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "24px", md: "32px" },
                            letterSpacing: "-2%",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Ready to start charging?
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-on-ink-muted)",
                            fontSize: "16px",
                            maxWidth: "500px",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Create your merchant credential, adapt your pricing schema, and capture checkout revenue globally.
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ width: { xs: "100%", sm: "auto" } }}>
                        {/* Primary Button — Ink Pill (Canvas Cream bg here since background is Ink Black) */}
                        <Button
                            component={Link}
                            href="/login"
                            variant="contained"
                            disableElevation
                            sx={{
                                background: "var(--app-on-ink)", // Light pill on ink slab
                                color: "var(--app-ink)", // Ink text
                                border: "1.5px solid var(--app-on-ink)",
                                borderRadius: "20px",
                                px: 4,
                                py: 1.5,
                                fontSize: "16px",
                                fontWeight: 500,
                                textTransform: "none",
                                fontFamily: "var(--font-sofia-sans)",
                                "&:hover": {
                                    background: "var(--app-on-ink-muted)",
                                    borderColor: "var(--app-on-ink-muted)",
                                },
                            }}
                        >
                            Start Building
                        </Button>
                        {/* Secondary Button — Outlined Pill */}
                        <Button
                            component={Link}
                            href="/docs"
                            variant="outlined"
                            disableElevation
                            sx={{
                                color: "var(--app-on-ink)",
                                border: "1.5px solid var(--app-on-ink-muted)",
                                borderRadius: "20px",
                                px: 4,
                                py: 1.5,
                                fontSize: "16px",
                                fontWeight: 500,
                                textTransform: "none",
                                fontFamily: "var(--font-sofia-sans)",
                                "&:hover": {
                                    borderColor: "var(--app-on-ink)",
                                    background: "rgba(255, 255, 255, 0.05)",
                                },
                            }}
                        >
                            Read the Docs
                        </Button>
                    </Stack>
                </Stack>
            </Container>
        </PageShell>
    );
}
