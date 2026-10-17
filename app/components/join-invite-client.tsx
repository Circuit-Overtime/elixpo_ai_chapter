"use client";

import { Avatar, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import { GlassCard } from "./glass-card";

const TEXT = "var(--fg)";
const MUTED = "var(--fg-muted)";
const ACCENT = "var(--accent)";
const GRADIENT = "var(--accent-gradient)";

export interface JoinInviteClientProps {
    token: string;
    signedIn: boolean;
    valid: boolean;
    workspaceName: string | null;
    workspaceLogo: string | null;
    role: string | null;
    isOpenLink: boolean;
    loginHref: string;
}

interface JoinResponse {
    ok?: boolean;
    pending?: boolean;
    tenantId?: string;
    error?: string;
}

type View = "form" | "request-sent" | "joined";

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function mapError(error: string | undefined): string {
    switch (error) {
        case "email_mismatch":
            return "This invite was sent to a different email address.";
        case "expired":
            return "This invite has expired.";
        case "revoked":
        case "invalid":
            return "This invite is no longer valid.";
        default:
            return "Something went wrong. Please try again.";
    }
}

const primaryButtonSx = {
    background: GRADIENT,
    boxShadow: "var(--accent-shadow)",
    textTransform: "none" as const,
    fontWeight: 700,
    color: "var(--accent-contrast)",
    borderRadius: "10px",
    py: 1.1,
    "&:hover": { background: GRADIENT },
};

const secondaryButtonSx = {
    textTransform: "none" as const,
    fontWeight: 700,
    color: TEXT,
    borderColor: "var(--field-border)",
    borderRadius: "10px",
    py: 1.1,
    "&:hover": { borderColor: ACCENT },
};

export function JoinInviteClient(props: JoinInviteClientProps) {
    const { token, signedIn, valid, workspaceName, workspaceLogo, role, isOpenLink, loginHref } =
        props;

    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<View>("form");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [redirecting, setRedirecting] = useState(false);

    async function handleAccept() {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch("/api/workspace/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });
            const data = (await res.json().catch(() => ({}))) as JoinResponse;

            if (data.ok && data.pending) {
                setView("request-sent");
                return;
            }
            if (data.ok && !data.pending) {
                setView("joined");
                setRedirecting(true);
                window.location.href = "/dashboard";
                return;
            }
            setErrorMsg(mapError(data.error));
        } catch {
            setErrorMsg("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <GlassCard
            sx={{
                width: "100%",
                maxWidth: 440,
                textAlign: "center",
            }}
        >
            {(workspaceLogo || workspaceName) && (
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                    <Avatar
                        src={workspaceLogo || undefined}
                        sx={{
                            width: 56,
                            height: 56,
                            bgcolor: "var(--accent-tint-strong)",
                            color: ACCENT,
                            fontWeight: 700,
                        }}
                    >
                        {workspaceName ? workspaceName.charAt(0).toUpperCase() : "?"}
                    </Avatar>
                </Box>
            )}

            {view === "form" && (
                <>
                    <Typography
                        component="h1"
                        sx={{ color: TEXT, fontSize: 22, fontWeight: 700, mb: 0.5 }}
                    >
                        {valid ? (
                            <>
                                You&apos;ve been invited to{" "}
                                <Box component="span" sx={{ color: ACCENT }}>
                                    {workspaceName || "a workspace"}
                                </Box>
                            </>
                        ) : (
                            "Invite unavailable"
                        )}
                    </Typography>

                    {valid && role && (
                        <Typography sx={{ color: MUTED, fontSize: 14, mb: 2.5 }}>
                            Role: {capitalize(role)}
                        </Typography>
                    )}

                    {!valid && (
                        <>
                            <Typography sx={{ color: MUTED, fontSize: 14, mb: 2.5, mt: 1 }}>
                                This invite link is invalid, expired, or has already been used.
                            </Typography>
                            <Button
                                variant="outlined"
                                fullWidth
                                href="/dashboard"
                                sx={secondaryButtonSx}
                            >
                                Go to dashboard
                            </Button>
                        </>
                    )}

                    {valid && !signedIn && (
                        <Button
                            component="a"
                            href={loginHref}
                            variant="contained"
                            fullWidth
                            sx={primaryButtonSx}
                        >
                            Sign in to accept
                        </Button>
                    )}

                    {valid && signedIn && (
                        <>
                            <Button
                                variant="contained"
                                fullWidth
                                disabled={loading || redirecting}
                                onClick={handleAccept}
                                sx={primaryButtonSx}
                            >
                                {loading ? (
                                    <CircularProgress
                                        size={20}
                                        sx={{ color: "var(--accent-contrast)" }}
                                    />
                                ) : (
                                    "Accept invite"
                                )}
                            </Button>
                            {isOpenLink && (
                                <Typography sx={{ color: MUTED, fontSize: 12.5, mt: 1.5 }}>
                                    This is an open link — an admin will need to approve your
                                    request.
                                </Typography>
                            )}
                        </>
                    )}

                    {errorMsg && (
                        <Typography sx={{ color: "var(--danger)", fontSize: 13, mt: 1.75 }}>
                            {errorMsg}
                        </Typography>
                    )}
                </>
            )}

            {view === "request-sent" && (
                <>
                    <Typography
                        component="h1"
                        sx={{ color: TEXT, fontSize: 20, fontWeight: 700, mb: 1 }}
                    >
                        Request sent
                    </Typography>
                    <Typography sx={{ color: MUTED, fontSize: 14, mb: 2.5 }}>
                        An admin will review your request to join.
                    </Typography>
                    <Button variant="outlined" fullWidth href="/dashboard" sx={secondaryButtonSx}>
                        Go to dashboard
                    </Button>
                </>
            )}

            {view === "joined" && (
                <>
                    <Typography
                        component="h1"
                        sx={{ color: TEXT, fontSize: 20, fontWeight: 700, mb: 1 }}
                    >
                        You&apos;ve joined {workspaceName || "the workspace"}!
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 1.25,
                            color: MUTED,
                            fontSize: 14,
                        }}
                    >
                        <CircularProgress size={16} sx={{ color: ACCENT }} />
                        <span>Redirecting to your dashboard…</span>
                    </Box>
                </>
            )}
        </GlassCard>
    );
}

export default JoinInviteClient;
