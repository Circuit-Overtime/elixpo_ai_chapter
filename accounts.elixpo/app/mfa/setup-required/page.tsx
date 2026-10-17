"use client";

import LockIcon from "@mui/icons-material/Lock";
import { Alert, Box, Button, Typography } from "@mui/material";

/**
 * /mfa/setup-required — hard wall for accounts that own ≥3 OAuth apps
 * without 2FA enabled. The dashboard layout redirects here on every
 * navigation until mfa_enabled flips to 1. No "skip" option, no
 * navigation away — the only path out is enrolling a method and
 * enabling 2FA via the link below.
 */
export default function SetupRequiredPage() {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    maxWidth: 520,
                    p: 4,
                    borderRadius: "20px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    backdropFilter: "blur(20px)",
                    textAlign: "center",
                }}
            >
                <LockIcon sx={{ color: "#b45309", fontSize: 48, mb: 2 }} />
                <Typography
                    variant="h5"
                    sx={{ color: "var(--fg)", fontWeight: 700, mb: 1 }}
                >
                    Two-factor authentication required
                </Typography>
                <Typography sx={{ color: "var(--fg-faint)", mb: 3 }}>
                    You're managing 3 or more OAuth apps on Elixpo. To protect
                    those apps and the users who sign in with them, we now
                    require 2FA on your account.
                </Typography>

                <Alert
                    severity="warning"
                    sx={{
                        textAlign: "left",
                        mb: 3,
                        bgcolor: "rgba(251,146,60,0.08)",
                        color: "#b45309",
                        border: "1px solid rgba(251,146,60,0.25)",
                    }}
                >
                    Until you enable 2FA you can't manage OAuth apps, webhooks,
                    or sensitive profile actions. Enroll a method below to
                    continue.
                </Alert>

                <Box
                    sx={{ display: "flex", gap: 1.5, justifyContent: "center" }}
                >
                    <Button
                        href="/dashboard/security"
                        variant="contained"
                        sx={{
                            background: "#ff7759",
                            color: "#fff",
                            textTransform: "none",
                            fontWeight: 600,
                            px: 3,
                            "&:hover": {
                                background: "rgba(255, 119, 89, 0.9)",
                            },
                        }}
                    >
                        Set up 2FA now
                    </Button>
                    <Button
                        href="/api/auth/logout"
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                        }}
                    >
                        Sign out
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}
