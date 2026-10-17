"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import GitHubIcon from "@mui/icons-material/GitHub";
import HubIcon from "@mui/icons-material/Hub";
import ShoppingCartCheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect } from "react";
import PageShell from "./components/page-shell";
import PixelHero from "./components/pixel-hero";
import RoadmapSteps from "./components/roadmap-steps";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Tile {
    icon: SvgIconComponent;
    title: string;
    body: string;
    accent: string;
    category: string;
}

const TILES: Tile[] = [
    {
        icon: ShoppingCartCheckoutIcon,
        title: "Hosted checkout",
        body: "We host the checkout page. Send your customer there to pay — their card details never touch your servers.",
        accent: "#CF4500",
        category: "PAYMENTS",
    },
    {
        icon: WorkspacePremiumIcon,
        title: "Instant access on payment",
        body: "The moment a payment succeeds, we notify your app with a signed webhook so you can unlock access right away.",
        accent: "#F37338",
        category: "ENTITLEMENTS",
    },
    {
        icon: VpnKeyIcon,
        title: "Razorpay now, Stripe soon",
        body: "Use your own Razorpay account today; Stripe for international payments is coming soon. Or let Elixpo Pay collect for you.",
        accent: "#9A3A0A",
        category: "PROVIDER KEYS",
    },
    {
        icon: AccountBalanceIcon,
        title: "Every payment tracked",
        body: "Each charge, split, and payout is recorded in one place — accurate and safe, even if a request is retried.",
        accent: "var(--app-fg)",
        category: "ACCOUNTING",
    },
    {
        icon: AccountBalanceWalletIcon,
        title: "Creator payouts",
        body: "Keep your commission and pay the rest to your creators or sellers — directly to their bank accounts, on schedule.",
        accent: "#CF4500",
        category: "REVENUE SPLITS",
    },
    {
        icon: HubIcon,
        title: "One simple integration",
        body: "Sign in, set your prices, and call one API. That's the whole integration — no payment system to build or maintain.",
        accent: "#F37338",
        category: "PLATFORM API",
    },
];

