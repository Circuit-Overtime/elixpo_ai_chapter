"use client";

import BackgroundAurora from "@/components/background-aurora";
import { C } from "@/components/ui";
import {
    AccountTree,
    Bolt,
    CreditCard,
    Dns,
    History,
    Hub,
    Inventory2,
    Launch,
    Logout,
    MenuBook,
    Menu as MenuIcon,
    OpenInNew,
    Public,
    Queue,
    Settings as SettingsIcon,
    Speed,
    Storage,
    ViewList,
    VpnKey,
} from "@mui/icons-material";
import {
    AppBar,
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useState } from "react";

const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: C.accent },
        background: { default: "transparent", paper: "rgba(20,22,34,0.6)" },
        text: { primary: C.text, secondary: C.textDim },
    },
    typography: {
        fontFamily: "var(--font-geist-sans), Arial, sans-serif",
        fontSize: 13,
    },
    components: {
        MuiCard: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    },
});

const navItems = [
    { label: "Overview", icon: Speed, href: "/dashboard" },
    { label: "Projects", icon: Inventory2, href: "/dashboard/projects" },
    { label: "Traffic", icon: Public, href: "/dashboard/traffic" },
    { label: "Workers", icon: Bolt, href: "/dashboard/workers" },
    { label: "D1", icon: Storage, href: "/dashboard/d1" },
    { label: "KV", icon: ViewList, href: "/dashboard/kv" },
    { label: "Queues", icon: Queue, href: "/dashboard/queues" },
    { label: "Durable Objects", icon: Hub, href: "/dashboard/durable-objects" },
    { label: "Workflows", icon: AccountTree, href: "/dashboard/workflows" },
    { label: "DNS", icon: Dns, href: "/dashboard/dns" },
    { label: "Audit", icon: History, href: "/dashboard/audit" },
    { label: "Settings", icon: SettingsIcon, href: "/dashboard/settings" },
];

export interface ChromeUser {
    email: string;
    name?: string;
    avatar?: string | null;
}

