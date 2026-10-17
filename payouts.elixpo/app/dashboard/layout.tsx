"use client";

export const runtime = "edge";

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import CardMembershipIcon from "@mui/icons-material/CardMembership";
import CodeIcon from "@mui/icons-material/Code";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import InventoryIcon from "@mui/icons-material/Inventory2";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import PersonIcon from "@mui/icons-material/Person";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import WebhookIcon from "@mui/icons-material/Webhook";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Stack,
    Toolbar,
    Typography,
} from "@mui/material";
import AppBar from "@mui/material/AppBar";
import IconButton from "@mui/material/IconButton";
import { ThemeProvider } from "@mui/material/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { makeDashboardTheme } from "@/components/dashboard-ui";
import { ThemeToggle, useThemeMode } from "@/components/theme-mode";
import BackgroundAurora from "../components/background-aurora";

const NAV = [
    { label: "Overview", icon: SpaceDashboardIcon, href: "/dashboard" },
    { label: "Products", icon: InventoryIcon, href: "/dashboard/products" },
    {
        label: "Webhooks",
        icon: WebhookIcon,
        href: "/dashboard/webhooks",
    },
    {
        label: "Transactions",
        icon: ReceiptLongIcon,
        href: "/dashboard/transactions",
    },
    {
        label: "Payouts",
        icon: AccountBalanceIcon,
        href: "/dashboard/payouts",
    },
    {
        label: "My subscriptions",
        icon: CardMembershipIcon,
        href: "/dashboard/subscriptions",
    },
];

interface Me {
    name: string;
    email: string;
    avatar: string | null;
    merchant: { id: string; name: string };
}

