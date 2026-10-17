"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ShieldIcon from "@mui/icons-material/VerifiedUser";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const ACCOUNTS_URL = "https://accounts.elixpo.com/docs";

const BENEFITS = [
    "One account across every Elixpo product — sign in once, use them all.",
    "Secure OAuth 2.0 — your password stays with Elixpo, we never see it.",
];

// Friendly copy for the ?error= values our auth callback can redirect with.
const ERROR_MESSAGES: Record<string, string> = {
    missing_code: "Sign-in didn't complete — no authorization code was returned. Please try again.",
    bad_state: "Sign-in couldn't be verified (state mismatch). Please start over.",
    sso_failed: "We couldn't reach Elixpo Accounts to sign you in. Please try again in a moment.",
};

const CORAL = "#ff7759";
const INK = "#212121";
const SLATE = "#75758a";
const HAIRLINE = "#d9d9dd";

const ghostBtn = {
    flex: 1,
    textTransform: "none",
    fontWeight: 500,
    fontSize: "0.88rem",
    color: INK,
    py: 1,
    borderRadius: "32px", // Outlined pill radius
    background: "transparent",
    border: `1px solid ${HAIRLINE}`,
    fontFamily: "var(--font-sans)",
    "&:hover": { borderColor: INK, background: "rgba(0,0,0,0.03)" },
};

function LoginInner() {
    const error = useSearchParams().get("error");
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (cancelled) return;
                if (d?.authenticated) window.location.replace("/dashboard");
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
                    background: "#ffffff",
                }}
            >
                <CircularProgress sx={{ color: CORAL }} />
            </Box>
        );
    }

    const errorText = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.") : null;

    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                p: 2,
                background: "#ffffff",
                color: INK,
            }}
        >
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "100%",
                    maxWidth: 480,
                    p: { xs: 4, md: 5 },
                    borderRadius: "22px", // lg radius token
                    textAlign: "center",
                    background: "#ffffff", // Pure Canvas White
                    border: `1px solid ${HAIRLINE}`,
                    boxShadow: "0 10px 40px rgba(0,0,0,0.04)",
                }}
            >
                <Box
                    component="img"
                    src="/mark.png"
                    alt="mail.elixpo"
                    sx={{
                        height: 52,
                        width: 52,
                        mx: "auto",
                        mb: 2.5,
                        borderRadius: "12px",
                        display: "block",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                    }}
                />

                <Typography
                    sx={{
                        fontWeight: 500,
                        fontSize: "1.75rem",
                        letterSpacing: "-0.02em",
                        fontFamily: "var(--font-display)",
                        color: "#000000",
                    }}
                >
                    Sign in to Elixpo Mails
                </Typography>
                <Typography sx={{ color: SLATE, fontSize: "0.95rem", mt: 1 }}>
                    Manage your senders, templates, and transactional sends.
                </Typography>

                {errorText && (
                    <Box
                        sx={{
                            mt: 2.5,
                            px: 2,
                            py: 1.2,
                            borderRadius: "8px",
                            background: "rgba(179,0,0,0.06)",
                            border: "1px solid rgba(179,0,0,0.2)",
                            color: "#b30000",
                            fontSize: "0.85rem",
                        }}
                    >
                        {errorText}
                    </Box>
                )}

                <Button
                    component="a"
                    href="/api/auth/login"
                    fullWidth
                    endIcon={<ArrowForwardIcon sx={{ fontSize: "1rem !important" }} />}
                    sx={{
                        mt: 3.5,
                        textTransform: "none",
                        fontWeight: 500,
                        fontSize: "0.95rem",
                        color: "#fff",
                        py: 1.3,
                        borderRadius: "32px", // Pill
                        background: "#17171c",
                        boxShadow: "none",
                        fontFamily: "var(--font-sans)",
                        "&:hover": { background: "#000" },
                    }}
                >
                    Continue with Elixpo Accounts
                </Button>

                {/* ── Explainer: what Elixpo Accounts is ──────────────────────── */}
                <Box
                    sx={{
                        mt: 4,
                        p: 3,
                        borderRadius: "16px",
                        textAlign: "left",
                        background: "#eeece7", // Soft Stone
                        border: `1px solid ${HAIRLINE}`,
                    }}
                >
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.5 }}>
                        <ShieldIcon sx={{ fontSize: 16, color: CORAL }} />
                        <Typography
                            sx={{
                                fontWeight: 500,
                                fontSize: "0.92rem",
                                fontFamily: "var(--font-display)",
                                color: "#000",
                            }}
                        >
                            What is Elixpo Accounts?
                        </Typography>
                    </Stack>
                    <Typography sx={{ color: SLATE, fontSize: "0.85rem", lineHeight: 1.6, mb: 2 }}>
                        Elixpo Mails doesn't have its own password. It uses{" "}
                        <strong style={{ color: INK }}>Elixpo Accounts</strong> — the single, secure
                        sign-on shared across the whole Elixpo ecosystem. One identity, everywhere.
                    </Typography>
                    <Stack spacing={1.4}>
                        {BENEFITS.map((b) => (
                            <Stack key={b} direction="row" spacing={1.2} alignItems="flex-start">
                                <CheckCircleIcon
                                    sx={{ fontSize: 16, color: CORAL, mt: "2px", flexShrink: 0 }}
                                />
                                <Typography
                                    sx={{ color: INK, fontSize: "0.84rem", lineHeight: 1.5 }}
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
                            mt: 2.5,
                            color: "#1863dc", // Action Blue
                            fontSize: "0.84rem",
                            fontWeight: 500,
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                        }}
                    >
                        Learn more about Elixpo Accounts
                        <OpenInNewIcon sx={{ fontSize: 12 }} />
                    </Box>
                </Box>

                <Stack direction="row" spacing={1.5} sx={{ mt: 3.5 }}>
                    <Button
                        component={Link}
                        href="/"
                        startIcon={<ArrowBackIcon sx={{ fontSize: "1rem !important" }} />}
                        sx={ghostBtn}
                    >
                        Back home
                    </Button>
                    <Button
                        component={Link}
                        href="/docs"
                        startIcon={<MenuBookIcon sx={{ fontSize: "1.05rem !important" }} />}
                        sx={ghostBtn}
                    >
                        Read the docs
                    </Button>
                </Stack>

                <Typography
                    sx={{
                        color: SLATE,
                        fontSize: "0.74rem",
                        mt: 3,
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.02em",
                    }}
                >
                    🔒 SECURED BY ELIXPO ACCOUNTS · OAUTH 2.0
                </Typography>
            </Box>
        </Box>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginInner />
        </Suspense>
    );
}
