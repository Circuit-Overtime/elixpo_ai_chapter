"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BusinessIcon from "@mui/icons-material/Business";
import Check from "@mui/icons-material/Check";
import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import PageShell from "../components/page-shell";
import PricingFaq, { type Faq } from "../components/pricing-faq";

const CORAL = "#ff7759";
const INK = "var(--fg)";
const SLATE = "var(--fg-muted)";
const HAIRLINE = "var(--border)";

const PRIMARY_BTN = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: "var(--bg)",
    px: 3,
    py: 1.1,
    borderRadius: "32px", // Pill
    background: "var(--fg)",
    boxShadow: "none",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--fg-muted)" },
};

const OUTLINE_BTN = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: "var(--fg)",
    px: 3,
    py: 1.1,
    borderRadius: "32px", // Pill outline
    border: "1px solid var(--border)",
    background: "transparent",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--overlay)", borderColor: "var(--fg)" },
};

interface Tier {
    name: string;
    price: string;
    cadence: string;
    blurb: string;
    features: string[];
    cta: string;
    popular?: boolean;
}

const TIERS: Tier[] = [
    {
        name: "Starter",
        price: "$0",
        cadence: "/mo",
        blurb: "Everything you need to ship your first transactional emails.",
        features: [
            "1 product",
            "5 templates",
            "1 sender",
            "1,000 sends / month",
            "7-day delivery logs",
            "Community support",
        ],
        cta: "Get started",
    },
    {
        name: "Pro",
        price: "$19",
        cadence: "/mo",
        blurb: "For growing teams sending real transactional volume.",
        features: [
            "10 products",
            "Unlimited templates",
            "5 senders",
            "25,000 sends / month",
            "30-day delivery logs",
            "Secret rotation",
            "Email support",
        ],
        cta: "Start Pro",
        popular: true,
    },
    {
        name: "Scale",
        price: "$99",
        cadence: "/mo",
        blurb: "High-volume sending with priority support and an SLA.",
        features: [
            "Unlimited products",
            "Unlimited senders",
            "250,000 sends / month",
            "90-day delivery logs",
            "Priority support",
            "Uptime SLA",
        ],
        cta: "Start Scale",
    },
];

const FAQS: Faq[] = [
    {
        q: "Do I bring my own sender?",
        a: "Yes. You connect your own mailbox — an email address and an app password — and we send through it. Your domain, your reputation. Credentials are encrypted at rest and never returned to the dashboard.",
    },
    {
        q: "What counts as a send?",
        a: "Each successful delivery to a single recipient triggered through a webhook counts as one send. Failed sends that never leave our system are not counted against your monthly allowance.",
    },
    {
        q: "Can I change plans?",
        a: "You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades apply at the start of your next billing cycle so you keep what you've paid for. (Billing is launching soon.)",
    },
    {
        q: "Is there a free tier?",
        a: "Yes — the Starter plan is free forever and includes 1,000 sends a month, one product, one sender, and five templates. No card required to get started.",
    },
    {
        q: "What if I need more volume?",
        a: "Reach out about Enterprise. We offer custom send volumes, dedicated support, and tailored terms for high-scale and regulated workloads.",
    },
];

