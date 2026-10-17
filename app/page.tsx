"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DesignServicesIcon from "@mui/icons-material/DesignServices";
import EastIcon from "@mui/icons-material/East";
import HubIcon from "@mui/icons-material/Hub";
import LockIcon from "@mui/icons-material/Lock";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PasswordIcon from "@mui/icons-material/Password";
import PublicIcon from "@mui/icons-material/Public";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import WavingHandIcon from "@mui/icons-material/WavingHand";
import WebhookIcon from "@mui/icons-material/Webhook";
import { Box, Button, Container, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import CodeBlock from "./components/code-block";
import PageShell from "./components/page-shell";
import PixelHero from "./components/pixel-hero";

const CORAL = "#ff7759";
const ACTION_BLUE = "var(--action-fg)";

// Cohere primary CTA button styles
const PRIMARY_BTN = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.95rem",
    color: "var(--bg)",
    px: 3.5,
    py: 1.3,
    borderRadius: "32px", // Pill
    background: "var(--fg)",
    boxShadow: "none",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "var(--fg-muted)" },
};

// ── Section heading helper ──────────────────────────────────────────────────
function SectionHead({
    eyebrow,
    title,
    body,
    whiteText = false,
}: {
    eyebrow: string;
    title: React.ReactNode;
    body?: string;
    whiteText?: boolean;
}) {
    return (
        <Stack alignItems="center" textAlign="center" spacing={1.8} sx={{ mb: { xs: 5, md: 8 } }}>
            <Typography
                sx={{
                    color: whiteText ? "#ffad9b" : CORAL, // Soft Coral / Coral
                    fontWeight: 500,
                    fontSize: "0.78rem",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                }}
            >
                {eyebrow}
            </Typography>
            <Typography
                component="h2"
                sx={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    fontSize: { xs: "2rem", md: "2.8rem" },
                    letterSpacing: "-0.03em",
                    lineHeight: 1.05,
                    color: whiteText ? "#ffffff" : "var(--fg)",
                    maxWidth: 720,
                }}
            >
                {title}
            </Typography>
            {body && (
                <Typography
                    sx={{
                        maxWidth: 600,
                        color: whiteText ? "rgba(255,255,255,0.7)" : "var(--fg-muted)",
                        fontSize: "1.05rem",
                        lineHeight: 1.6,
                        fontFamily: "var(--font-sans)",
                    }}
                >
                    {body}
                </Typography>
            )}
        </Stack>
    );
}

// ── Connective "story thread" artifact between sections ─────────────────────
function SectionThread({ node = true }: { node?: boolean }) {
    return (
        <Box
            aria-hidden
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0,
                py: { xs: 0.5, md: 1 },
            }}
        >
            <Box
                sx={{
                    width: "1.5px",
                    height: { xs: 26, md: 38 },
                    background: "linear-gradient(to bottom, transparent, var(--accent-border))",
                }}
            />
            {node && (
                <Box
                    sx={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: CORAL,
                        boxShadow: "0 0 0 5px var(--accent-tint)",
                        my: 0.4,
                    }}
                />
            )}
            <Box
                sx={{
                    width: "1.5px",
                    height: { xs: 26, md: 38 },
                    background: node
                        ? "linear-gradient(to bottom, var(--accent-border), transparent)"
                        : "linear-gradient(to bottom, var(--accent-border), transparent)",
                }}
            />
        </Box>
    );
}

// ── Auth-aware primary CTA ──────────────────────────────────────────────────
function useAuthed(): boolean | null {
    const [authed, setAuthed] = useState<boolean | null>(null);
    useEffect(() => {
        let alive = true;
        fetch("/api/auth/me", { cache: "no-store" })
            .then((r) => r.json())
            .then((d: any) => alive && setAuthed(Boolean(d?.authenticated)))
            .catch(() => alive && setAuthed(false));
        return () => {
            alive = false;
        };
    }, []);
    return authed;
}

function PrimaryCta({
    authed,
    signedOutLabel,
    sx,
}: { authed: boolean | null; signedOutLabel: string; sx?: any }) {
    const signedIn = authed === true;
    return (
        <Button
            component={signedIn ? Link : "a"}
            href={signedIn ? "/dashboard" : "/api/auth/login"}
            endIcon={<ArrowForwardIcon sx={{ fontSize: "1.1rem !important" }} />}
            sx={{ ...PRIMARY_BTN, ...sx }}
        >
            {signedIn ? "Go to your dashboard" : signedOutLabel}
        </Button>
    );
}

