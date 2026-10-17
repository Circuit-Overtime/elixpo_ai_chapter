"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import GitHubIcon from "@mui/icons-material/GitHub";
import GoogleIcon from "@mui/icons-material/Google";
import LoginIcon from "@mui/icons-material/Login";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
    Box,
    Button,
    Chip,
    IconButton,
    Snackbar,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const _ACCENT = "#ff7759";
const SUPPORT_EMAIL = "hello@elixpo.com";

interface Action {
    label: string;
    href?: string;
    onClick?: () => void;
    primary?: boolean;
    icon?: React.ReactNode;
}

interface ErrorView {
    title: string;
    body: (description: string) => string;
    actions: Action[];
    accent?: string;
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
    google: <GoogleIcon sx={{ fontSize: "1.05rem" }} />,
    github: <GitHubIcon sx={{ fontSize: "1.05rem" }} />,
    email: <MailOutlineIcon sx={{ fontSize: "1.05rem" }} />,
};

function extractProvider(description: string): string | null {
    // Match the server-side phrasing: "...already exists using <provider>. Please..."
    const match = description.match(/using\s+([a-zA-Z, ]+?)\./);
    if (!match) return null;
    const first = match[1].split(",")[0].trim().toLowerCase();
    return ["google", "github", "email"].includes(first) ? first : null;
}