function TierCard({ tier }: { tier: Tier }) {
    return (
        <Box
            sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                borderRadius: "16px", // md radius token
                p: { xs: 3.5, md: 4 },
                background: "var(--surface)",
                border: tier.popular ? `2px solid ${INK}` : `1px solid ${HAIRLINE}`,
                boxShadow: "none",
                height: "100%",
            }}
        >
            {tier.popular && (
                <Chip
                    label="Popular"
                    size="small"
                    sx={{
                        position: "absolute",
                        top: -12,
                        left: 24,
                        height: 22,
                        fontSize: "0.68rem",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        color: "var(--bg)",
                        background: INK,
                        borderRadius: "4px",
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                    }}
                />
            )}
            <Typography
                sx={{
                    fontWeight: 500,
                    fontSize: "1.25rem",
                    color: INK,
                    fontFamily: "var(--font-display)",
                }}
            >
                {tier.name}
            </Typography>
            <Stack direction="row" alignItems="baseline" spacing={0.6} sx={{ mt: 2 }}>
                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: "2.8rem",
                        color: INK,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                        fontFamily: "var(--font-display)",
                    }}
                >
                    {tier.price}
                </Typography>
                <Typography sx={{ color: SLATE, fontSize: "0.95rem", fontWeight: 500 }}>
                    {tier.cadence}
                </Typography>
            </Stack>
            <Typography
                sx={{
                    color: SLATE,
                    fontSize: "0.9rem",
                    lineHeight: 1.55,
                    mt: 2.2,
                    minHeight: { md: 50 },
                }}
            >
                {tier.blurb}
            </Typography>

            <Button
                component="a"
                href="/api/auth/login"
                endIcon={<ArrowForwardIcon sx={{ fontSize: "1rem !important" }} />}
                fullWidth
                sx={{ ...(tier.popular ? PRIMARY_BTN : OUTLINE_BTN), mt: 3.5, py: 1.2 }}
            >
                {tier.cta}
            </Button>

            <Stack spacing={1.6} sx={{ mt: 4.5, borderTop: `1px solid ${HAIRLINE}`, pt: 3.5 }}>
                {tier.features.map((f) => (
                    <Stack key={f} direction="row" spacing={1.5} alignItems="flex-start">
                        <Check sx={{ fontSize: 16, color: CORAL, mt: "2px", flexShrink: 0 }} />
                        <Typography sx={{ color: INK, fontSize: "0.88rem", lineHeight: 1.5 }}>
                            {f}
                        </Typography>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}

export default function PricingClient() {
    return (
        <PageShell variant="default">
            <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 10 } }}>
                {/* Heading */}
                <Stack
                    alignItems="center"
                    textAlign="center"
                    spacing={2.5}
                    sx={{ mb: { xs: 6, md: 9 } }}
                >
                    <Typography
                        sx={{
                            color: CORAL,
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            fontWeight: 500,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                        }}
                    >
                        Pricing
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "2.4rem", md: "3.6rem" },
                            letterSpacing: "-0.03em",
                            lineHeight: 1.05,
                            color: INK,
                            maxWidth: 760,
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Simple pricing that scales with your sending.
                    </Typography>
                    <Typography
                        sx={{
                            maxWidth: 560,
                            color: SLATE,
                            fontSize: { xs: "1rem", md: "1.12rem" },
                            lineHeight: 1.65,
                        }}
                    >
                        Start free, bring your own sender, and only pay as your transactional volume
                        grows. No mail infra to build, no lock-in.
                    </Typography>
                </Stack>

                {/* Tier cards */}
                <Box
                    sx={{
                        display: "grid",
                        gap: 3.5,
                        gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                        alignItems: "stretch",
                        mt: 2,
                    }}
                >
                    {TIERS.map((t) => (
                        <TierCard key={t.name} tier={t} />
                    ))}
                </Box>
            </Container>

            {/* Enterprise Strip: Soft Stone panel with thin rule boundaries */}
            <Container maxWidth="lg" sx={{ pb: { xs: 6, md: 8 } }}>
                <Box
                    sx={{
                        borderRadius: "22px", // lg radius token
                        border: `1px solid ${HAIRLINE}`,
                        background: "var(--surface-3)",
                        p: { xs: 3.5, md: 5 },
                        display: "flex",
                        flexDirection: { xs: "column", md: "row" },
                        alignItems: { xs: "flex-start", md: "center" },
                        justifyContent: "space-between",
                        gap: 3.5,
                    }}
                >
                    <Stack direction="row" spacing={2.5} alignItems="flex-start">
                        <Box
                            sx={{
                                width: 52,
                                height: 52,
                                borderRadius: "14px",
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                                color: CORAL,
                                background: "rgba(255, 119, 89, 0.08)",
                                border: "1px solid rgba(255, 119, 89, 0.2)",
                            }}
                        >
                            <BusinessIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                            <Typography
                                sx={{
                                    fontWeight: 500,
                                    fontSize: "1.3rem",
                                    color: INK,
                                    mb: 0.8,
                                    fontFamily: "var(--font-display)",
                                }}
                            >
                                Enterprise
                            </Typography>
                            <Typography
                                sx={{
                                    color: SLATE,
                                    fontSize: "0.95rem",
                                    lineHeight: 1.6,
                                    maxWidth: 580,
                                }}
                            >
                                Custom send volume, dedicated support, security review, and tailored
                                terms for high-scale and regulated workloads.
                            </Typography>
                        </Box>
                    </Stack>
                    <Button
                        component="a"
                        href="mailto:hello@elixpo.com"
                        endIcon={<ArrowForwardIcon sx={{ fontSize: "1rem !important" }} />}
                        sx={{ ...OUTLINE_BTN, flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                        Contact sales
                    </Button>
                </Box>
            </Container>

            {/* FAQ: Clean rule-separated list */}
            <Container
                maxWidth="md"
                sx={{ py: { xs: 6, md: 10 }, borderTop: `1px solid ${HAIRLINE}` }}
            >
                <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ mb: 6 }}>
                    <Typography
                        sx={{
                            color: CORAL,
                            fontWeight: 500,
                            fontSize: "0.78rem",
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            fontFamily: "var(--font-mono)",
                        }}
                    >
                        FAQ
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "1.8rem", md: "2.4rem" },
                            letterSpacing: "-0.02em",
                            color: INK,
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Questions, answered
                    </Typography>
                </Stack>

                {/* Embedded custom styling on FAQ rows for rule-separated look */}
                <PricingFaq items={FAQS} />
            </Container>
        </PageShell>
    );
}
