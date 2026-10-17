"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ShieldIcon from "@mui/icons-material/VerifiedUser";
import {
    Box,
    Button,
    CircularProgress,
    Stack,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import BackgroundAurora from "../components/background-aurora";

const ACCOUNTS_URL = "https://accounts.elixpo.com/docs";

const BENEFITS = [
    "One account across every Elixpo product — sign in once, use them all.",
    "Secure OAuth 2.0 — your password stays with Elixpo, we never see it.",
];

function LoginInner() {
    const error = useSearchParams().get("error");
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => {
                if (cancelled) return;
                if (r.ok) window.location.replace("/dashboard");
                else setChecking(false);
            })
            .catch(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (checking) {
        return (
            <Box
                sx={{
                    position: "relative",
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    p: 2,
                    color: "var(--app-fg)", // Ink Black loader text color
                    bgcolor: "var(--app-bg)",
                }}
            >
                <BackgroundAurora variant="auth" />
                <CircularProgress
                    sx={{ color: "#CF4500", position: "relative", zIndex: 1 }}
                />
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                p: 2,
                color: "var(--app-fg)", // Ink Black text
                bgcolor: "var(--app-bg)",
            }}
        >
            <BackgroundAurora variant="auth" />
            
            {/* Login Card Container */}
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    maxWidth: 460,
                    p: { xs: 3.5, md: 4 },
                    borderRadius: "24px",
                    textAlign: "center",
                    background: "var(--app-bg-2)", // Lifted Cream background
                    border: "1.5px solid var(--app-overlay)",
                    boxShadow: "rgba(0, 0, 0, 0.05) 0px 16px 48px 0px", // Soft premium shadow
                }}
            >
                {/* Logo Image */}
                <Box
                    component="img"
                    src="/logo.png"
                    alt="Elixpo Pay"
                    sx={{
                        height: 36,
                        width: "auto",
                        mx: "auto",
                        mb: 3,
                        display: "block",
                    }}
                />

                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: "1.8rem",
                        letterSpacing: "-2%",
                        color: "var(--app-fg)", // Ink Black
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    Sign in to Elixpo Pay
                </Typography>
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)", // Slate Gray
                        fontSize: "0.95rem",
                        mt: 0.8,
                        fontFamily: "var(--font-sofia-sans)",
                        fontWeight: 450,
                    }}
                >
                    Manage your products, pricing, and payouts.
                </Typography>

                {error && (
                    <Box
                        sx={{
                            mt: 2.5,
                            px: 2,
                            py: 1.2,
                            borderRadius: "12px",
                            background: "rgba(211, 47, 47, 0.05)",
                            border: "1px solid rgba(211, 47, 47, 0.2)",
                            color: "#C62828",
                            fontSize: "0.85rem",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Sign-in failed ({error}). Please try again.
                    </Box>
                )}

                {/* Primary Button - Ink Pill style */}
                <Button
                    component="a"
                    href="/api/auth/login"
                    fullWidth
                    sx={{
                        mt: 3.5,
                        textTransform: "none",
                        fontWeight: 650,
                        fontSize: "15px",
                        color: "var(--app-on-ink)", // Light text on ink
                        py: 1.4,
                        borderRadius: "20px", // Button radius 20px
                        background: "var(--app-ink)", // Ink Black
                        border: "1.5px solid var(--app-ink)",
                        fontFamily: "var(--font-sofia-sans)",
                        letterSpacing: "-0.2px",
                        "&:hover": {
                            background: "var(--app-ink)",
                            borderColor: "var(--app-ink)",
                        },
                        "&:active": {
                            transform: "scale(0.98)",
                        },
                    }}
                >
                    Continue with Elixpo Accounts
                </Button>

                {/* Explainer Segment */}
                <Box
                    sx={{
                        mt: 4,
                        p: 2.5,
                        borderRadius: "16px",
                        textAlign: "left",
                        background: "var(--app-overlay)", // Soft Bone tint
                        border: "1px solid var(--app-overlay)",
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ mb: 1.5 }}
                    >
                        <ShieldIcon sx={{ fontSize: 18, color: "#CF4500" }} /> {/* Signal Orange icon */}
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--app-fg)", fontFamily: "var(--font-sofia-sans)" }}
                        >
                            New here? What is Elixpo Accounts?
                        </Typography>
                    </Stack>
                    
                    <Typography
                        sx={{
                            color: "var(--app-fg)", // Charcoal
                            fontSize: "0.85rem",
                            lineHeight: 1.6,
                            mb: 2,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        Elixpo Pay doesn't have its own password. It uses{" "}
                        <strong style={{ color: "var(--app-fg)" }}>
                            Elixpo Accounts
                        </strong>{" "}
                        — the single, secure sign-on shared across the whole
                        Elixpo ecosystem. One identity, everywhere.
                    </Typography>

                    <Stack spacing={1.2}>
                        {BENEFITS.map((b) => (
                            <Stack
                                key={b}
                                direction="row"
                                spacing={1}
                                alignItems="flex-start"
                            >
                                <CheckCircleIcon
                                    sx={{
                                        fontSize: 16,
                                        color: "#CF4500", // Signal Orange checks
                                        mt: "2px",
                                        flexShrink: 0,
                                    }}
                                />
                                <Typography
                                    sx={{
                                        color: "var(--app-fg)",
                                        fontSize: "0.84rem",
                                        lineHeight: 1.5,
                                        fontFamily: "var(--font-sofia-sans)",
                                        fontWeight: 450,
                                    }}
                                >
                                    {b}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>

                    <Box
                        component="a"
                        href={ACCOUNTS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            mt: 2,
                            color: "#CF4500", // Signal Orange links
                            fontSize: "0.84rem",
                            fontWeight: 600,
                            textDecoration: "none",
                            fontFamily: "var(--font-sofia-sans)",
                            "&:hover": { color: "#9A3A0A" },
                        }}
                    >
                        Learn more about Elixpo Accounts
                    </Box>
                </Box>

                {/* Secondary navigation buttons: Outlined Pills */}
                <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
                    <Button
                        component={Link}
                        href="/"
                        startIcon={
                            <ArrowBackIcon sx={{ fontSize: "1rem !important" }} />
                        }
                        sx={outlinedPillBtn}
                    >
                        Back home
                    </Button>
                    <Button
                        component={Link}
                        href="/docs"
                        startIcon={
                            <MenuBookIcon sx={{ fontSize: "1.05rem !important" }} />
                        }
                        sx={outlinedPillBtn}
                    >
                        Read the docs
                    </Button>
                </Stack>

                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.78rem",
                        mt: 3,
                        fontFamily: "var(--font-sofia-sans)",
                        fontWeight: 450,
                    }}
                >
                    🔒 Secured by Elixpo Accounts · OAuth 2.0
                </Typography>
            </Box>
        </Box>
    );
}

const outlinedPillBtn = {
    flex: 1,
    textTransform: "none",
    fontWeight: 500,
    fontSize: "14px",
    color: "var(--app-fg)", // Ink Black
    py: 1,
    borderRadius: "20px", // Outlined Pill radius 20px
    background: "var(--app-surface)",
    border: "1.5px solid var(--app-border)",
    fontFamily: "var(--font-sofia-sans)",
    "&:hover": {
        borderColor: "var(--app-fg)",
        background: "var(--app-overlay)",
    },
};

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <Box
                    sx={{
                        minHeight: "100vh",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: "var(--app-bg)",
                    }}
                >
                    <CircularProgress sx={{ color: "#CF4500" }} />
                </Box>
            }
        >
            <LoginInner />
        </Suspense>
    );
}
