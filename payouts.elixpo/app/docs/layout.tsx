"use client";

export const runtime = "edge";

import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    Check as CheckIcon,
    ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import MenuIcon from "@mui/icons-material/Menu";
import {
    Box,
    Button,
    Divider,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Snackbar,
    Stack,
    Toolbar,
    Tooltip,
    Typography,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import { ThemeProvider } from "@mui/material/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { makeDashboardTheme } from "@/components/dashboard-ui";
import { ThemeToggle, useThemeMode } from "@/components/theme-mode";
import BackgroundAurora from "../components/background-aurora";

const DOCS_NAV = [
    { label: "Overview", href: "/docs" },
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "Catalog sync", href: "/docs/catalog" },
    { label: "Checkout sessions", href: "/docs/checkout" },
    { label: "Webhooks", href: "/docs/webhooks" },
    { label: "Entitlements API", href: "/docs/entitlements" },
    { label: "Connected payouts", href: "/docs/payouts" },
];

export default function DocsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { mode } = useThemeMode();
    const theme = makeDashboardTheme(mode);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const buildLlmPayload = (): string => {
        const root = document.getElementById("docs-content");
        if (!root) return "";

        const lines: string[] = [];
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").trim();
            if (!text && tag !== "pre" && tag !== "code") {
                el.childNodes.forEach(walk);
                return;
            }
            switch (tag) {
                case "h1":
                    lines.push(`# ${text}`, "");
                    return;
                case "h2":
                    lines.push("", `## ${text}`, "");
                    return;
                case "h3":
                    lines.push("", `### ${text}`, "");
                    return;
                case "h4":
                    lines.push("", `#### ${text}`, "");
                    return;
                case "li":
                    lines.push(`- ${text}`);
                    return;
                case "pre": {
                    const code = el.textContent || "";
                    lines.push("", "```", code.trim(), "```", "");
                    return;
                }
                case "code":
                    if (
                        el.parentElement &&
                        el.parentElement.tagName.toLowerCase() !== "pre"
                    ) {
                        return;
                    }
                    return;
                case "p":
                    lines.push(text, "");
                    return;
                default:
                    el.childNodes.forEach(walk);
            }
        };
        root.childNodes.forEach(walk);
        const pageTitle =
            DOCS_NAV.find((n) => n.href === pathname)?.label || "Overview";
        const url =
            typeof window !== "undefined"
                ? `${window.location.origin}${pathname}`
                : pathname;

        const header = [
            `# Elixpo Pay Docs — ${pageTitle}`,
            "",
            `Source: ${url}`,
            "",
            "This is one section of the Elixpo Pay developer documentation, with a complete API primer prepended so this excerpt is self-contained.",
            "",
            "## Elixpo Pay — API at a glance",
            "",
            "Elixpo Pay is a multi-tenant payments & payouts SaaS. Apps integrate a hosted checkout and receive entitlement grants. Uses Razorpay (INR) for payments today (Stripe for international coming soon) and Elixpo Accounts for SSO.",
            "",
            "- Base URL: `https://payouts.elixpo.com`",
            "- Auth (server→server, `/v1/*`): `Authorization: Bearer <secret key>` — the secret key.",
            "",
        ].join("\n");

        return `${header + lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
    };

    const handleCopyForLlm = async () => {
        const payload = buildLlmPayload();
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = payload;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                setCopied(true);
            } catch {}
            document.body.removeChild(ta);
        }
    };

    const idx = DOCS_NAV.findIndex((n) => n.href === pathname);
    const prev = idx > 0 ? DOCS_NAV[idx - 1] : null;
    const next =
        idx >= 0 && idx < DOCS_NAV.length - 1 ? DOCS_NAV[idx + 1] : null;

    // Responsive Sidebar renderer
    const renderSidebar = () => (
        <Box sx={{ p: 2 }}>
            <List sx={{ px: 0 }}>
                {DOCS_NAV.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <ListItem
                            key={item.href}
                            disablePadding
                            sx={{ mb: 0.5 }}
                        >
                            <ListItemButton
                                component={Link}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                sx={{
                                    borderRadius: "8px",
                                    py: 0.9,
                                    px: 2,
                                    bgcolor: active
                                        ? "var(--app-overlay)"
                                        : "transparent",
                                    color: active
                                        ? "#CF4500"
                                        : "var(--app-fg-muted)",
                                    "&:hover": {
                                        bgcolor: "var(--app-overlay)",
                                        color: active ? "#CF4500" : "var(--app-fg)",
                                    },
                                }}
                            >
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontSize: "0.9rem",
                                        fontWeight: active ? 600 : 500,
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    );
                })}
            </List>
        </Box>
    );

    return (
        <ThemeProvider theme={theme}>
            <Snackbar
                open={copied}
                autoHideDuration={2400}
                onClose={() => setCopied(false)}
                anchorOrigin={{
                    vertical: "bottom",
                    horizontal: "center",
                }}
                message="Copied page as markdown to clipboard — paste into any LLM"
            />
            <Box
                sx={{
                    position: "relative",
                    minHeight: "100vh",
                    bgcolor: "var(--app-bg)", // Canvas Cream
                    color: "var(--app-fg)", // Ink Black
                }}
            >
                <BackgroundAurora variant="docs" />
                <Box
                    sx={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: "100vh",
                    }}
                >
                    {/* Documentation Header */}
                    <AppBar
                        position="sticky"
                        elevation={0}
                        sx={{
                            bgcolor: "var(--app-surface)",
                            backdropFilter: "blur(24px)",
                            borderBottom: "1px solid var(--app-overlay)",
                            color: "var(--app-fg)",
                        }}
                    >
                        <Toolbar
                            sx={{
                                maxWidth: "1280px",
                                width: "100%",
                                mx: "auto",
                                px: { xs: 2, md: 3 },
                            }}
                        >
                            <IconButton
                                color="inherit"
                                edge="start"
                                onClick={() => setMobileOpen(!mobileOpen)}
                                sx={{ mr: 2, display: { md: "none" } }}
                            >
                                <MenuIcon />
                            </IconButton>

                            <Box
                                component={Link}
                                href="/"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    textDecoration: "none",
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/logo.png"
                                    alt="Elixpo Pay"
                                    sx={{
                                        height: 24,
                                        width: "auto",
                                        display: "block",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "14px",
                                        letterSpacing: "-0.01em",
                                        color: "var(--app-fg)",
                                        ml: 1.5,
                                        fontFamily: "var(--font-sofia-sans)",
                                    }}
                                >
                                    Elixpo{" "}
                                    <Box
                                        component="span"
                                        sx={{ color: "var(--app-fg-muted)", fontWeight: 600 }}
                                    >
                                        Docs
                                    </Box>
                                </Typography>
                            </Box>

                            <Box sx={{ flexGrow: 1 }} />

                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <ThemeToggle size={40} />
                                {/* Outlined Pill Copy Button */}
                                <Tooltip
                                    title={
                                        copied
                                            ? "Copied!"
                                            : "Copy this page as plain text to paste into an LLM"
                                    }
                                    arrow
                                >
                                    <Button
                                        onClick={handleCopyForLlm}
                                        startIcon={
                                            copied ? (
                                                <CheckIcon sx={{ fontSize: "1.1rem !important" }} />
                                            ) : (
                                                <ContentCopyIcon sx={{ fontSize: "1.05rem !important" }} />
                                            )
                                        }
                                        sx={{
                                            color: copied ? "#CF4500" : "var(--app-fg)",
                                            textTransform: "none",
                                            fontWeight: 500,
                                            fontSize: "13px",
                                            px: 2.5,
                                            py: 0.5,
                                            borderRadius: "20px", // Signature button radius
                                            border: "1.5px solid var(--app-fg)",
                                            background: "var(--app-surface)",
                                            fontFamily: "var(--font-sofia-sans)",
                                            "&:hover": {
                                                bgcolor: "var(--app-overlay)",
                                                borderColor: "var(--app-fg)",
                                            },
                                        }}
                                    >
                                        {copied ? "Copied" : "Copy for LLM"}
                                    </Button>
                                </Tooltip>
                                
                                <Button
                                    component={Link}
                                    href="/dashboard"
                                    sx={{
                                        textTransform: "none",
                                        fontWeight: 500,
                                        fontSize: "14px",
                                        color: "var(--app-fg)",
                                        fontFamily: "var(--font-sofia-sans)",
                                        "&:hover": {
                                            bgcolor: "var(--app-overlay)",
                                        },
                                    }}
                                >
                                    Dashboard
                                </Button>
                            </Stack>
                        </Toolbar>
                    </AppBar>

                    {/* Docs Body Content Grid */}
                    <Box
                        sx={{
                            display: "flex",
                            flexGrow: 1,
                            maxWidth: "1280px",
                            width: "100%",
                            mx: "auto",
                            px: { xs: 2, md: 3 },
                        }}
                    >
                        {/* Desktop Sidebar Navigation */}
                        <Box
                            component="nav"
                            sx={{
                                width: 240,
                                flexShrink: 0,
                                display: { xs: "none", md: "block" },
                                borderRight: "1px solid var(--app-overlay)",
                                position: "sticky",
                                top: 64,
                                height: "calc(100vh - 64px)",
                                overflowY: "auto",
                                pt: 2,
                            }}
                        >
                            {renderSidebar()}
                        </Box>

                        {/* Mobile Drawer Navigation */}
                        <Drawer
                            variant="temporary"
                            open={mobileOpen}
                            onClose={() => setMobileOpen(false)}
                            ModalProps={{ keepMounted: true }}
                            sx={{
                                display: { xs: "block", md: "none" },
                                "& .MuiDrawer-paper": {
                                    width: 260,
                                    bgcolor: "var(--app-surface)",
                                    borderRight: "1px solid var(--app-border)",
                                    color: "var(--app-fg)",
                                },
                            }}
                        >
                            {renderSidebar()}
                        </Drawer>

                        {/* Main Docs Content */}
                        <Box
                            component="main"
                            sx={{
                                flexGrow: 1,
                                minWidth: 0,
                                pt: 5,
                                pb: 10,
                                px: { xs: 0, md: 5 },
                                maxWidth: 820,
                            }}
                        >
                            <Box id="docs-content">{children}</Box>

                            <Divider
                                sx={{
                                    my: 5,
                                    borderColor: "var(--app-overlay)",
                                }}
                            />

                            {/* Pagination Controls */}
                            <Box
                                sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 2,
                                    flexWrap: "wrap",
                                }}
                            >
                                {prev ? (
                                    <Button
                                        component={Link}
                                        href={prev.href}
                                        startIcon={<ArrowBackIcon />}
                                        sx={navBtn}
                                    >
                                        {prev.label}
                                    </Button>
                                ) : (
                                    <Box />
                                )}
                                {next ? (
                                    <Button
                                        component={Link}
                                        href={next.href}
                                        endIcon={<ArrowForwardIcon />}
                                        sx={navBtn}
                                    >
                                        {next.label}
                                    </Button>
                                ) : (
                                    <Box />
                                )}
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}

const navBtn = {
    color: "var(--app-fg)",
    borderColor: "var(--app-fg)",
    textTransform: "none",
    fontWeight: 500,
    fontFamily: "var(--font-sofia-sans)",
    px: 2.5,
    py: 1,
    border: "1.5px solid",
    borderRadius: "20px", // Signature button radius
    background: "var(--app-surface)",
    "&:hover": { borderColor: "var(--app-fg)", bgcolor: "var(--app-overlay)" },
};