export default function DashboardChrome({
    user,
    children,
}: { user: ChromeUser; children: React.ReactNode }) {
    const pathname = usePathname();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [drawer, setDrawer] = useState(false);

    const isActive = (href: string) =>
        href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(href);

    return (
        <ThemeProvider theme={theme}>
            <Box
                sx={{ minHeight: "100vh", position: "relative", color: C.text }}
            >
                <BackgroundAurora variant="default" />
                <Box sx={{ position: "relative", zIndex: 1 }}>
                    <AppBar
                        position="sticky"
                        elevation={0}
                        sx={{
                            bgcolor: "rgba(11,13,18,0.55)",
                            backdropFilter: "blur(16px)",
                            borderBottom: `1px solid ${C.border}`,
                            backgroundImage: "none",
                        }}
                    >
                        <Toolbar
                            sx={{
                                maxWidth: 1600,
                                width: "100%",
                                mx: "auto",
                                px: { xs: 1.5, md: 2.5 },
                                minHeight: { xs: 56, md: 60 },
                            }}
                        >
                            {/* mobile hamburger */}
                            <IconButton
                                onClick={() => setDrawer(true)}
                                sx={{
                                    display: { xs: "inline-flex", md: "none" },
                                    mr: 1,
                                    color: C.textDim,
                                }}
                            >
                                <MenuIcon />
                            </IconButton>

                            {/* logo */}
                            <Box
                                component={Link}
                                href="/dashboard"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.25,
                                    textDecoration: "none",
                                    mr: 3,
                                    flexShrink: 0,
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/icon.png"
                                    alt="Elixpo"
                                    sx={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: "7px",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: "1rem",
                                        color: C.text,
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    Elixpo Admin
                                </Typography>
                            </Box>

                            {/* desktop nav with labels */}
                            <Box
                                sx={{
                                    display: { xs: "none", md: "flex" },
                                    alignItems: "center",
                                    gap: 0.25,
                                    flexWrap: "wrap",
                                }}
                            >
                                {navItems.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <Box
                                            key={item.href}
                                            component={Link}
                                            href={item.href}
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.6,
                                                px: 1.1,
                                                height: 34,
                                                borderRadius: "8px",
                                                textDecoration: "none",
                                                fontSize: "0.8rem",
                                                fontWeight: 600,
                                                color: active
                                                    ? C.accentLight
                                                    : C.textMuted,
                                                bgcolor: active
                                                    ? C.accentDim
                                                    : "transparent",
                                                "&:hover": {
                                                    bgcolor: active
                                                        ? C.accentDim
                                                        : "rgba(255,255,255,0.05)",
                                                    color: active
                                                        ? C.accentLight
                                                        : C.text,
                                                },
                                            }}
                                        >
                                            <item.icon
                                                sx={{ fontSize: "1.05rem" }}
                                            />
                                            {item.label}
                                        </Box>
                                    );
                                })}
                            </Box>

                            <Box sx={{ flexGrow: 1 }} />

                            <IconButton
                                onClick={(e) => setAnchorEl(e.currentTarget)}
                                sx={{ p: 0.5 }}
                            >
                                <Avatar user={user} size={32} />
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
                                            bgcolor: "rgba(20,22,34,0.97)",
                                            backdropFilter: "blur(16px)",
                                            border: `1px solid ${C.border}`,
                                            borderRadius: "12px",
                                            minWidth: 250,
                                        },
                                    },
                                }}
                            >
                                <Box sx={{ px: 2, py: 1.5 }}>
                                    <Typography
                                        sx={{
                                            color: C.text,
                                            fontWeight: 700,
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        {user.name || "Admin"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: C.textMuted,
                                            fontSize: "0.78rem",
                                        }}
                                    >
                                        {user.email}
                                    </Typography>
                                    <Box
                                        sx={{
                                            mt: 0.75,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            px: 1,
                                            py: 0.25,
                                            borderRadius: "6px",
                                            bgcolor: C.accentDim,
                                            border: `1px solid ${C.accent}44`,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: C.accentLight,
                                                fontSize: "0.68rem",
                                                fontWeight: 700,
                                                textTransform: "uppercase",
                                                letterSpacing: "0.04em",
                                            }}
                                        >
                                            Admin
                                        </Typography>
                                    </Box>
                                </Box>
                                <Divider sx={{ borderColor: C.border }} />
                                <ProfileLink
                                    href="https://dash.cloudflare.com"
                                    icon={<Launch fontSize="small" />}
                                    label="Cloudflare dashboard"
                                    external
                                />
                                <ProfileLink
                                    href="https://accounts.elixpo.com/dashboard"
                                    icon={<OpenInNew fontSize="small" />}
                                    label="Elixpo Accounts"
                                    external
                                />
                                <ProfileLink
                                    href="https://dash.cloudflare.com/?to=/:account/billing"
                                    icon={<CreditCard fontSize="small" />}
                                    label="Billing & usage"
                                    external
                                />
                                <ProfileLink
                                    href="https://dash.cloudflare.com/profile/api-tokens"
                                    icon={<VpnKey fontSize="small" />}
                                    label="API tokens"
                                    external
                                />
                                <ProfileLink
                                    href="https://developers.cloudflare.com"
                                    icon={<MenuBook fontSize="small" />}
                                    label="Documentation"
                                    external
                                />
                                <ProfileLink
                                    href="/dashboard/audit"
                                    icon={<History fontSize="small" />}
                                    label="Audit log"
                                    onClick={() => setAnchorEl(null)}
                                />
                                <ProfileLink
                                    href="/dashboard/settings"
                                    icon={<SettingsIcon fontSize="small" />}
                                    label="Settings"
                                    onClick={() => setAnchorEl(null)}
                                />
                                <Divider sx={{ borderColor: C.border }} />
                                <MenuItem
                                    component="a"
                                    href="/api/auth/logout"
                                    sx={{
                                        py: 1.1,
                                        color: C.textDim,
                                        "&:hover": {
                                            bgcolor: "rgba(248,113,113,0.1)",
                                            color: C.error,
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 34 }}
                                    >
                                        <Logout fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        Logout
                                    </ListItemText>
                                </MenuItem>
                            </Menu>
                        </Toolbar>
                    </AppBar>

                    {/* mobile drawer */}
                    <Drawer
                        anchor="left"
                        open={drawer}
                        onClose={() => setDrawer(false)}
                        slotProps={{
                            paper: {
                                sx: {
                                    width: 260,
                                    bgcolor: "rgba(15,17,26,0.98)",
                                    backdropFilter: "blur(16px)",
                                    borderRight: `1px solid ${C.border}`,
                                },
                            },
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 2,
                                py: 2,
                            }}
                        >
                            <Box
                                component="img"
                                src="/icon.png"
                                alt="Elixpo"
                                sx={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: "6px",
                                }}
                            />
                            <Typography sx={{ fontWeight: 800, color: C.text }}>
                                Elixpo Admin
                            </Typography>
                        </Box>
                        <Divider sx={{ borderColor: C.border }} />
                        <List sx={{ px: 1 }}>
                            {navItems.map((item) => {
                                const active = isActive(item.href);
                                return (
                                    <ListItemButton
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        onClick={() => setDrawer(false)}
                                        sx={{
                                            borderRadius: "8px",
                                            mb: 0.25,
                                            color: active
                                                ? C.accentLight
                                                : C.textDim,
                                            bgcolor: active
                                                ? C.accentDim
                                                : "transparent",
                                            "&:hover": {
                                                bgcolor:
                                                    "rgba(255,255,255,0.05)",
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                color: "inherit",
                                                minWidth: 36,
                                            }}
                                        >
                                            <item.icon fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText
                                            primaryTypographyProps={{
                                                fontSize: "0.85rem",
                                            }}
                                        >
                                            {item.label}
                                        </ListItemText>
                                    </ListItemButton>
                                );
                            })}
                        </List>
                    </Drawer>

                    <Box
                        component="main"
                        sx={{
                            maxWidth: 1600,
                            mx: "auto",
                            px: { xs: 1.5, md: 2.5 },
                            py: 2.5,
                        }}
                    >
                        {children}
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}

function ProfileLink({
    href,
    icon,
    label,
    external,
    onClick,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    external?: boolean;
    onClick?: () => void;
}) {
    const props = external
        ? {
              component: "a" as const,
              href,
              target: "_blank",
              rel: "noopener noreferrer",
          }
        : { component: Link, href };
    return (
        <MenuItem
            {...props}
            onClick={onClick}
            sx={{
                py: 1,
                color: C.textDim,
                "&:hover": { bgcolor: "rgba(255,255,255,0.05)", color: C.text },
            }}
        >
            <ListItemIcon sx={{ color: "inherit", minWidth: 34 }}>
                {icon}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>
                {label}
            </ListItemText>
        </MenuItem>
    );
}

function Avatar({ user, size }: { user: ChromeUser; size: number }) {
    if (user.avatar) {
        return (
            <Box
                component="img"
                src={user.avatar}
                alt={user.name || user.email}
                referrerPolicy="no-referrer"
                sx={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: `1px solid ${C.border}`,
                }}
            />
        );
    }
    return (
        <Box
            sx={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: `linear-gradient(135deg, #ff8a5b 0%, ${C.accent} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#161228",
            }}
        >
            {user.email?.charAt(0).toUpperCase() || "A"}
        </Box>
    );
}