// ── Data ────────────────────────────────────────────────────────────────────
const STEPS: { icon: SvgIconComponent; title: string; body: string }[] = [
    {
        icon: VpnKeyIcon,
        title: "Connect your sender",
        body: "Add your mailbox — email + app password, encrypted at rest. Your domain, your reputation.",
    },
    {
        icon: DesignServicesIcon,
        title: "Design a template",
        body: "Compose in a visual editor with {{variable}} placeholders and a live inbox preview.",
    },
    {
        icon: WebhookIcon,
        title: "Send it",
        body: "Send a one-time email to anyone — no login required — or trigger it from your stack with a signed webhook.",
    },
];

const FEATURES: { icon: SvgIconComponent; title: string; body: string }[] = [
    {
        icon: VpnKeyIcon,
        title: "Bring your own sender",
        body: "Connect any mailbox with an email and app password. Your sender, your domain, your reputation — encrypted at rest and never locked in.",
    },
    {
        icon: DesignServicesIcon,
        title: "Visual template editor",
        body: "Design emails in a WYSIWYG editor with {{variable}} placeholders and a live preview that renders exactly what recipients will see.",
    },
    {
        icon: MarkEmailReadIcon,
        title: "One-time templates, no login",
        body: "Compose a template and send it to anyone, right away — Gmail-style. No account for the recipient, no webhook to wire up.",
    },
    {
        icon: HubIcon,
        title: "Custom team workspaces",
        body: "Invite teammates with one link, assign roles (admin, writer, viewer), and approve who joins — everyone shares one branded workspace.",
    },
    {
        icon: WebhookIcon,
        title: "Trigger from your stack",
        body: "Fire a single signed webhook from your service with per-product credentials. We resolve variables into your template and deliver.",
    },
    {
        icon: MarkEmailReadIcon,
        title: "Delivery logs & unsubscribe",
        body: "Every send is recorded with status, recipient, and resolved variables — with one-click unsubscribe and a managed suppression list built in.",
    },
];

const USE_CASES: { icon: SvgIconComponent; label: string }[] = [
    { icon: ReceiptLongIcon, label: "Receipts" },
    { icon: WavingHandIcon, label: "Welcome emails" },
    { icon: PasswordIcon, label: "Password resets" },
    { icon: LockIcon, label: "OTP & verification" },
    { icon: NotificationsActiveIcon, label: "Alerts" },
    { icon: MarkEmailReadIcon, label: "Confirmations" },
];

const TRUST: { icon: SvgIconComponent; label: string }[] = [
    { icon: HubIcon, label: "Single sign-on via Elixpo Accounts" },
    { icon: LockIcon, label: "Sender credentials encrypted at rest" },
    { icon: PublicIcon, label: "Signed webhooks with one-click unsubscribe" },
];

const WEBHOOK_EXAMPLE = `curl -X POST https://mail.elixpo.com/v1/send \\
  -H "Authorization: Bearer lix_mail_••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "config": "welcome-email",
    "to": "ada@example.com",
    "variables": { "name": "Ada", "product": "Acme" }
  }'`;