function buildView(
    code: string,
    description: string,
    actions: {
        retry: () => void;
        copyEmail: () => void;
    },
): ErrorView {
    switch (code) {
        case "account_not_found":
            return {
                title: "No account yet",
                body: () =>
                    "We couldn't find an Elixpo account with that email. Create one in a few seconds and you'll be in.",
                actions: [
                    {
                        label: "Create account",
                        href: "/register",
                        primary: true,
                        icon: (
                            <PersonAddAlt1Icon sx={{ fontSize: "1.05rem" }} />
                        ),
                    },
                    {
                        label: "Back to sign in",
                        href: "/login",
                        icon: <LoginIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                ],
            };

        case "provider_conflict": {
            const provider = extractProvider(description);
            const friendly = provider
                ? `This email is already linked to your ${provider[0].toUpperCase()}${provider.slice(1)} sign-in. Use that to continue — we'll keep you on the same account.`
                : description ||
                  "This email is already linked to a different sign-in method. Use that one to continue.";
            return {
                title: "Use your original sign-in",
                body: () => friendly,
                actions: [
                    {
                        label: provider
                            ? `Sign in with ${provider[0].toUpperCase()}${provider.slice(1)}`
                            : "Back to sign in",
                        href: "/login",
                        primary: true,
                        icon: provider ? (
                            PROVIDER_ICONS[provider]
                        ) : (
                            <LoginIcon sx={{ fontSize: "1.05rem" }} />
                        ),
                    },
                    {
                        label: "Create a separate account",
                        href: "/register",
                    },
                ],
            };
        }

        case "email_required":
            return {
                title: "We need an email",
                body: () =>
                    "Your sign-in provider didn't share a verified email. Make your email public with that provider, or sign up with email instead.",
                actions: [
                    {
                        label: "Sign up with email",
                        href: "/register",
                        primary: true,
                        icon: <MailOutlineIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    {
                        label: "Try a different provider",
                        href: "/login",
                    },
                ],
            };

        case "access_denied":
            return {
                title: "Sign-in cancelled",
                body: () =>
                    "You declined the provider's permission prompt. Try again and approve the requested permissions.",
                actions: [
                    {
                        label: "Try again",
                        href: "/login",
                        primary: true,
                        icon: <RefreshIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    { label: "Go home", href: "/" },
                ],
            };

        case "invalid_state":
        case "invalid_request":
            return {
                title: "Session expired",
                body: () =>
                    "The sign-in link timed out or the session got out of sync. Start the flow again and you'll be fine.",
                actions: [
                    {
                        label: "Sign in again",
                        href: "/login",
                        primary: true,
                        icon: <LoginIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    { label: "Go home", href: "/" },
                ],
            };

        case "token_exchange_failed":
        case "user_info_failed":
        case "server_error":
        case "unsupported_provider":
        case "provider_error":
            return {
                title: "Couldn't sign you in",
                body: (desc) =>
                    desc ||
                    "Something went wrong on our side while finishing the sign-in. Give it another try.",
                actions: [
                    {
                        label: "Try again",
                        href: "/login",
                        primary: true,
                        icon: <RefreshIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    {
                        label: `Copy support email`,
                        onClick: actions.copyEmail,
                        icon: <ContentCopyIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                ],
            };

        case "account_error":
            return {
                title: "Account inconsistency",
                body: () =>
                    "Your account data looks inconsistent on our end. We need to look at this manually — drop us a line and we'll sort it.",
                actions: [
                    {
                        label: "Copy support email",
                        onClick: actions.copyEmail,
                        primary: true,
                        icon: <ContentCopyIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    { label: "Back to sign in", href: "/login" },
                ],
            };

        case "unauthorized":
            return {
                title: "Not authorized",
                body: () =>
                    description ||
                    "You don't have access to this resource. If you think this is wrong, contact support.",
                actions: [
                    {
                        label: "Back to sign in",
                        href: "/login",
                        primary: true,
                        icon: <LoginIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                ],
            };

        default:
            return {
                title: "Something went wrong",
                body: (desc) =>
                    desc ||
                    "An unexpected error occurred while signing you in. Try again, or contact support if it keeps happening.",
                actions: [
                    {
                        label: "Try again",
                        href: "/login",
                        primary: true,
                        icon: <RefreshIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                    {
                        label: "Copy support email",
                        onClick: actions.copyEmail,
                        icon: <ContentCopyIcon sx={{ fontSize: "1.05rem" }} />,
                    },
                ],
            };
    }
}

const primaryBtnSx = {
    textTransform: "none",
    fontWeight: 600,
    fontSize: "0.95rem",
    color: "#fff",
    background: "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
    borderRadius: "12px",
    py: 1.2,
    boxShadow: "0 8px 24px rgba(255, 119, 89,0.32)",
    transition: "all 0.2s ease",
    "&:hover": {
        background: "linear-gradient(135deg, #ff7759 0%, #ff7759 100%)",
        boxShadow: "0 12px 32px rgba(255, 119, 89,0.45)",
        transform: "translateY(-1px)",
    },
};

const secondaryBtnSx = {
    textTransform: "none",
    fontWeight: 500,
    fontSize: "0.95rem",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    py: 1.2,
    "&:hover": {
        borderColor: "rgba(255, 119, 89,0.4)",
        background: "var(--overlay)",
    },
};

const ErrorContent = () => {
    const searchParams = useSearchParams();
    const code = searchParams.get("error") || "unknown";
    const description = searchParams.get("description") || "";
    const [copied, setCopied] = useState(false);

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(SUPPORT_EMAIL);
            setCopied(true);
        } catch {
            window.location.href = `mailto:${SUPPORT_EMAIL}`;
        }
    };

    const view = buildView(code, description, {
        retry: () => window.location.assign("/login"),
        copyEmail,
    });

    return (
        <Box
            sx={{
                minHeight: "90vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                p: 2,
            }}
        >
            <Box
                sx={{
                    maxWidth: 460,
                    width: "100%",
                    backdropFilter: "blur(20px)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "18px",
                    p: { xs: 3, md: 4 },
                }}
            >
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.2}
                    sx={{ mb: 2.2 }}
                >
                    <Box
                        sx={{
                            display: "inline-flex",
                            p: 1.1,
                            borderRadius: "10px",
                            background: "rgba(248, 113, 113, 0.12)",
                            border: "1px solid rgba(248, 113, 113, 0.3)",
                            color: "#b91c1c",
                        }}
                    >
                        <ErrorOutlineIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Chip
                        label={code.replace(/_/g, " ")}
                        size="small"
                        sx={{
                            bgcolor: "rgba(248, 113, 113, 0.1)",
                            color: "#b91c1c",
                            border: "1px solid rgba(248, 113, 113, 0.25)",
                            fontWeight: 600,
                            fontSize: "0.68rem",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            height: 22,
                        }}
                    />
                </Stack>

                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: "1.6rem", md: "1.85rem" },
                        color: "var(--fg)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.15,
                        mb: 1.2,
                    }}
                >
                    {view.title}
                </Typography>

                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.95rem",
                        lineHeight: 1.6,
                        mb: 3,
                    }}
                >
                    {view.body(description)}
                </Typography>

                <Stack spacing={1.2}>
                    {view.actions.map((action) => {
                        const sx = action.primary
                            ? primaryBtnSx
                            : secondaryBtnSx;

                        if (action.href) {
                            return (
                                <Button
                                    key={action.label}
                                    component={Link}
                                    href={action.href}
                                    fullWidth
                                    startIcon={action.icon}
                                    endIcon={
                                        action.primary ? (
                                            <ArrowForwardIcon
                                                sx={{ fontSize: "1rem" }}
                                            />
                                        ) : undefined
                                    }
                                    sx={sx}
                                >
                                    {action.label}
                                </Button>
                            );
                        }
                        return (
                            <Button
                                key={action.label}
                                onClick={action.onClick}
                                fullWidth
                                startIcon={action.icon}
                                sx={sx}
                            >
                                {action.label}
                            </Button>
                        );
                    })}
                </Stack>

                <Box
                    sx={{
                        mt: 3,
                        pt: 2.5,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.82rem",
                        }}
                    >
                        Still stuck? We're a quick email away.
                    </Typography>
                    <Tooltip
                        title={copied ? "Copied!" : `Copy ${SUPPORT_EMAIL}`}
                        arrow
                    >
                        <IconButton
                            onClick={copyEmail}
                            aria-label="Copy support email"
                            sx={{
                                color: "var(--fg-muted)",
                                border: "1px solid var(--border)",
                                borderRadius: "10px",
                                width: 34,
                                height: 34,
                                "&:hover": {
                                    color: "#ff7759",
                                    borderColor: "rgba(255, 119, 89,0.45)",
                                    background: "rgba(255, 119, 89,0.08)",
                                },
                            }}
                        >
                            <MailOutlineIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            <Snackbar
                open={copied}
                autoHideDuration={2200}
                onClose={() => setCopied(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={`Copied ${SUPPORT_EMAIL} to clipboard`}
            />
        </Box>
    );
};

const ErrorPage = () => (
    <Suspense>
        <ErrorContent />
    </Suspense>
);

export default ErrorPage;
