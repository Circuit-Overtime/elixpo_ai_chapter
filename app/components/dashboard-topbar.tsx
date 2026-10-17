"use client";

import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import GroupsIcon from "@mui/icons-material/Groups";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import {
    Avatar,
    Box,
    Chip,
    Divider,
    Drawer,
    IconButton,
    Menu,
    MenuItem,
    Stack,
    Typography,
} from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { DashboardNavLinks } from "./dashboard-nav";
import ThemeToggle from "./theme-toggle";

interface WorkspaceOption {
    tenantId: string;
    name: string;
    slug: string | null;
    role: string;
    active: boolean;
    kind: "personal" | "shared";
}

const BORDER = "var(--border)";
const ACCENT = "#ff7759";

const MENU_ITEM_SX = {
    fontSize: "0.86rem",
    py: 1.0,
    gap: 1.3,
    color: "var(--fg)",
    "&:hover": { background: "var(--overlay)" },
} as const;
const MENU_ICON_SX = { fontSize: 18, color: "var(--fg-muted)" } as const;

export interface DashboardUser {
    name: string;
    email: string;
    avatar: string | null;
    tenantId: string;
}

function initials(user: DashboardUser): string {
    return (user.name || user.email || "?").charAt(0).toUpperCase();
}

function Brand() {
    return (
        <Box
            component={Link}
            href="/dashboard"
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.1,
                textDecoration: "none",
                color: "inherit",
            }}
        >
            <Box
                component="img"
                src="/mark.png"
                alt="mail.elixpo"
                sx={{ height: 28, width: 28, borderRadius: "8px", display: "block" }}
            />
            <Typography
                sx={{
                    fontWeight: 700,
                    fontSize: "1.02rem",
                    color: "var(--fg)",
                    letterSpacing: "-0.01em",
                    display: { xs: "none", sm: "block" },
                }}
            >
                Elixpo
                <Box component="span" sx={{ color: ACCENT }}>
                    {" "}
                    Mails
                </Box>
            </Typography>
        </Box>
    );
}