export default function Home() {
    const authed = useAuthed();
    return (
        <PageShell variant="default">
            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <PixelHero authed={authed} />

            {/* ── How it works: a connected three-step icon timeline ─────────────── */}
            <Box sx={{ background: "var(--bg)", py: { xs: 7, md: 11 } }}>
                <Container maxWidth="lg">
                    <SectionHead
                        eyebrow="How it works"
                        title="Up and running in three steps"
                        body="Connect a sender, design your email, then send it — one-time to anyone, or triggered from your app. No mail servers, no template engine to wire up."
                    />

                    <Box sx={{ position: "relative" }}>
                        {/* Connector line threading the three steps (desktop). */}
                        <Box
                            aria-hidden
                            sx={{
                                display: { xs: "none", md: "block" },
                                position: "absolute",
                                top: 34,
                                left: "16%",
                                right: "16%",
                                height: "2px",
                                background:
                                    "linear-gradient(to right, transparent, var(--accent-border) 12%, var(--accent-border) 88%, transparent)",
                            }}
                        />
                        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 4.5, md: 4 }}>
                            {STEPS.map((s, i) => (
                                <Box
                                    key={s.title}
                                    sx={{
                                        flex: 1,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: { xs: "flex-start", md: "center" },
                                        textAlign: { xs: "left", md: "center" },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 68,
                                            height: 68,
                                            borderRadius: "20px",
                                            display: "grid",
                                            placeItems: "center",
                                            background: "var(--surface)",
                                            border: "1.5px solid var(--accent-border)",
                                            color: CORAL,
                                            boxShadow: "0 6px 24px var(--accent-tint)",
                                            position: "relative",
                                            zIndex: 1,
                                        }}
                                    >
                                        <s.icon sx={{ fontSize: 30 }} />
                                    </Box>
                                    <Typography
                                        sx={{
                                            fontFamily: "var(--font-mono)",
                                            fontSize: "0.74rem",
                                            color: CORAL,
                                            fontWeight: 600,
                                            mt: 2,
                                            letterSpacing: "0.1em",
                                        }}
                                    >
                                        STEP 0{i + 1}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontFamily: "var(--font-display)",
                                            fontWeight: 500,
                                            fontSize: "1.25rem",
                                            color: "var(--fg)",
                                            mt: 0.8,
                                            mb: 1,
                                            letterSpacing: "-0.01em",
                                        }}
                                    >
                                        {s.title}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-muted)",
                                            fontSize: "0.92rem",
                                            lineHeight: 1.6,
                                            maxWidth: 300,
                                        }}
                                    >
                                        {s.body}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                </Container>
            </Box>

            <SectionThread />

            {/* ── Capabilities: soft band of icon cards (no rules) ───────────────── */}
            <Box
                id="features"
                sx={{
                    background: "var(--bg-soft)",
                    py: { xs: 8, md: 12 },
                    scrollMarginTop: "80px",
                }}
            >
                <Container maxWidth="lg">
                    <SectionHead
                        eyebrow="Capabilities"
                        title="Everything you need to send"
                        body="Your sender, your templates, your team — one-time sends or signed-webhook triggers, all from one branded workspace."
                    />

                    <Box
                        sx={{
                            display: "grid",
                            gap: 2.5,
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(2, 1fr)",
                                md: "repeat(3, 1fr)",
                            },
                        }}
                    >
                        {FEATURES.map((f) => (
                            <Box
                                key={f.title}
                                sx={{
                                    p: 3,
                                    borderRadius: "18px",
                                    background: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    boxShadow: "var(--card-shadow)",
                                    display: "flex",
                                    flexDirection: "column",
                                    transition:
                                        "border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
                                    "&:hover": {
                                        borderColor: "var(--accent-border)",
                                        transform: "translateY(-3px)",
                                        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.08)",
                                        "[data-theme='dark'] &": {
                                            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)",
                                        },
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: "12px",
                                        display: "grid",
                                        placeItems: "center",
                                        background: "var(--accent-tint)",
                                        color: CORAL,
                                        mb: 2,
                                    }}
                                >
                                    <f.icon sx={{ fontSize: 22 }} />
                                </Box>
                                <Typography
                                    sx={{
                                        fontWeight: 500,
                                        fontSize: "1.12rem",
                                        color: "var(--fg)",
                                        mb: 1,
                                        fontFamily: "var(--font-display)",
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    {f.title}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: "var(--fg-muted)",
                                        fontSize: "0.92rem",
                                        lineHeight: 1.6,
                                        mb: 2,
                                        flexGrow: 1,
                                    }}
                                >
                                    {f.body}
                                </Typography>
                                <Button
                                    component={Link}
                                    href="/docs"
                                    sx={{
                                        color: ACTION_BLUE,
                                        fontSize: "0.85rem",
                                        fontWeight: 500,
                                        textTransform: "none",
                                        p: 0,
                                        minWidth: 0,
                                        alignSelf: "flex-start",
                                        background: "transparent",
                                        "&:hover": {
                                            background: "transparent",
                                            textDecoration: "underline",
                                        },
                                    }}
                                >
                                    Learn more →
                                </Button>
                            </Box>
                        ))}
                    </Box>

                    {/* Built-on chip: lixeditor dependency */}
                    <Stack direction="row" justifyContent="center" sx={{ mt: { xs: 5, md: 7 } }}>
                        <Stack
                            component="a"
                            href="https://www.npmjs.com/package/@elixpo/lixeditor"
                            target="_blank"
                            rel="noreferrer"
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{
                                px: 2.2,
                                py: 1,
                                borderRadius: "30px",
                                border: "1px solid var(--border)",
                                background: "var(--surface)",
                                textDecoration: "none",
                                transition: "all 0.2s ease",
                                "&:hover": { borderColor: "var(--accent-border)" },
                            }}
                        >
                            <DesignServicesIcon sx={{ fontSize: 16, color: CORAL }} />
                            <Typography
                                sx={{
                                    color: "var(--fg-muted)",
                                    fontSize: "0.84rem",
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                Editor powered by{" "}
                                <Box component="span" sx={{ color: "var(--fg)", fontWeight: 600 }}>
                                    @elixpo/lixeditor
                                </Box>
                            </Typography>
                        </Stack>
                    </Stack>
                </Container>
            </Box>

            <SectionThread />

            {/* ── Use cases: Pill outline taxonomy controls ──────────────────────────────── */}
            <Box
                sx={{
                    background: "var(--bg)",
                    py: { xs: 7, md: 9 },
                }}
            >
                <Container maxWidth="md">
                    <Stack alignItems="center" textAlign="center" spacing={4}>
                        <Typography
                            sx={{
                                color: "var(--fg-muted)",
                                fontSize: "0.88rem",
                                fontWeight: 500,
                                fontFamily: "var(--font-mono)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                            }}
                        >
                            Built for every transactional moment
                        </Typography>
                        <Stack
                            direction="row"
                            spacing={1.5}
                            justifyContent="center"
                            sx={{ flexWrap: "wrap", gap: 1.5 }}
                        >
                            {USE_CASES.map((u) => (
                                <Stack
                                    key={u.label}
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{
                                        px: 2.2,
                                        py: 0.8,
                                        borderRadius: "30px", // Outlined pill radius
                                        border: "1px solid var(--border)",
                                        background: "transparent",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            borderColor: CORAL,
                                            background: "var(--accent-tint)",
                                        },
                                    }}
                                >
                                    <u.icon sx={{ fontSize: 16, color: CORAL }} />
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontSize: "0.85rem",
                                            fontWeight: 500,
                                            fontFamily: "var(--font-sans)",
                                        }}
                                    >
                                        {u.label}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </Stack>
                </Container>
            </Box>

            <SectionThread node={false} />

            {/* ── Closing CTA: dark video panel ──────────────────────────────────── */}
            <Box
                sx={{
                    background: "var(--bg)",
                    py: { xs: 8, md: 10 },
                }}
            >
                <Container maxWidth="md">
                    <Box
                        sx={{
                            position: "relative",
                            textAlign: "center",
                            py: { xs: 8, md: 10 },
                            px: { xs: 3, md: 6 },
                            background: "#0c0d12", // Dark base fallback
                            border: "1px solid var(--border)",
                            borderRadius: "22px", // Signature 22px radius
                            overflow: "hidden",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                            "[data-theme='dark'] &": {
                                background: "var(--surface)",
                                boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
                            },
                        }}
                    >
                        {/* Video Background */}
                        <Box
                            component="video"
                            autoPlay
                            loop
                            muted
                            playsInline
                            sx={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                zIndex: 0,
                                opacity: 0.85,
                            }}
                        >
                            <source
                                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_115655_b4d9cd77-feed-43cd-a198-af78ebdf1f7a.mp4"
                                type="video/mp4"
                            />
                        </Box>

                        {/* Readability Overlay */}
                        <Box
                            sx={{
                                position: "absolute",
                                inset: 0,
                                background:
                                    "linear-gradient(180deg, rgba(11, 13, 18, 0.45) 0%, rgba(11, 13, 18, 0.7) 100%)",
                                zIndex: 1,
                            }}
                        />

                        {/* Content Wrapper */}
                        <Box sx={{ position: "relative", zIndex: 2 }}>
                            <Typography
                                sx={{
                                    fontFamily: "var(--font-display)",
                                    fontWeight: 500,
                                    fontSize: { xs: "1.75rem", md: "2.5rem" },
                                    letterSpacing: "-0.03em",
                                    mb: 2,
                                    color: "#ffffff",
                                }}
                            >
                                Ship your first email today
                            </Typography>
                            <Typography
                                sx={{
                                    color: "rgba(255, 255, 255, 0.75)",
                                    fontSize: "1rem",
                                    maxWidth: 480,
                                    mx: "auto",
                                    mb: 4.5,
                                    lineHeight: 1.6,
                                    fontFamily: "var(--font-sans)",
                                }}
                            >
                                Connect a sender, design a template, and trigger a send in minutes —
                                no SMTP servers, no template engines, no queues.
                            </Typography>
                            <PrimaryCta
                                authed={authed}
                                signedOutLabel="Sign in with Elixpo"
                                sx={{
                                    background: "#ffffff",
                                    color: "#0b0d12",
                                    "&:hover": {
                                        background: "rgba(255, 255, 255, 0.9)",
                                    },
                                }}
                            />
                        </Box>
                    </Box>
                </Container>
            </Box>
        </PageShell>
    );
}
