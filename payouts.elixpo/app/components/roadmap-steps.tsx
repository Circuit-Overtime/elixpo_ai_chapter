"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { Box, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Step {
    n: string;
    watermark: string;
    eyebrow: string;
    title: string;
    desc: string;
    href: string;
    graphic: React.ReactNode;
}

export default function RoadmapSteps() {
    // GSAP ScrollTrigger animation for onboarding steps
    useEffect(() => {
        gsap.registerPlugin(ScrollTrigger);

        gsap.fromTo(
            ".roadmap-node-container",
            { y: 55, opacity: 0 },
            {
                y: 0,
                opacity: 1,
                duration: 0.8,
                stagger: 0.2,
                ease: "power3.out",
                scrollTrigger: {
                    trigger: "#roadmap-grid",
                    start: "top 80%",
                },
            }
        );
    }, []);

    const steps: Step[] = [
        {
            n: "01",
            watermark: "CONNECT",
            eyebrow: "INTEGRATION",
            title: "Connect your product",
            desc: "Register your app, grab your API keys, and add your prices. It takes minutes.",
            href: "/docs/quickstart",
            graphic: (
                <Box sx={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #CF4500, #F37338)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", p: 3, position: "relative" }}>
                    <Box sx={{ width: "80%", height: "60px", background: "rgba(255, 255, 255, 0.15)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)", p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                        <Box sx={{ width: "40%", height: "8px", background: "var(--app-surface)", borderRadius: "4px" }} />
                        <Box sx={{ width: "75%", height: "6px", background: "rgba(255, 255, 255, 0.6)", borderRadius: "4px" }} />
                        <Box sx={{ width: "60%", height: "6px", background: "rgba(255, 255, 255, 0.6)", borderRadius: "4px" }} />
                    </Box>
                    <Box sx={{ width: "50px", height: "50px", borderRadius: "50%", background: "var(--app-surface)", position: "absolute", bottom: "15px", right: "25px", boxShadow: "0 8px 16px rgba(0,0,0,0.15)", display: "grid", placeItems: "center" }}>
                        <Box sx={{ width: "18px", height: "18px", border: "2px solid #CF4500", borderRadius: "4px" }} />
                    </Box>
                </Box>
            )
        },
        {
            n: "02",
            watermark: "SETTLE",
            eyebrow: "CREATOR POOLS",
            title: "Set up creator payouts",
            desc: "Add your creators' bank details. We split every payment and pay them automatically — you keep your cut.",
            href: "/docs/payouts",
            graphic: (
                <Box sx={{ width: "100%", height: "100%", background: "linear-gradient(135deg, var(--app-ink), var(--app-ink))", display: "flex", justifyContent: "center", alignItems: "center", p: 3, position: "relative" }}>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                        <Box sx={{ width: "60px", height: "60px", borderRadius: "50%", border: "2px dashed #F37338", display: "grid", placeItems: "center" }}>
                            <Box sx={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--app-surface)", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: 700, color: "var(--app-fg)" }}>₹</Box>
                        </Box>
                        <Box sx={{ width: "30px", height: "2px", background: "#F37338" }} />
                        <Box sx={{ width: "60px", height: "60px", borderRadius: "50%", border: "2px dashed #F37338", display: "grid", placeItems: "center" }}>
                            <Box sx={{ width: "40px", height: "40px", borderRadius: "50%", background: "#F37338", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: 700, color: "#FFFFFF" }}>→</Box>
                        </Box>
                    </Box>
                </Box>
            )
        },
        {
            n: "03",
            watermark: "MONETIZE",
            eyebrow: "LAUNCH",
            title: "Go live in production",
            desc: "Send customers to our checkout. When they pay, we notify your app instantly so you can grant access.",
            href: "/docs/checkout",
            graphic: (
                <Box sx={{ width: "100%", height: "100%", background: "linear-gradient(135deg, var(--app-bg-2), var(--app-bg))", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", p: 3, position: "relative", border: "1px solid var(--app-overlay)" }}>
                    <Box
                        component="img"
                        src="/logo.png"
                        alt="Elixpo Pay"
                        sx={{
                            height: 22,
                            width: "auto",
                            mb: 2,
                        }}
                    />
                    <Typography sx={{ fontSize: "12px", fontWeight: 700, color: "var(--app-fg)", letterSpacing: "0.02em", fontFamily: "var(--font-sofia-sans)" }}>Elixpo Verified</Typography>
                </Box>
            )
        }
    ];

    return (
        <Box sx={{ py: { xs: 8, md: 14 }, background: "transparent", position: "relative", overflow: "hidden" }}>
            {/* Background Orbital Connections */}
            <Box
                component="svg"
                viewBox="0 0 1200 600"
                preserveAspectRatio="none"
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 0,
                    pointerEvents: "none",
                    display: { xs: "none", md: "block" },
                }}
            >
                <path
                    d="M 250 250 Q 550 50 850 250"
                    fill="none"
                    stroke="#F37338"
                    strokeWidth="1.5"
                    opacity="0.8"
                />
                <path
                    d="M 550 420 Q 800 600 1100 320"
                    fill="none"
                    stroke="#F37338"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.6"
                />
            </Box>

            <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
                {/* Section Header */}
                <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ mb: { xs: 8, md: 12 } }}>
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
                            GET STARTED
                        </Typography>
                    </Stack>
                    <Typography
                        variant="h2"
                        sx={{
                            fontSize: { xs: "28px", md: "42px" },
                            fontWeight: 500,
                            letterSpacing: "-2%",
                            color: "var(--app-fg)",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Live in three simple steps
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: "16px",
                            color: "var(--app-fg)",
                            maxWidth: "500px",
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        Connect your app, set how payments are split, and go live. No payment system to build.
                    </Typography>
                </Stack>

                {/* Staggered Circular Portrait Constellation */}
                <Box
                    id="roadmap-grid"
                    sx={{
                        display: "flex",
                        flexDirection: { xs: "column", md: "row" },
                        justifyContent: "space-between",
                        alignItems: { xs: "center", md: "flex-start" },
                        gap: { xs: 8, md: 4 },
                        pt: { xs: 0, md: 4 },
                    }}
                >
                    {steps.map((step, idx) => (
                        <Box
                            key={step.n}
                            className="roadmap-node-container"
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                textAlign: "center",
                                width: "100%",
                                maxWidth: "340px",
                                position: "relative",
                                // Asymmetric vertical staggering for desktop view
                                mt: { xs: 0, md: idx === 1 ? 10 : 0 },
                                opacity: 0, // Controlled by GSAP
                            }}
                        >
                            {/* Ghost Watermark Headline behind circle */}
                            <Typography
                                sx={{
                                    position: "absolute",
                                    top: "-40px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    fontSize: "80px",
                                    fontWeight: 700,
                                    letterSpacing: "-0.03em",
                                    color: "#E8E2DA", // Cream-on-cream watermark
                                    zIndex: 0,
                                    userSelect: "none",
                                    pointerEvents: "none",
                                    fontFamily: "var(--font-sofia-sans)",
                                    opacity: 0.7,
                                }}
                            >
                                {step.watermark}
                            </Typography>

                            {/* Circle + CTA wrapper — NOT clipped, so the satellite
                                arrow can sit on the circle's edge instead of being
                                cut off by the circular mask. */}
                            <Box
                                sx={{
                                    position: "relative",
                                    width: "280px",
                                    height: "280px",
                                    zIndex: 1,
                                    mb: 4,
                                }}
                            >
                                {/* Service / Solution Portrait Card (Perfect Circle) */}
                                <Box
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        position: "relative",
                                        boxShadow:
                                            "rgba(0, 0, 0, 0.08) 0px 24px 48px 0px", // Soft halo shadow
                                        border: "1.5px solid var(--app-overlay)",
                                    }}
                                >
                                    {step.graphic}
                                </Box>

                                {/* Satellite CTA — protrudes off the circle's right edge */}
                                <Box
                                    component={Link}
                                    href={step.href}
                                    sx={{
                                        position: "absolute",
                                        bottom: "24px",
                                        right: "-14px",
                                        width: "56px",
                                        height: "56px",
                                        borderRadius: "50%",
                                        background: "var(--app-surface)",
                                        display: "grid",
                                        placeItems: "center",
                                        textDecoration: "none",
                                        color: "var(--app-fg)",
                                        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                                        border: "1px solid var(--app-overlay)",
                                        transition:
                                            "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                                        "&:hover": {
                                            transform: "scale(1.08) rotate(45deg)",
                                            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                                            background: "var(--app-bg)",
                                        },
                                        "&:active": {
                                            transform: "scale(0.95)",
                                        },
                                    }}
                                >
                                    <ArrowForwardIcon sx={{ fontSize: 20 }} />
                                </Box>
                            </Box>

                            {/* Eyebrow Label below Portrait */}
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, zIndex: 1 }}>
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
                                    {step.eyebrow}
                                </Typography>
                            </Stack>

                            {/* Title (H3) */}
                            <Typography
                                variant="h3"
                                sx={{
                                    fontSize: "24px",
                                    fontWeight: 500,
                                    letterSpacing: "-2%",
                                    color: "var(--app-fg)",
                                    mb: 1.5,
                                    fontFamily: "var(--font-sofia-sans)",
                                    zIndex: 1,
                                }}
                            >
                                {step.title}
                            </Typography>

                            {/* Description */}
                            <Typography
                                sx={{
                                    fontSize: "15px",
                                    color: "var(--app-fg-muted)",
                                    lineHeight: 1.5,
                                    px: 2,
                                    fontFamily: "var(--font-sofia-sans)",
                                    fontWeight: 450,
                                    zIndex: 1,
                                }}
                            >
                                {step.desc}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Container>
        </Box>
    );
}
