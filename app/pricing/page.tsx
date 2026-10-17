"use client";

import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import PageShell from "../components/page-shell";

interface Tier {
    name: string;
    price: string;
    unit: string;
    rate: string;
    blurb: string;
    features: string[];
    cta: string;
    href: string;
    popular?: boolean;
}

const TIERS: Tier[] = [
    {
        name: "Starter",
        price: "Free",
        unit: "to start",
        rate: "2.0% + ₹3",
        blurb: "Launch your first paid product.",
        features: [
            "Hosted checkout page",
            "Instant access via signed webhooks",
            "1 app connection",
            "Razorpay (INR) payments",
            "Dashboard & reporting",
            "Community Slack support",
        ],
        cta: "Start Free",
        href: "/login",
    },
    {
        name: "Growth",
        price: "₹1,999",
        unit: "/mo + usage",
        rate: "1.5% + ₹3",
        blurb: "Scale revenue across products.",
        features: [
            "Everything in Starter",
            "Creator payouts (RazorpayX)",
            "Unlimited applications",
            "Bring-your-own gateway credentials",
            "Stripe & Razorpay adapters",
            "Priority developer support",
        ],
        cta: "Choose Growth",
        href: "/login",
        popular: true,
    },
    {
        name: "Scale",
        price: "Custom",
        unit: "volume pricing",
        rate: "from 0.9%",
        blurb: "High volume & merchant-of-record.",
        features: [
            "Negotiated volume discounts",
            "Merchant-of-record operations",
            "Local sales tax compliance",
            "Custom payout schedules",
            "Dedicated integration manager",
            "SLA support agreements",
        ],
        cta: "Contact Sales",
        href: "mailto:hello@elixpo.com",
    },
];

const FEES: { label: string; value: string }[] = [
    { label: "Per successful charge", value: "1.5–2.0% + ₹3 (by plan)" },
    { label: "Payouts to creators / sellers", value: "0.25% + ₹5 per payout" },
    { label: "Refunds & chargeback disputes", value: "No Elixpo platform fee" },
    {
        label: "Cross-currency conversion",
        value: "+1% on the converted amount",
    },
];

