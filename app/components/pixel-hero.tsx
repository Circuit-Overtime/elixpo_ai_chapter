"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import ShieldIcon from "@mui/icons-material/VerifiedUser";
import ContactlessIcon from "@mui/icons-material/Contactless";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect } from "react";
import gsap from "gsap";

export default function PixelHero() {
    // GSAP Intro Timeline Animation
    useEffect(() => {
        const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

        tl.fromTo(".hero-eyebrow",
            { y: 25, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, delay: 0.2 }
        )
        .fromTo(".hero-headline",
            { y: 35, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.0 },
            "-=0.6"
        )
        .fromTo(".hero-subhead",
            { y: 25, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8 },
            "-=0.7"
        )
        .fromTo(".hero-button",
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, stagger: 0.15 },
            "-=0.6"
        )
        .fromTo(".hero-stadium",
            { y: 50, scale: 0.97, opacity: 0 },
            { y: 0, scale: 1, opacity: 1, duration: 1.2, ease: "power3.out" },
            "-=0.5"
        );
    }, []);

    return (
        <section
            style={{
                position: "relative",
                width: "100%",
                background: "transparent",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: "4rem 0 6rem",
            }}
        >
            {/* Decorative Orbital Lines in Background */}
            <Box
                component="svg"
                viewBox="0 0 1440 600"
                preserveAspectRatio="none"
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 0,
                    pointerEvents: "none",
                    opacity: 0.5,
                }}
            >
                <path
                    d="M-100 200 C 300 50, 700 400, 1100 150 S 1500 450, 1600 300"
                    fill="none"
                    stroke="#F37338"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                />
                <path
                    d="M100 500 C 400 350, 800 550, 1200 400"
                    fill="none"
                    stroke="#F37338"
                    strokeWidth="1"
                    opacity="0.7"
                />
            </Box>

            <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
                <Stack alignItems="center" spacing={3} sx={{ textAlign: "center", mb: 8 }}>
                    {/* Eyebrow Label with Accent Dot */}
                    <Stack
                        className="hero-eyebrow"
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ opacity: 0 }}
                    >
                        <Box
                            sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "#CF4500",
                            }}
                        />
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
                            Payments for your SaaS
                        </Typography>
                    </Stack>

                    {/* Headline */}
                    <Typography
                        variant="h1"
                        className="hero-headline"
                        sx={{
                            fontSize: { xs: "40px", sm: "60px", md: "72px" },
                            fontWeight: 500,
                            letterSpacing: "-2%",
                            lineHeight: 1.0,
                            color: "var(--app-fg)",
                            maxWidth: "900px",
                            fontFamily: "var(--font-sofia-sans)",
                            opacity: 0,
                        }}
                    >
                        Add payments and payouts to your platform.
                    </Typography>

                    {/* Subhead */}
                    <Typography
                        className="hero-subhead"
                        sx={{
                            fontSize: { xs: "16px", md: "20px" },
                            fontWeight: 450,
                            lineHeight: 1.5,
                            color: "var(--app-fg)",
                            maxWidth: "640px",
                            fontFamily: "var(--font-sofia-sans)",
                            opacity: 0,
                        }}
                    >
                        Your platform doesn't need its own payment system.
                        Integrate Elixpo Pay once — we charge your customers and
                        pay each creator their share, straight to their bank.
                        Powered by Razorpay today, with Stripe coming soon for
                        international payments.
                    </Typography>

                    {/* Buttons */}
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        sx={{
                            pt: 1,
                            width: { xs: "100%", sm: "auto" },
                            justifyContent: "center",
                        }}
                    >
                        {/* Primary Button — Ink Pill */}
                        <Button
                            component={Link}
                            href="/login"
                            className="hero-button"
                            variant="contained"
                            disableElevation
                            endIcon={<ArrowForwardIcon />}
                            sx={{
                                background: "var(--app-fg)",
                                color: "var(--app-bg)",
                                border: "1.5px solid var(--app-fg)",
                                borderRadius: "20px",
                                px: 4,
                                py: 1.5,
                                fontSize: "16px",
                                fontWeight: 500,
                                letterSpacing: "-0.32px",
                                textTransform: "none",
                                fontFamily: "var(--font-sofia-sans)",
                                opacity: 0,
                                "&:hover": {
                                    background: "var(--app-fg)",
                                    borderColor: "var(--app-fg)",
                                },
                                "&:active": {
                                    transform: "scale(0.97)",
                                },
                            }}
                        >
                            Get Started
                        </Button>

                        {/* Secondary Button — Outlined Pill */}
                        <Button
                            component={Link}
                            href="/docs"
                            className="hero-button"
                            variant="outlined"
                            disableElevation
                            startIcon={<MenuBookIcon />}
                            sx={{
                                background: "var(--app-surface)",
                                color: "var(--app-fg)",
                                border: "1.5px solid var(--app-fg)",
                                borderRadius: "20px",
                                px: 4,
                                py: 1.5,
                                fontSize: "16px",
                                fontWeight: 500,
                                textTransform: "none",
                                fontFamily: "var(--font-sofia-sans)",
                                opacity: 0,
                                "&:hover": {
                                    background: "var(--app-overlay)",
                                    borderColor: "var(--app-fg)",
                                },
                                "&:active": {
                                    transform: "scale(0.97)",
                                },
                            }}
                        >
                            Read Documentation
                        </Button>
                    </Stack>
                </Stack>

                {/* Hero Media Frame (Stadium) - Redesigned for seamless connection */}
                <Box
                    className="hero-stadium"
                    sx={{
                        width: "100%",
                        background: "var(--app-ink)", // Ink Black background
                        borderRadius: "40px",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow: "rgba(0, 0, 0, 0.12) 0px 30px 60px 0px",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: { xs: "column", md: "row" },
                        alignItems: "stretch",
                        mt: 4,
                        opacity: 0,
                    }}
                >
                    {/* Left: Product Value Showcase */}
                    <Box
                        sx={{
                            flex: 1.1,
                            p: { xs: 4, md: 6 },
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "flex-start",
                            textAlign: "left",
                            color: "var(--app-on-ink)",
                        }}
                    >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                            <ShieldIcon sx={{ color: "#F37338", fontSize: 20 }} />
                            <Typography
                                sx={{
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    color: "var(--app-on-ink-muted)",
                                    fontFamily: "var(--font-sofia-sans)",
                                }}
                            >
                                SECURE COMPLIANCE
                            </Typography>
                        </Stack>

                        <Typography
                            variant="h3"
                            sx={{
                                fontSize: { xs: "24px", md: "34px" },
                                fontWeight: 500,
                                letterSpacing: "-1px",
                                mb: 2.5,
                                color: "var(--app-on-ink)",
                                fontFamily: "var(--font-sofia-sans)",
                                lineHeight: 1.15,
                            }}
                        >
                            A secure, trusted checkout — with PCI compliance handled for you.
                        </Typography>

                        <Typography
                            sx={{
                                color: "var(--app-on-ink-muted)",
                                fontSize: "15px",
                                lineHeight: 1.6,
                                mb: 4.5,
                                fontFamily: "var(--font-sofia-sans)",
                                fontWeight: 450,
                            }}
                        >
                            Your customers pay on our secure hosted checkout — their card details never touch your servers. The moment a payment succeeds, your app gets an instant, verified notification, so you can grant access right away.
                        </Typography>

                        <Stack direction="row" spacing={5}>
                            <Box>
                                <Typography sx={{ fontSize: "30px", fontWeight: 700, color: "#F37338", fontFamily: "var(--font-sofia-sans)" }}>&lt; 50ms</Typography>
                                <Typography sx={{ fontSize: "12px", color: "var(--app-on-ink-muted)", fontFamily: "var(--font-sofia-sans)" }}>Checkout response time</Typography>
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: "30px", fontWeight: 700, color: "#F37338", fontFamily: "var(--font-sofia-sans)" }}>100%</Typography>
                                <Typography sx={{ fontSize: "12px", color: "var(--app-on-ink-muted)", fontFamily: "var(--font-sofia-sans)" }}>Payments accounted for</Typography>
                            </Box>
                        </Stack>
                    </Box>

                    {/* Right: Floating 3D Wallet Card Panel (Connected Layout) */}
                    <Box
                        sx={{
                            flex: 1,
                            background: "rgba(255, 255, 255, 0.015)",
                            p: { xs: 4, md: 6 },
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            overflow: "hidden",
                            perspective: "1000px", // Enables 3D context
                        }}
                    >
                        {/* Decorative background grid element behind card */}
                        <Box
                            sx={{
                                position: "absolute",
                                width: "200%",
                                height: "200%",
                                background: "radial-gradient(circle, rgba(243, 115, 56, 0.06) 0%, transparent 60%)",
                                pointerEvents: "none",
                                zIndex: 0,
                            }}
                        />

                        {/* High-Fidelity 3D Credit Card Component */}
                        <Box
                            sx={{
                                width: "100%",
                                maxWidth: "340px",
                                height: "215px",
                                background: "linear-gradient(135deg, #181817 0%, #2a2a29 50%, #1e1e1e 100%)",
                                borderRadius: "16px",
                                p: 3,
                                color: "var(--app-on-ink)",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                boxShadow: "rgba(0, 0, 0, 0.45) 0px 30px 60px 0px, inset 0px 1px 1px rgba(255, 255, 255, 0.15)",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                zIndex: 1,
                                transform: "rotateY(-18deg) rotateX(12deg) rotateZ(-3deg)",
                                transformStyle: "preserve-3d",
                                transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                                cursor: "pointer",
                                "&:hover": {
                                    transform: "rotateY(-5deg) rotateX(5deg) rotateZ(-1deg) scale(1.04)",
                                    boxShadow: "rgba(0, 0, 0, 0.6) 0px 40px 80px 0px, inset 0px 1px 1px rgba(255, 255, 255, 0.25)",
                                },
                            }}
                        >
                            {/* Card Top Row */}
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ transform: "translateZ(20px)" }}>
                                <Box
                                    component="img"
                                    src="/logo.png"
                                    alt="Elixpo Pay Logo"
                                    sx={{
                                        height: 18,
                                        width: "auto",
                                        filter: "brightness(0) invert(1)",
                                    }}
                                />
                                <ContactlessIcon sx={{ color: "var(--app-on-ink-muted)", fontSize: 20 }} />
                            </Stack>

                            {/* Gold Microchip & contactless receiver */}
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1, transform: "translateZ(25px)" }}>
                                {/* Gold Chip */}
                                <Box
                                    sx={{
                                        width: 44,
                                        height: 32,
                                        borderRadius: "6px",
                                        background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                                        position: "relative",
                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                                        border: "1px solid rgba(0,0,0,0.1)",
                                        "&::after": {
                                            content: '""',
                                            position: "absolute",
                                            top: "10%",
                                            left: "10%",
                                            right: "10%",
                                            bottom: "10%",
                                            border: "1.2px solid var(--app-border)",
                                            borderRadius: "4px",
                                        }
                                    }}
                                />
                            </Stack>

                            {/* Card Number */}
                            <Typography
                                sx={{
                                    fontFamily: "var(--font-geist-mono)",
                                    fontSize: "18px",
                                    fontWeight: 500,
                                    letterSpacing: "2.5px",
                                    mt: 1.5,
                                    color: "var(--app-on-ink)",
                                    textShadow: "0px 1px 2px rgba(0,0,0,0.5)",
                                    transform: "translateZ(30px)",
                                }}
                            >
                                ••••  ••••  ••••  4821
                            </Typography>

                            {/* Card Holder & Expiry Row */}
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mt: 1, transform: "translateZ(20px)" }}>
                                <Stack spacing={0.3}>
                                    <Typography
                                        sx={{
                                            fontSize: "7px",
                                            fontWeight: 700,
                                            color: "var(--app-on-ink-muted)",
                                            letterSpacing: "0.06em",
                                            fontFamily: "var(--font-sofia-sans)",
                                        }}
                                    >
                                        CARDHOLDER NAME
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "11px",
                                            fontWeight: 500,
                                            color: "var(--app-on-ink)",
                                            letterSpacing: "0.5px",
                                            fontFamily: "var(--font-sofia-sans)",
                                        }}
                                    >
                                        AYUSHMAN BHATTACHARYA
                                    </Typography>
                                </Stack>

                                <Stack spacing={0.3} sx={{ mr: 2 }}>
                                    <Typography
                                        sx={{
                                            fontSize: "7px",
                                            fontWeight: 700,
                                            color: "var(--app-on-ink-muted)",
                                            letterSpacing: "0.06em",
                                            fontFamily: "var(--font-sofia-sans)",
                                        }}
                                    >
                                        EXPIRY
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "11px",
                                            fontWeight: 500,
                                            color: "var(--app-on-ink)",
                                            fontFamily: "var(--font-geist-mono)",
                                        }}
                                    >
                                        12 / 29
                                    </Typography>
                                </Stack>

                                {/* Brand Logo Image */}
                                <Box
                                    component="img"
                                    src="/logo.png"
                                    alt="Elixpo Pay"
                                    sx={{
                                        height: 14,
                                        width: "auto",
                                        filter: "brightness(0) invert(1)",
                                        opacity: 0.85,
                                    }}
                                />
                            </Stack>
                        </Box>
                    </Box>
                </Box>
            </Container>
        </section>
    );
}