export default function Home() {
    // GSAP ScrollTrigger stagger animation for Bento items
    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        gsap.fromTo(
            ".bento-card",
            { y: 50, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                stagger: 0.15,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: "#platform-grid",
                    start: "top 80%",
                },
            }
        );
    }, []);

    return (
        <PageShell variant="default">
            {/* Hero Section */}
            <PixelHero />

            {/* 3-Step Onboarding Constellation */}
            <RoadmapSteps />

            {/* Open Source Strip */}
            <Container maxWidth="md" sx={{ py: 4 }}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={3}
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{
                        p: { xs: 3, md: 4 },
                        borderRadius: "24px",
                        border: "1.5px solid var(--app-overlay)",
                        background: "var(--app-bg-2)", // Lifted Cream
                        boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                    }}
                >
                    <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, justifyContent: { xs: "center", sm: "flex-start" } }}>
                            <Box sx={{ width: 5, height: 5, borderRadius: "50%", background: "#CF4500" }} />
                            <Typography
                                sx={{
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    letterSpacing: "0.04em",
                                    color: "var(--app-fg-muted)",
                                    textTransform: "uppercase",
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                OPEN SOURCE
                            </Typography>
                        </Stack>
                        <Typography
                            sx={{
                                fontWeight: 500,
                                fontSize: "1.3rem",
                                color: "var(--app-fg)",
                                letterSpacing: "-1%",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            100% transparent payouts layer
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.95rem",
                                mt: 0.5,
                                fontFamily: "var(--font-sofia-sans)",
                                fontWeight: 450,
                            }}
                        >
                            Audit every line, host it yourself, or contribute. No black boxes handling your revenue.
                        </Typography>
                    </Box>
                    <Button
                        component="a"
                        href="https://github.com/elixpo/payouts.elixpo"
                        target="_blank"
                        rel="noopener noreferrer"
                        startIcon={<GitHubIcon />}
                        sx={{
                            flexShrink: 0,
                            textTransform: "none",
                            fontWeight: 500,
                            fontSize: "15px",
                            color: "var(--app-bg)",
                            background: "var(--app-fg)",
                            border: "1.5px solid var(--app-fg)",
                            borderRadius: "20px",
                            px: 3,
                            py: 1.2,
                            fontFamily: "var(--font-sofia-sans)",
                            letterSpacing: "-0.32px",
                            "&:hover": {
                                background: "var(--app-fg)",
                                borderColor: "var(--app-fg)",
                            },
                        }}
                    >
                        View on GitHub
                    </Button>
                </Stack>
            </Container>

            {/* Section 3: The Platform Bento Grid */}
            <Box
                id="platform"
                sx={{
                    position: "relative",
                    py: { xs: 8, md: 12 },
                    scrollMarginTop: "80px",
                }}
            >
                <Container maxWidth="lg">
                    {/* Platform Header */}
                    <Stack
                        alignItems="center"
                        textAlign="center"
                        spacing={1.5}
                        sx={{ mb: { xs: 6, md: 9 } }}
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
                                SYSTEM ARCHITECTURE
                            </Typography>
                        </Stack>
                        <Typography
                            variant="h2"
                            sx={{
                                fontWeight: 500,
                                fontSize: { xs: "28px", md: "42px" },
                                letterSpacing: "-2%",
                                color: "var(--app-fg)",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            The Elixpo Pay Platform
                        </Typography>
                        <Typography
                            sx={{
                                maxWidth: 600,
                                color: "var(--app-fg-muted)",
                                fontSize: "16px",
                                lineHeight: 1.6,
                                fontFamily: "var(--font-sofia-sans)",
                                fontWeight: 450,
                            }}
                        >
                            Collect payments and pay out your creators through one integration — so your platform never has to build or maintain payments itself.
                        </Typography>
                    </Stack>

                    {/* Bento Grid Container */}
                    <Box
                        id="platform-grid"
                        sx={{
                            display: "grid",
                            rowGap: 4,
                            columnGap: 4,
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(2, 1fr)",
                                md: "repeat(3, 1fr)",
                            },
                        }}
                    >
                        {TILES.map((tile, idx) => {
                            // Bento spans: index 0, 3, 5 span 2 columns on desktop
                            const isSpan2 = idx === 0 || idx === 3 || idx === 5;
                            return (
                                <Box
                                    key={tile.title}
                                    className="bento-card"
                                    sx={{
                                        gridColumn: { xs: "span 1", md: isSpan2 ? "span 2" : "span 1" },
                                        p: 3.5,
                                        borderRadius: "24px",
                                        border: "1.5px solid var(--app-overlay)",
                                        background: "var(--app-bg-2)",
                                        boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                                        transition: "all 0.2s ease",
                                        opacity: 0, // Animated via GSAP
                                        "&:hover": {
                                            transform: "translateY(-4px)",
                                            borderColor: "var(--app-border)",
                                        },
                                        display: "flex",
                                        flexDirection: { xs: "column", sm: isSpan2 ? "row" : "column" },
                                        alignItems: "stretch",
                                        gap: 3,
                                    }}
                                >
                                    {/* Left: Info Stack */}
                                    <Stack spacing={2} sx={{ flex: 1, justifyContent: "center" }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box
                                                sx={{
                                                    width: 48,
                                                    height: 48,
                                                    borderRadius: "14px",
                                                    display: "grid",
                                                    placeItems: "center",
                                                    color: "var(--app-fg)",
                                                    background: "var(--app-overlay)",
                                                }}
                                            >
                                                <tile.icon sx={{ fontSize: 22 }} />
                                            </Box>
                                            <Stack direction="row" alignItems="center" spacing={0.6}>
                                                <Box sx={{ width: 4, height: 4, borderRadius: "50%", background: "#CF4500" }} />
                                                <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", color: "var(--app-fg-muted)", fontFamily: "var(--font-sofia-sans)" }}>
                                                    {tile.category}
                                                </Typography>
                                            </Stack>
                                        </Stack>

                                        <Stack spacing={1}>
                                            <Typography
                                                sx={{
                                                    fontWeight: 500,
                                                    fontSize: "1.15rem",
                                                    color: "var(--app-fg)",
                                                    fontFamily: "var(--font-sofia-sans)",
                                                    letterSpacing: "-1%",
                                                }}
                                            >
                                                {tile.title}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    color: "var(--app-fg-muted)",
                                                    fontSize: "0.92rem",
                                                    lineHeight: 1.5,
                                                    fontFamily: "var(--font-sofia-sans)",
                                                    fontWeight: 450,
                                                }}
                                            >
                                                {tile.body}
                                            </Typography>
                                        </Stack>
                                    </Stack>

                                    {/* Right: Graphic (only for span-2 cards on md+) */}
                                    {isSpan2 && (
                                        <Box
                                            sx={{
                                                display: { xs: "none", sm: "flex" },
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flex: 1,
                                                background: "var(--app-overlay)",
                                                borderRadius: "16px",
                                                p: 2,
                                                overflow: "hidden",
                                                border: "1px dashed var(--app-overlay)",
                                                minHeight: 150,
                                            }}
                                        >
                                            {idx === 0 && <HostedCheckoutMiniGraphic />}
                                            {idx === 3 && <LedgerMiniGraphic />}
                                            {idx === 5 && <ApiMiniGraphic />}
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Checkout showcase sub-block */}
                    <Box
                        sx={{
                            mt: { xs: 8, md: 12 },
                            display: "flex",
                            flexDirection: { xs: "column", md: "row" },
                            alignItems: "center",
                            justifyContent: "center",
                            gap: { xs: 4, md: 8 },
                            p: { xs: 4, md: 6 },
                            borderRadius: "32px",
                            border: "1.5px solid var(--app-overlay)",
                            background: "var(--app-bg-2)",
                            boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                        }}
                    >
                        <Box
                            sx={{
                                maxWidth: 420,
                                textAlign: { xs: "center", md: "left" },
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, justifyContent: { xs: "center", md: "flex-start" } }}>
                                <Box sx={{ width: 5, height: 5, borderRadius: "50%", background: "#CF4500" }} />
                                <Typography
                                    sx={{
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        letterSpacing: "0.04em",
                                        color: "var(--app-fg-muted)",
                                        textTransform: "uppercase",
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    PCI-LIGHT GATEWAY
                                </Typography>
                            </Stack>
                            <Typography
                                sx={{
                                    fontWeight: 500,
                                    fontSize: "1.6rem",
                                    color: "var(--app-fg)",
                                    letterSpacing: "-2%",
                                    lineHeight: 1.2,
                                    mb: 2,
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                A checkout experience designed for absolute trust.
                            </Typography>
                            <Typography
                                sx={{
                                    color: "var(--app-fg-muted)",
                                    fontSize: "15px",
                                    lineHeight: 1.6,
                                    fontFamily: "var(--font-sofia-sans)",
                                    fontWeight: 450,
                                }}
                            >
                                A clean, branded checkout that works on any device. Customers see clear pricing and pay in two clicks — and the moment they do, your app gets an instant, verified notification.
                            </Typography>
                        </Box>
                        <MockCheckout />
                    </Box>

                    {/* Explore CTA Button */}
                    <Stack
                        alignItems="center"
                        sx={{ mt: 8 }}
                    >
                        <Button
                            component={Link}
                            href="/about"
                            variant="outlined"
                            disableElevation
                            sx={{
                                background: "var(--app-surface)",
                                color: "var(--app-fg)",
                                border: "1.5px solid var(--app-fg)",
                                borderRadius: "20px",
                                px: 4,
                                py: 1.2,
                                fontSize: "16px",
                                fontWeight: 500,
                                textTransform: "none",
                                fontFamily: "var(--font-sofia-sans)",
                                "&:hover": {
                                    background: "var(--app-overlay)",
                                    borderColor: "var(--app-fg)",
                                },
                            }}
                        >
                            Explore the Platform Components →
                        </Button>
                    </Stack>
                </Container>
            </Box>
        </PageShell>
    );
}

/**
 * Bento Grid Mini Graphics
 */
function HostedCheckoutMiniGraphic() {
    return (
        <Box sx={{ width: "100%", maxWidth: 180, background: "var(--app-surface)", borderRadius: "10px", border: "1px solid var(--app-overlay)", p: 1.2, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1.5, pb: 0.5, borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", background: "#EB001B" }} />
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", background: "#F79E1B" }} />
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", background: "#28C840" }} />
            </Stack>
            <Stack alignItems="center" spacing={0.8}>
                <Box sx={{ width: 22, height: 22, borderRadius: "50%", background: "#CF4500", display: "grid", placeItems: "center", color: "#FFFFFF", fontSize: "11px", fontWeight: 700 }}>✓</Box>
                <Box sx={{ width: 70, height: 6, background: "var(--app-fg)", borderRadius: 1 }} />
                <Box sx={{ width: 45, height: 4, background: "var(--app-fg-muted)", borderRadius: 1 }} />
            </Stack>
        </Box>
    );
}

function LedgerMiniGraphic() {
    return (
        <Stack spacing={0.8} sx={{ width: "100%", maxWidth: 200, fontFamily: "var(--font-geist-mono)", fontSize: "9px" }}>
            <Stack direction="row" justifyContent="space-between" sx={{ pb: 0.5, borderBottom: "1.5px solid var(--app-fg)", fontWeight: 700 }}>
                <span>ACCOUNT</span>
                <span>DEBIT / CREDIT</span>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ color: "#CF4500" }}>
                <span>usr_wallet</span>
                <span>- ₹1,999.00</span>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ color: "#28C840" }}>
                <span>merch_ledger</span>
                <span>+ ₹1,969.00</span>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ color: "rgba(20,20,19,0.5)" }}>
                <span>elixpo_fees</span>
                <span>+ ₹30.00</span>
            </Stack>
        </Stack>
    );
}

function ApiMiniGraphic() {
    return (
        <Box sx={{ background: "var(--app-ink)", borderRadius: "8px", p: 1.5, width: "100%", maxWidth: 190, color: "#86efac", fontFamily: "var(--font-geist-mono)", fontSize: "9px", textAlign: "left" }}>
            <span style={{ color: "#F37338" }}>GET</span> /v1/entitlements
            <br />
            <span style={{ color: "var(--app-on-ink)" }}>status: </span> "active",
            <br />
            <span style={{ color: "var(--app-on-ink)" }}>tier: </span> "developer",
            <br />
            <span style={{ color: "var(--app-on-ink)" }}>expires: </span> "30d"
        </Box>
    );
}

/**
 * Redesigned MockCheckout card matching the Mastercard Warm/White themes.
 */
function MockCheckout() {
    return (
        <Box
            aria-hidden
            sx={{
                position: "relative",
                maxWidth: 350,
                width: "100%",
                borderRadius: "24px",
                overflow: "hidden",
                border: "1.5px solid var(--app-overlay)",
                background: "var(--app-surface)",
                boxShadow: "rgba(0, 0, 0, 0.08) 0px 24px 48px 0px",
                userSelect: "none",
                pointerEvents: "none",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 1.2,
                    borderBottom: "1px solid var(--app-overlay)",
                    background: "var(--app-overlay)",
                }}
            >
                <Box sx={{ display: "flex", gap: 0.6 }}>
                    {["#EB001B", "#F79E1B", "#28c840"].map((c) => (
                        <Box
                            key={c}
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: c,
                            }}
                        />
                    ))}
                </Box>
                <Box
                    sx={{
                        flexGrow: 1,
                        ml: 0.5,
                        px: 1.2,
                        py: 0.25,
                        borderRadius: "6px",
                        background: "var(--app-surface)",
                        border: "1px solid var(--app-overlay)",
                        fontFamily: "var(--font-geist-mono)",
                        fontSize: "0.68rem",
                        color: "rgba(20, 20, 19, 0.5)",
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    payouts.elixpo.com/checkout
                </Box>
            </Box>

            <Box sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box
                            sx={{
                                width: 22,
                                height: 22,
                                borderRadius: "6px",
                                background: "#CF4500",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "11px",
                                fontWeight: 800,
                                color: "#FFFFFF",
                            }}
                        >
                            ₹
                        </Box>
                        <Typography
                            sx={{
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "var(--app-fg-muted)",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Elixpo Pay
                        </Typography>
                    </Stack>
                    <Box
                        component="img"
                        src="/logo.png"
                        alt="Elixpo Pay"
                        sx={{
                            height: 14,
                            width: "auto",
                        }}
                    />
                </Stack>

                <Typography
                    sx={{
                        fontSize: "13px",
                        color: "var(--app-fg-muted)",
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    Premium Membership
                </Typography>
                <Typography
                    sx={{
                        fontWeight: 700,
                        fontSize: "24px",
                        mt: 0.5,
                        mb: 2.5,
                        color: "var(--app-fg)",
                        letterSpacing: "-0.5px",
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    ₹199{" "}
                    <Box
                        component="span"
                        sx={{
                            fontSize: "13px",
                            fontWeight: 400,
                            color: "var(--app-fg-muted)",
                        }}
                    >
                        / month
                    </Box>
                </Typography>

                {/* Simulated credit card input styling */}
                <Stack spacing={1.2} sx={{ mb: 3 }}>
                    <Box sx={{ background: "var(--app-overlay)", border: "1px solid var(--app-overlay)", borderRadius: "10px", px: 1.5, py: 0.8 }}>
                        <Typography sx={{ fontSize: "8px", fontWeight: 700, color: "var(--app-fg-muted)", letterSpacing: "0.05em" }}>CARD NUMBER</Typography>
                        <Typography sx={{ fontSize: "12px", color: "var(--app-fg)", mt: 0.2, fontWeight: 500 }}>••••  ••••  ••••  9084</Typography>
                    </Box>
                </Stack>

                {/* Primary Button — Ink Pill */}
                <Button
                    fullWidth
                    variant="contained"
                    disableElevation
                    sx={{
                        background: "var(--app-fg)",
                        color: "var(--app-bg)",
                        borderRadius: "20px",
                        py: 1.4,
                        fontSize: "14px",
                        fontWeight: 700,
                        textTransform: "none",
                        fontFamily: "var(--font-sofia-sans)",
                        "&:hover": {
                            background: "var(--app-fg)",
                        },
                    }}
                >
                    Authorize ₹199
                </Button>
            </Box>
        </Box>
    );
}