export default function DashboardTopbar({ user }: { user: DashboardUser }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const menuOpen = Boolean(anchorEl);
    const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
    const [switching, setSwitching] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me")
            .then((r) => r.json())
            .then((raw) => {
                const data = raw as { workspaces?: WorkspaceOption[] };
                if (!cancelled && Array.isArray(data?.workspaces)) setWorkspaces(data.workspaces);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    async function switchWorkspace(tenantId: string) {
        if (switching) return;
        setSwitching(true);
        try {
            const res = await fetch("/api/workspace/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId }),
            });
            if (res.ok) {
                window.location.href = "/dashboard";
                return;
            }
        } catch {
            // fall through
        }
        setSwitching(false);
    }

    const activeWorkspace = workspaces.find((w) => w.active);
    // The workspace the user administers — prefer the active one if they're an
    // admin/owner there, else the first they administer. Shown as a prominent
    // full-width chip in the profile dropdown.
    const isAdminRole = (r: string) => r === "owner" || r === "admin";
    const adminWorkspace =
        (activeWorkspace && isAdminRole(activeWorkspace.role) && activeWorkspace) ||
        workspaces.find((w) => isAdminRole(w.role)) ||
        null;

    return (
        <>
            <Box
                component="header"
                sx={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1050,
                    height: 60,
                    display: "flex",
                    alignItems: "center",
                    gap: { xs: 1, md: 2 },
                    px: { xs: 2, md: 3 },
                    borderBottom: `1px solid ${BORDER}`,
                    background: "var(--topbar-bg)",
                    backdropFilter: "blur(20px)",
                }}
            >
                <IconButton
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                    sx={{
                        display: { xs: "inline-flex", md: "none" },
                        color: "var(--fg-muted)",
                    }}
                >
                    <MenuIcon />
                </IconButton>

                <Brand />

                {/* Horizontal nav (desktop) */}
                <Box sx={{ display: { xs: "none", md: "flex" }, ml: 1.5 }}>
                    <DashboardNavLinks orientation="horizontal" />
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                <ThemeToggle />

                {activeWorkspace && (
                    <Chip
                        icon={<GroupsIcon sx={{ fontSize: "16px !important" }} />}
                        label={`${activeWorkspace.kind === "shared" ? "Shared" : "Personal"} · ${activeWorkspace.name}`}
                        size="small"
                        sx={{
                            display: { xs: "none", md: "inline-flex" },
                            maxWidth: 220,
                            color:
                                activeWorkspace.kind === "shared"
                                    ? "var(--accent)"
                                    : "var(--fg-muted)",
                            bgcolor:
                                activeWorkspace.kind === "shared"
                                    ? "var(--accent-tint)"
                                    : "var(--overlay)",
                            border: `1px solid ${activeWorkspace.kind === "shared" ? "var(--accent-border)" : BORDER}`,
                            fontWeight: 700,
                            "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                        }}
                    />
                )}

                {/* Profile menu */}
                <Box
                    component="button"
                    onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
                    aria-haspopup="true"
                    aria-expanded={menuOpen ? "true" : undefined}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        cursor: "pointer",
                        background: "transparent",
                        border: `1px solid ${menuOpen ? "var(--accent)" : BORDER}`,
                        borderRadius: "10px",
                        pl: 0.6,
                        pr: { xs: 0.6, sm: 1 },
                        py: 0.5,
                        color: "inherit",
                        font: "inherit",
                        transition: "all 0.15s ease",
                        "&:hover": {
                            borderColor: "var(--accent)",
                            background: "var(--accent-tint)",
                        },
                    }}
                >
                    <Avatar
                        src={user.avatar || undefined}
                        slotProps={{ img: { referrerPolicy: "no-referrer" } }}
                        sx={{
                            width: 28,
                            height: 28,
                            fontSize: "0.85rem",
                            bgcolor: "var(--accent)",
                        }}
                    >
                        {initials(user)}
                    </Avatar>
                    <Stack
                        sx={{
                            display: { xs: "none", sm: "flex" },
                            alignItems: "flex-start",
                            lineHeight: 1.1,
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: "0.82rem",
                                fontWeight: 600,
                                color: "var(--fg)",
                                maxWidth: 150,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {user.name || user.email}
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                color: "var(--fg-faint)",
                                maxWidth: 150,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {user.email}
                        </Typography>
                    </Stack>
                    <SwapVertIcon
                        sx={{
                            fontSize: 19,
                            color: "var(--fg-muted)",
                            display: { xs: "none", sm: "block" },
                        }}
                    />
                </Box>

                <Menu
                    anchorEl={anchorEl}
                    open={menuOpen}
                    onClose={() => setAnchorEl(null)}
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    transformOrigin={{ vertical: "top", horizontal: "right" }}
                    slotProps={{
                        paper: {
                            sx: {
                                mt: 1,
                                minWidth: 248,
                                background: "var(--menu-surface)",
                                border: `1px solid ${BORDER}`,
                                borderRadius: "12px",
                                color: "var(--fg)",
                                boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                            },
                        },
                    }}
                >
                    {/* Identity header */}
                    <Box sx={{ px: 2, pt: 1.6, pb: 1.3 }}>
                        <Stack direction="row" spacing={1.2} alignItems="center">
                            <Avatar
                                src={user.avatar || undefined}
                                slotProps={{ img: { referrerPolicy: "no-referrer" } }}
                                sx={{
                                    width: 38,
                                    height: 38,
                                    fontSize: "1rem",
                                    bgcolor: "var(--accent)",
                                }}
                            >
                                {initials(user)}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography
                                    sx={{
                                        fontSize: "0.9rem",
                                        fontWeight: 700,
                                        color: "var(--fg)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {user.name || user.email}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: "0.76rem",
                                        color: "var(--fg-muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {user.email}
                                </Typography>
                            </Box>
                        </Stack>
                        <Stack spacing={0.8} alignItems="stretch" sx={{ mt: 1.3 }}>
                            <Chip
                                label="Starter plan"
                                size="small"
                                sx={{
                                    height: 22,
                                    width: "100%",
                                    justifyContent: "flex-start",
                                    fontSize: "0.66rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.02em",
                                    color: "var(--accent)",
                                    bgcolor: "var(--accent-tint)",
                                    border: "1px solid var(--accent-border)",
                                }}
                            />
                            {adminWorkspace ? (
                                // The workspace the user administers — a big,
                                // standalone, full-width chip (name + role).
                                <Chip
                                    icon={
                                        <GroupsIcon
                                            sx={{ fontSize: 18, color: "var(--accent) !important" }}
                                        />
                                    }
                                    label={
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                lineHeight: 1.15,
                                                minWidth: 0,
                                            }}
                                        >
                                            <Box
                                                component="span"
                                                sx={{
                                                    fontSize: "0.82rem",
                                                    fontWeight: 800,
                                                    color: "var(--accent)",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {adminWorkspace.name}
                                            </Box>
                                            <Box
                                                component="span"
                                                sx={{
                                                    fontSize: "0.58rem",
                                                    fontWeight: 700,
                                                    letterSpacing: "0.07em",
                                                    textTransform: "uppercase",
                                                    color: "var(--accent)",
                                                    opacity: 0.75,
                                                }}
                                            >
                                                {adminWorkspace.role === "owner"
                                                    ? "Owner"
                                                    : "Admin"}
                                            </Box>
                                        </Box>
                                    }
                                    sx={{
                                        width: "100%",
                                        height: "auto",
                                        py: 0.7,
                                        justifyContent: "flex-start",
                                        borderRadius: "10px",
                                        bgcolor: "var(--accent-tint)",
                                        border: "1px solid var(--accent-border)",
                                        "& .MuiChip-icon": { ml: 1, mr: 0.2 },
                                        "& .MuiChip-label": {
                                            flex: 1,
                                            minWidth: 0,
                                            px: 0.8,
                                        },
                                    }}
                                />
                            ) : (
                                <Chip
                                    size="small"
                                    label={`Workspace · ${activeWorkspace?.name || user.tenantId}`}
                                    sx={{
                                        height: 22,
                                        width: "100%",
                                        justifyContent: "flex-start",
                                        fontSize: "0.66rem",
                                        fontWeight: 600,
                                        color: "var(--fg-muted)",
                                        bgcolor: "var(--overlay)",
                                        border: "1px solid var(--border)",
                                        "& .MuiChip-label": {
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        },
                                    }}
                                />
                            )}
                        </Stack>
                    </Box>
                    <Divider sx={{ borderColor: BORDER }} />

                    {/* Workspace switcher */}
                    {workspaces.length > 0 && (
                        <>
                            <Typography
                                sx={{
                                    px: 2,
                                    pt: 1.2,
                                    pb: 0.4,
                                    fontSize: "0.6rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    color: "var(--fg-faint)",
                                }}
                            >
                                Switch account or workspace
                            </Typography>
                            {workspaces.map((w) => (
                                <MenuItem
                                    key={w.tenantId}
                                    disabled={switching}
                                    onClick={() => {
                                        if (w.active) {
                                            setAnchorEl(null);
                                        } else {
                                            switchWorkspace(w.tenantId);
                                        }
                                    }}
                                    sx={MENU_ITEM_SX}
                                >
                                    <GroupsIcon sx={MENU_ICON_SX} />
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Typography
                                            sx={{
                                                fontSize: "0.84rem",
                                                color: "var(--fg)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {w.name}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                fontSize: "0.66rem",
                                                color: "var(--fg-faint)",
                                                textTransform: "capitalize",
                                            }}
                                        >
                                            {w.kind === "personal"
                                                ? "Personal account"
                                                : `Shared workspace · ${w.role}`}
                                        </Typography>
                                    </Box>
                                    {w.active && <CheckIcon sx={{ fontSize: 16, color: ACCENT }} />}
                                </MenuItem>
                            ))}
                            <Divider sx={{ borderColor: BORDER }} />
                        </>
                    )}

                    {/* Account */}
                    <MenuItem
                        component={Link}
                        href="/dashboard"
                        onClick={() => setAnchorEl(null)}
                        sx={MENU_ITEM_SX}
                    >
                        <SpaceDashboardIcon sx={MENU_ICON_SX} />
                        Overview
                    </MenuItem>
                    <MenuItem
                        component={Link}
                        href={
                            activeWorkspace?.slug
                                ? `/workspace/${activeWorkspace.slug}`
                                : "/workspace/new"
                        }
                        onClick={() => setAnchorEl(null)}
                        sx={MENU_ITEM_SX}
                    >
                        <SettingsOutlinedIcon sx={MENU_ICON_SX} />
                        {activeWorkspace ? "Manage workspace" : "Create workspace"}
                    </MenuItem>
                    {!activeWorkspace && (
                        <MenuItem component={Link} href="/workspace/new" sx={MENU_ITEM_SX}>
                            <AddBusinessIcon sx={MENU_ICON_SX} />
                            Create workspace
                        </MenuItem>
                    )}
                    <MenuItem
                        component={Link}
                        href="/dashboard/billing"
                        onClick={() => setAnchorEl(null)}
                        sx={MENU_ITEM_SX}
                    >
                        <CreditCardIcon sx={MENU_ICON_SX} />
                        Billing &amp; plan
                    </MenuItem>
                    <Divider sx={{ borderColor: BORDER }} />

                    {/* Resources */}
                    <MenuItem
                        component={Link}
                        href="/docs"
                        onClick={() => setAnchorEl(null)}
                        sx={MENU_ITEM_SX}
                    >
                        <MenuBookIcon sx={MENU_ICON_SX} />
                        Documentation
                    </MenuItem>
                    <MenuItem component="a" href="mailto:hello@elixpo.com" sx={MENU_ITEM_SX}>
                        <SupportAgentIcon sx={MENU_ICON_SX} />
                        Contact support
                    </MenuItem>
                    <MenuItem
                        component={Link}
                        href="/"
                        onClick={() => setAnchorEl(null)}
                        sx={MENU_ITEM_SX}
                    >
                        <OpenInNewIcon sx={MENU_ICON_SX} />
                        Marketing site
                    </MenuItem>
                    <Divider sx={{ borderColor: BORDER }} />

                    {/* Session */}
                    <MenuItem
                        component="a"
                        href="/api/auth/logout"
                        sx={{
                            fontSize: "0.86rem",
                            py: 1.0,
                            gap: 1.3,
                            color: "var(--danger)",
                            "&:hover": {
                                background: "rgba(239,68,68,0.08)",
                                color: "var(--danger)",
                            },
                        }}
                    >
                        <LogoutIcon sx={{ fontSize: 18 }} />
                        Sign out
                    </MenuItem>
                </Menu>
            </Box>

            {/* Mobile nav drawer */}
            <Drawer
                anchor="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                ModalProps={{ keepMounted: true }}
                sx={{ display: { xs: "block", md: "none" } }}
                PaperProps={{
                    sx: {
                        width: 264,
                        px: 1.5,
                        py: 2,
                        background: "var(--drawer-bg)",
                        borderRight: `1px solid ${BORDER}`,
                        color: "var(--fg)",
                    },
                }}
            >
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ mb: 2.5, px: 0.5 }}
                >
                    <Brand />
                    <IconButton
                        onClick={() => setMobileOpen(false)}
                        sx={{ color: "var(--fg-muted)" }}
                        aria-label="Close menu"
                    >
                        <CloseIcon />
                    </IconButton>
                </Stack>
                <DashboardNavLinks orientation="vertical" onNavigate={() => setMobileOpen(false)} />
            </Drawer>
        </>
    );
}