const ACCOUNTS_PROFILE = "https://accounts.elixpo.com/dashboard/profile";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { mode } = useThemeMode();
    const theme = makeDashboardTheme(mode);
    const [me, setMe] = useState<Me | null>(null);
    const [checked, setChecked] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data: any) => {
                if (!data) {
                    window.location.assign("/login");
                    return;
                }
                setMe(data);
                setChecked(true);
            })
            .catch(() => window.location.assign("/login"));
    }, []);

    const logout = async () => {
        setAnchorEl(null);
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // silent
        }
        window.location.assign("/");
    };

    const isActive = (href: string) =>
        href === "/dashboard" ? pathname === href : pathname.startsWith(href);

    if (!checked) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "var(--app-bg)",
                }}
            >
                <CircularProgress sx={{ color: "#9b7bf7" }} />
            </Box>
        );
    }

    const initial = (me?.name || me?.email || "M").charAt(0).toUpperCase();
    const showImg = !!me?.avatar && !imgError;

    const avatarNode = showImg ? (
        <Box
            component="img"
            src={me?.avatar ?? ""}
            alt={me?.name ?? "Account"}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
            }}
        />
    ) : (
        <Box
            sx={{
                width: "100%",
                height: "100%",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                color: "var(--app-fg)",
                background: "#272c38",
            }}
        >
            {initial}
        </Box>
    );

    return (
        <ThemeProvider theme={theme}>
            <Box
                sx={{
                    position: "relative",
                    minHeight: "100vh",
                    color: "var(--app-fg)",
                    background: "var(--app-bg)",
                }}
            >
                <BackgroundAurora variant="default" />
                <Box sx={{ position: "relative", zIndex: 1 }}>
                    <AppBar
                        position="sticky"
                        elevation={0}
                        sx={{
                            bgcolor: "color-mix(in srgb, var(--app-bg) 88%, transparent)",
                            backdropFilter: "blur(16px)",
                            borderBottom: "1px solid var(--app-border)",
                        }}
                    >
                        <Toolbar
                            sx={{
                                maxWidth: "1280px",
                                width: "100%",
                                mx: "auto",
                                px: { xs: 2, md: 3 },
                                gap: 1,
                            }}
                        >
                            <Box
                                component={Link}
                                href="/dashboard"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.2,
                                    textDecoration: "none",
                                    mr: { xs: 1, md: 3 },
                                    flexShrink: 0,
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/mark.png"
                                    alt="Elixpo Pay"
                                    sx={{
                                        height: 30,
                                        width: 30,
                                        borderRadius: "8px",
                                        display: "block",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        color: "var(--app-fg)",
                                        display: { xs: "none", sm: "block" },
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    Elixpo Pay
                                </Typography>
                            </Box>

                            <Stack
                                direction="row"
                                spacing={0.5}
                                sx={{ flexGrow: 1, overflowX: "auto" }}
                            >
                                {NAV.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Button
                                            key={item.href}
                                            component={Link}
                                            href={item.href}
                                            startIcon={
                                                <item.icon
                                                    sx={{
                                                        fontSize:
                                                            "1.1rem !important",
                                                    }}
                                                />
                                            }
                                            sx={{
                                                textTransform: "none",
                                                fontWeight: 600,
                                                fontSize: "0.85rem",
                                                whiteSpace: "nowrap",
                                                px: 1.6,
                                                borderRadius: "8px",
                                                color: active
                                                    ? "var(--app-fg)"
                                                    : "var(--app-fg-muted)",
                                                bgcolor: active
                                                    ? "var(--app-overlay)"
                                                    : "transparent",
                                                "&:hover": {
                                                    bgcolor:
                                                        "var(--app-overlay)",
                                                    color: "var(--app-fg)",
                                                },
                                            }}
                                        >
                                            <Box
                                                component="span"
                                                sx={{
                                                    display: {
                                                        xs: "none",
                                                        md: "inline",
                                                    },
                                                }}
                                            >
                                                {item.label}
                                            </Box>
                                        </Button>
                                    );
                                })}
                            </Stack>

                            <ThemeToggle size={36} />

                            <IconButton
                                onClick={(e) => setAnchorEl(e.currentTarget)}
                                sx={{
                                    p: 0.5,
                                    pr: { xs: 0.5, sm: 1.4 },
                                    gap: 1,
                                    borderRadius: "999px",
                                    border: "1px solid var(--app-border)",
                                    "&:hover": { background: "var(--app-overlay)" },
                                }}
                                aria-label="Account menu"
                            >
                                <Box
                                    sx={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: "50%",
                                        overflow: "hidden",
                                        border: "1px solid var(--app-border)",
                                        flexShrink: 0,
                                    }}
                                >
                                    {avatarNode}
                                </Box>
                                {/* Name + email stacked beside the pfp (desktop). */}
                                <Box
                                    sx={{
                                        display: { xs: "none", sm: "flex" },
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        lineHeight: 1.15,
                                        maxWidth: 180,
                                    }}
                                >
                                    <Box
                                        component="span"
                                        sx={{
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            color: "var(--app-fg)",
                                            maxWidth: 180,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {me?.name}
                                    </Box>
                                    <Box
                                        component="span"
                                        sx={{
                                            fontSize: "0.72rem",
                                            color: "var(--app-fg-faint)",
                                            maxWidth: 180,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {me?.email}
                                    </Box>
                                </Box>
                            </IconButton>

                            <Menu
                                anchorEl={anchorEl}
                                open={Boolean(anchorEl)}
                                onClose={() => setAnchorEl(null)}
                                transformOrigin={{
                                    horizontal: "right",
                                    vertical: "top",
                                }}
                                anchorOrigin={{
                                    horizontal: "right",
                                    vertical: "bottom",
                                }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            mt: 1,
                                            minWidth: 272,
                                            bgcolor: "var(--app-surface)",
                                            border: "1px solid var(--app-border)",
                                            borderRadius: "14px",
                                            boxShadow:
                                                "0 16px 48px rgba(0,0,0,0.55)",
                                            overflow: "hidden",
                                        },
                                    },
                                }}
                                MenuListProps={{ sx: { py: 0 } }}
                            >
                                {/* account header */}
                                <Box
                                    sx={{
                                        px: 2,
                                        py: 1.8,
                                        display: "flex",
                                        gap: 1.4,
                                        alignItems: "center",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: "50%",
                                            overflow: "hidden",
                                            border: "1px solid var(--app-border)",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {avatarNode}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                            sx={{
                                                fontWeight: 600,
                                                fontSize: "0.92rem",
                                                color: "var(--app-fg)",
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {me?.name}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: "var(--app-fg-muted)",
                                                fontSize: "0.78rem",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {me?.email}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ px: 2, pb: 1.6 }}>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            px: 1.4,
                                            py: 1,
                                            borderRadius: "10px",
                                            background:
                                                "var(--app-overlay)",
                                            border: "1px solid var(--app-border)",
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.68rem",
                                                    color: "var(--app-fg-muted)",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.06em",
                                                }}
                                            >
                                                Merchant
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.85rem",
                                                    color: "var(--app-fg)",
                                                    fontWeight: 600,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {me?.merchant.name}
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                px: 1,
                                                py: 0.3,
                                                borderRadius: "999px",
                                                fontSize: "0.66rem",
                                                fontWeight: 700,
                                                color: "#c4b5fd",
                                                background:
                                                    "rgba(155,123,247,0.12)",
                                                border: "1px solid rgba(155,123,247,0.3)",
                                                flexShrink: 0,
                                                ml: 1,
                                            }}
                                        >
                                            Starter
                                        </Box>
                                    </Box>
                                </Box>

                                <Divider
                                    sx={{
                                        borderColor: "var(--app-border)",
                                    }}
                                />
                                <SectionLabel>Account</SectionLabel>
                                <AccountItem
                                    icon={<PersonIcon fontSize="small" />}
                                    label="Account settings"
                                    href={ACCOUNTS_PROFILE}
                                    external
                                    onClick={() => setAnchorEl(null)}
                                />
                                <AccountItem
                                    icon={<CodeIcon fontSize="small" />}
                                    label="Products & API keys"
                                    href="/dashboard/products"
                                    onClick={() => setAnchorEl(null)}
                                />
                                <AccountItem
                                    icon={<CreditCardIcon fontSize="small" />}
                                    label="Billing & plans"
                                    href="/pricing"
                                    onClick={() => setAnchorEl(null)}
                                />

                                <Divider
                                    sx={{
                                        borderColor: "var(--app-border)",
                                    }}
                                />
                                <SectionLabel>Resources</SectionLabel>
                                <AccountItem
                                    icon={<MenuBookIcon fontSize="small" />}
                                    label="Documentation"
                                    href="/docs"
                                    onClick={() => setAnchorEl(null)}
                                />
                                <AccountItem
                                    icon={<HelpOutlineIcon fontSize="small" />}
                                    label="Support"
                                    href="mailto:hello@elixpo.com"
                                    external
                                    onClick={() => setAnchorEl(null)}
                                />

                                <Divider
                                    sx={{
                                        borderColor: "var(--app-border)",
                                    }}
                                />
                                <MenuItem
                                    onClick={logout}
                                    sx={{
                                        py: 1.25,
                                        color: "var(--app-fg-muted)",
                                        "&:hover": {
                                            bgcolor: "rgba(239,68,68,0.08)",
                                            color: "#ef4444",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 34 }}
                                    >
                                        <LogoutIcon fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        Sign out
                                    </ListItemText>
                                </MenuItem>
                            </Menu>
                        </Toolbar>
                    </AppBar>

                    <Box
                        component="main"
                        sx={{
                            maxWidth: "1280px",
                            mx: "auto",
                            px: { xs: 2, md: 3 },
                            py: { xs: 3, md: 4 },
                        }}
                    >
                        {children}
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                px: 2,
                pt: 1.2,
                pb: 0.4,
                fontSize: "0.66rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--app-fg-muted)",
            }}
        >
            {children}
        </Typography>
    );
}

function AccountItem({
    icon,
    label,
    href,
    external,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    href: string;
    external?: boolean;
    onClick?: () => void;
}) {
    const linkProps = external
        ? {
              component: "a" as const,
              href,
              target: "_blank",
              rel: "noopener noreferrer",
          }
        : { component: Link, href };
    return (
        <MenuItem
            {...(linkProps as any)}
            onClick={onClick}
            sx={{
                py: 1.05,
                color: "var(--app-fg-muted)",
                "&:hover": {
                    bgcolor: "var(--app-accent-soft)",
                    color: "var(--app-accent)",
                },
            }}
        >
            <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>
                {icon}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "0.875rem" }}>
                {label}
            </ListItemText>
        </MenuItem>
    );
}