export default function PricingPage() {
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
                            PRICING PLANS
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
                        Pay only when you get paid
                    </Typography>
                    <Typography
                        sx={{
                            maxWidth: 600,
                            color: "var(--app-fg)",
                            fontSize: "16px",
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        A simple platform fee on each successful charge, on top of your payment provider's own fee. No setup costs, no monthly minimums.
                    </Typography>
                </Stack>

                {/* Tiers Grid */}
                <Box
                    sx={{
                        display: "grid",
                        gap: 4,
                        gridTemplateColumns: {
                            xs: "1fr",
                            md: "repeat(3, 1fr)",
                        },
                        alignItems: "stretch",
                        mb: 8,
                    }}
                >
                    {TIERS.map((t) => (
                        <Box
                            key={t.name}
                            sx={{
                                position: "relative",
                                display: "flex",
                                flexDirection: "column",
                                p: { xs: 3.5, md: 4 },
                                borderRadius: "24px",
                                background: "var(--app-bg-2)", // Lifted Cream
                                border: t.popular
                                    ? "2px solid var(--app-fg)" // Bolder border for popular
                                    : "1.5px solid var(--app-overlay)",
                                boxShadow: t.popular
                                    ? "rgba(0, 0, 0, 0.08) 0px 24px 48px 0px"
                                    : "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                            }}
                        >
                            {t.popular && (
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: 16,
                                        right: 16,
                                        px: 2,
                                        py: 0.5,
                                        borderRadius: "999px",
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        letterSpacing: "0.06em",
                                        textTransform: "uppercase",
                                        color: "var(--app-on-ink)",
                                        background: "var(--app-ink)", // Ink Black pill badge
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    Popular
                                </Box>
                            )}

                            <Typography
                                sx={{
                                    fontWeight: 500,
                                    fontSize: "22px",
                                    color: "var(--app-fg)",
                                    mb: 1.5,
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                {t.name}
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--app-fg-muted)",
                                    fontSize: "14px",
                                    lineHeight: 1.4,
                                    mb: 3,
                                    fontFamily: "var(--font-sofia-sans)",
                                    fontWeight: 450,
                                }}
                            >
                                {t.blurb}
                            </Typography>

                            <Stack
                                direction="row"
                                alignItems="baseline"
                                spacing={1}
                                sx={{ mb: 1 }}
                            >
                                <Typography
                                    sx={{
                                        fontWeight: 500,
                                        fontSize: "36px",
                                        color: "var(--app-fg)",
                                        fontFamily: "var(--font-sofia-sans)",
                                        letterSpacing: "-1px",
                                    }}
                                >
                                    {t.price}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--app-fg-muted)",
                                        fontSize: "14px",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    {t.unit}
                                </Typography>
                            </Stack>

                            <Typography
                                sx={{
                                    color: "#CF4500", // Signal Orange for key pricing metrics
                                    fontSize: "15px",
                                    fontWeight: 600,
                                    mb: 4,
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                {t.rate} per transaction
                            </Typography>

                            {/* Features list */}
                            <Stack spacing={2} sx={{ mb: 5, flexGrow: 1 }}>
                                {t.features.map((f) => (
                                    <Stack
                                        key={f}
                                        direction="row"
                                        spacing={1.5}
                                        alignItems="flex-start"
                                    >
                                        <CheckIcon
                                            sx={{
                                                fontSize: 18,
                                                color: "#CF4500", // Signal Orange check icons
                                                mt: "2px",
                                            }}
                                        />
                                        <Typography
                                            sx={{
                                                color: "var(--app-fg)",
                                                fontSize: "14px",
                                                lineHeight: 1.4,
                                                fontFamily: "var(--font-sofia-sans)",
                                                fontWeight: 450,
                                            }}
                                        >
                                            {f}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>

                            {/* Action CTA Button */}
                            {t.popular ? (
                                /* Primary Ink Pill */
                                <Button
                                    component={Link}
                                    href={t.href}
                                    variant="contained"
                                    disableElevation
                                    sx={{
                                        background: "var(--app-ink)",
                                        color: "var(--app-on-ink)",
                                        border: "1.5px solid var(--app-ink)",
                                        borderRadius: "20px",
                                        py: 1.4,
                                        fontSize: "15px",
                                        fontWeight: 500,
                                        textTransform: "none",
                                        fontFamily: "var(--font-sofia-sans)",
                                        "&:hover": {
                                            background: "var(--app-ink)",
                                            borderColor: "var(--app-ink)",
                                        },
                                    }}
                                >
                                    {t.cta}
                                </Button>
                            ) : (
                                /* Secondary Outlined Pill */
                                <Button
                                    component={t.href.startsWith("mailto:") ? "a" : Link}
                                    href={t.href}
                                    variant="outlined"
                                    disableElevation
                                    sx={{
                                        background: "var(--app-surface)",
                                        color: "var(--app-fg)",
                                        border: "1.5px solid var(--app-fg)",
                                        borderRadius: "20px",
                                        py: 1.4,
                                        fontSize: "15px",
                                        fontWeight: 500,
                                        textTransform: "none",
                                        fontFamily: "var(--font-sofia-sans)",
                                        "&:hover": {
                                            background: "var(--app-overlay)",
                                            borderColor: "var(--app-fg)",
                                        },
                                    }}
                                >
                                    {t.cta}
                                </Button>
                            )}
                        </Box>
                    ))}
                </Box>

                {/* Line Item Fee Breakdown */}
                <Box
                    sx={{
                        p: { xs: 4, md: 5 },
                        borderRadius: "24px",
                        background: "var(--app-bg-2)", // Lifted Cream
                        border: "1.5px solid var(--app-overlay)",
                        boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                        mb: 6,
                    }}
                >
                    <Typography
                        variant="h3"
                        sx={{
                            fontWeight: 500,
                            fontSize: "22px",
                            mb: 3,
                            color: "var(--app-fg)",
                            letterSpacing: "-1%",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Detailed fee breakdown
                    </Typography>

                    <Stack
                        divider={
                            <Box
                                sx={{
                                    borderTop: "1px solid var(--app-overlay)",
                                }}
                            />
                        }
                    >
                        {FEES.map((row) => (
                            <Stack
                                key={row.label}
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{ py: 2, gap: 2 }}
                            >
                                <Typography
                                    sx={{
                                        color: "var(--app-fg)",
                                        fontSize: "15px",
                                        fontFamily: "var(--font-sofia-sans)",
                                        fontWeight: 450,
                                    }}
                                >
                                    {row.label}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--app-fg)",
                                        fontWeight: 500,
                                        fontSize: "15px",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    {row.value}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>

                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "13px",
                            mt: 3,
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Network provider merchant account fees (charged directly by Stripe or Razorpay) are billed separately. Local goods and services tax (GST) is applied to processing charges in accordance with regional regulations.
                    </Typography>
                </Box>

                {/* Bottom Assistance Link */}
                <Typography
                    sx={{
                        textAlign: "center",
                        color: "var(--app-fg-muted)",
                        fontSize: "15px",
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    Questions about enterprise transaction volumes?{" "}
                    <Box
                        component="a"
                        href="mailto:hello@elixpo.com"
                        sx={{ color: "#3860BE", textDecoration: "none", fontWeight: 500, "&:hover": { textDecoration: "underline" } }}
                    >
                        Talk to our payments team →
                    </Box>
                </Typography>
            </Container>
        </PageShell>
    );
}
