"use client";

import {
    Apps,
    DarkModeOutlined,
    DevicesOther,
    LightModeOutlined,
    Logout,
    MenuBook,
    Person,
    PersonAddAlt,
    Receipt,
    Security,
    SwapHoriz,
    Webhook,
} from "@mui/icons-material";
import {
    AppBar,
    Box,
    CircularProgress,
    Divider,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Toolbar,
    Typography,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import BackgroundAurora from "../components/background-aurora";
import { useTheme as useAppTheme } from "../components/theme-provider";

// MUI runs alpha()/decomposeColor() on palette colors at style-compute time
// (e.g. a Button's hover background = alpha(palette.text.primary, …)). Those
// helpers can parse hex/rgb/rgba but NOT `var(--token)`, so the palette must
// hold literal colors. We mirror the globals.css tokens for each mode here and
// switch on the app theme; the sx-level `var()` usages elsewhere are fine since
// they're raw CSS and never pass through alpha().
const PALETTE = {
    light: {
        paper: "#ffffff",
        text: "#192837",
        textMuted: "rgba(25, 40, 55, 0.70)",
        textFaint: "rgba(25, 40, 55, 0.50)",
        divider: "rgba(25, 40, 55, 0.10)",
    },
    dark: {
        paper: "#181b22",
        text: "#f5f5f4",
        textMuted: "rgba(245, 245, 244, 0.70)",
        textFaint: "rgba(245, 245, 244, 0.50)",
        divider: "rgba(255, 255, 255, 0.10)",
    },
} as const;

const makeTheme = (mode: "light" | "dark") => {
    const c = PALETTE[mode];
    return createTheme({
        palette: {
            mode,
            primary: { main: "#ff7759" },
            background: {
                default: "transparent",
                paper: c.paper,
            },
            text: {
                primary: c.text,
                secondary: c.textMuted,
                disabled: c.textFaint,
            },
            divider: c.divider,
        },
        typography: {
            fontFamily: "var(--font-geist-sans), Arial, sans-serif",
        },
        components: {
            MuiCard: {
                styleOverrides: {
                    root: {
                        background: "var(--surface)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        boxShadow: "0 8px 32px 0 var(--overlay)",
                    },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: {
                        background: "var(--surface)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                    },
                },
            },
        },
    });
};

interface DashboardLayoutProps {
    children: React.ReactNode;
}

type SavedAccount = {
    id: string;
    email: string;
    displayName: string | null;
};

type AccountsResponse = {
    activeUserId: string | null;
    accounts: SavedAccount[];
};

const navItems = [
    { label: "OAuth Apps", icon: Apps, href: "/dashboard/oauth-apps" },
    { label: "Services", icon: DevicesOther, href: "/dashboard/services" },
    { label: "Profile", icon: Person, href: "/dashboard/profile" },
    { label: "Webhooks", icon: Webhook, href: "/dashboard/webhooks" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [userEmail, setUserEmail] = useState<string>("");
    const [displayName, setDisplayName] = useState<string>("");
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [activeUserId, setActiveUserId] = useState<string>("");
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
    const [authChecked, setAuthChecked] = useState(false);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const { theme: appTheme, toggle: toggleAppTheme } = useAppTheme();
    const muiTheme = useMemo(() => makeTheme(appTheme), [appTheme]);

    // Auth check. Uses window.location for redirects so router isn't
    // referenced inside the effect body — that way eslint-react-hooks can't
    // autofix `router` into the deps array (which loops because useRouter
    // returns a new ref on every render under Next 15.2 + React 19).
    useEffect(() => {
        fetch("/api/auth/me", { credentials: "include" })
            .then((res) => {
                if (res.ok) return res.json();
                window.location.assign("/login");
                return null;
            })
            .then((data: any) => {
                if (!data) return;
                if (!data.username) {
                    window.location.replace("/setup-name");
                    return;
                }
                // 2FA hard wall: users with ≥3 OAuth apps must have MFA
                // enabled to keep using the dashboard. `mfa_setup_required`
                // is set server-side in /api/auth/me. /dashboard/security
                // is the ONE page allowed past the wall — that's where
                // they enroll a factor and flip the flag. Without this
                // exception we'd infinite-loop the redirect.
                if (
                    data.mfa_setup_required &&
                    pathname !== "/dashboard/security"
                ) {
                    window.location.replace("/mfa/setup-required");
                    return;
                }
                if (data.email) setUserEmail(data.email);
                if (data.displayName) setDisplayName(data.displayName);
                if (data.avatar) setUserAvatar(data.avatar);
                fetch("/api/auth/accounts", {
                    credentials: "include",
                    cache: "no-store",
                })
                    .then(async (response) =>
                        response.ok
                            ? ((await response.json()) as AccountsResponse)
                            : null,
                    )
                    .then((accountData) => {
                        if (!accountData) return;
                        setActiveUserId(accountData.activeUserId || "");
                        setSavedAccounts(accountData.accounts);
                    })
                    .catch(() => {});
                setAuthChecked(true);
            })
            .catch(() => {
                window.location.assign("/login");
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    const handleLogout = async () => {
        setAnchorEl(null);
        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // silent
        }
        router.push("/");
    };

    const handleSwitchAccount = async (userId: string) => {
        setAnchorEl(null);
        const response = await fetch("/api/auth/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ userId }),
        });
        if (response.ok) window.location.reload();
    };

    const isActive = (href: string) => pathname.startsWith(href);

    if (!authChecked) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "var(--bg)",
                }}
            >
                <CircularProgress sx={{ color: "#ff7759" }} />
            </Box>
        );
    }

    return (
        <ThemeProvider theme={muiTheme}>
            <Box sx={{ position: "relative", minHeight: "100vh" }}>
                <BackgroundAurora variant="default" />
                <Box sx={{ position: "relative", zIndex: 1 }}>
                    {/* Top Navbar */}
                    <AppBar
                        position="sticky"
                        elevation={0}
                        sx={{
                            bgcolor:
                                appTheme === "dark"
                                    ? "rgba(15, 17, 23, 0.8)"
                                    : "rgba(242, 242, 238, 0.8)",
                            backdropFilter: "blur(16px)",
                            borderBottom: "1px solid var(--border)",
                        }}
                    >
                        <Toolbar
                            sx={{
                                maxWidth: "1400px",
                                width: "100%",
                                mx: "auto",
                                px: { xs: 2, md: 3 },
                            }}
                        >
                            {/* Logo + Brand */}
                            <Box
                                component={Link}
                                href="/dashboard/oauth-apps"
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    textDecoration: "none",
                                    mr: 4,
                                    flexShrink: 0,
                                }}
                            >
                                <Box
                                    component="img"
                                    src="/LOGO/logo.png"
                                    alt="Elixpo"
                                    sx={{
                                        height: 32,
                                        width: 32,
                                        borderRadius: "8px",
                                    }}
                                />
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "1.1rem",
                                        color: "var(--fg)",
                                        display: { xs: "none", sm: "block" },
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    Elixpo Accounts
                                </Typography>
                            </Box>
                            {/* Spacer */}

                            <Box sx={{ flexGrow: 1 }} />
                            {/* Nav Icons (right side) */}

                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    mr: 1,
                                }}
                            >
                                {navItems.map((item) => (
                                    <IconButton
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        title={item.label}
                                        sx={{
                                            color: isActive(item.href)
                                                ? "#ff7759"
                                                : "var(--fg-faint)",
                                            bgcolor: isActive(item.href)
                                                ? "rgba(255, 119, 89,0.1)"
                                                : "transparent",
                                            borderRadius: "8px",
                                            width: { xs: 38, lg: "auto" },
                                            height: 38,
                                            px: { xs: 0, lg: 1.25 },
                                            gap: { xs: 0, lg: 0.75 },
                                            transition: "all 0.2s ease",
                                            "&:hover": {
                                                bgcolor: isActive(item.href)
                                                    ? "rgba(255, 119, 89,0.15)"
                                                    : "var(--overlay)",
                                                color: isActive(item.href)
                                                    ? "#ff7759"
                                                    : "var(--fg-muted)",
                                            },
                                        }}
                                    >
                                        <item.icon
                                            sx={{ fontSize: "1.25rem" }}
                                        />
                                        <Typography
                                            component="span"
                                            sx={{
                                                display: {
                                                    xs: "none",
                                                    lg: "inline",
                                                },
                                                fontSize: "0.82rem",
                                                fontWeight: 650,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {item.label}
                                        </Typography>
                                    </IconButton>
                                ))}
                            </Box>
                            {/* User profile — name + email CTA (GitHub lives in the footer) */}
                            <Box
                                component="button"
                                onClick={(e) => setAnchorEl(e.currentTarget)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    cursor: "pointer",
                                    background: "transparent",
                                    border: "1px solid var(--border)",
                                    borderRadius: "10px",
                                    pl: 0.6,
                                    pr: { xs: 0.6, sm: 1.1 },
                                    py: 0.5,
                                    color: "inherit",
                                    font: "inherit",
                                    transition: "all 0.15s ease",
                                    "&:hover": {
                                        borderColor: "rgba(255,119,89,0.4)",
                                        bgcolor: "rgba(255,119,89,0.06)",
                                    },
                                }}
                            >
                                {userAvatar ? (
                                    <Box
                                        component="img"
                                        src={userAvatar}
                                        alt="Avatar"
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: "50%",
                                            border: "2px solid rgba(255, 119, 89,0.3)",
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : (
                                    <Box
                                        sx={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: "50%",
                                            background: "#ff7759",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "0.9rem",
                                            fontWeight: 700,
                                            color: "#fff",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {(displayName || userEmail)
                                            ?.charAt(0)
                                            .toUpperCase() || "E"}
                                    </Box>
                                )}
                                <Box
                                    sx={{
                                        display: { xs: "none", sm: "flex" },
                                        flexDirection: "column",
                                        alignItems: "flex-start",
                                        lineHeight: 1.15,
                                        minWidth: 0,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            color: "var(--fg)",
                                            maxWidth: 160,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {displayName || userEmail || "Account"}
                                    </Typography>
                                    {userEmail && (
                                        <Typography
                                            sx={{
                                                fontSize: "0.7rem",
                                                color: "var(--fg-faint)",
                                                maxWidth: 160,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {userEmail}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>

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
                                            bgcolor:
                                                appTheme === "dark"
                                                    ? "rgba(24, 27, 34, 0.95)"
                                                    : "rgba(255, 255, 255, 0.95)",
                                            backdropFilter: "blur(16px)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "12px",
                                            minWidth: 220,
                                            boxShadow:
                                                "0 8px 32px var(--overlay)",
                                        },
                                    },
                                }}
                            >
                                <Box sx={{ px: 2, py: 1.5 }}>
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontWeight: 600,
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        {displayName || "User"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.8rem",
                                        }}
                                    >
                                        {userEmail}
                                    </Typography>
                                </Box>
                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />
                                {savedAccounts
                                    .filter(
                                        (account) =>
                                            account.id !== activeUserId,
                                    )
                                    .map((account) => (
                                        <MenuItem
                                            key={account.id}
                                            onClick={() =>
                                                handleSwitchAccount(account.id)
                                            }
                                            sx={{
                                                py: 1.1,
                                                color: "var(--fg-muted)",
                                                "&:hover": {
                                                    bgcolor: "var(--overlay)",
                                                    color: "var(--fg)",
                                                },
                                            }}
                                        >
                                            <ListItemIcon
                                                sx={{
                                                    color: "inherit",
                                                    minWidth: 36,
                                                }}
                                            >
                                                <SwapHoriz fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={
                                                    account.displayName ||
                                                    account.email
                                                }
                                                secondary={account.email}
                                                primaryTypographyProps={{
                                                    fontSize: "0.875rem",
                                                }}
                                                secondaryTypographyProps={{
                                                    fontSize: "0.72rem",
                                                    color: "var(--fg-faint)",
                                                }}
                                            />
                                        </MenuItem>
                                    ))}
                                <MenuItem
                                    component={Link}
                                    href={`/login?add_account=1&next=${encodeURIComponent(pathname)}`}
                                    onClick={() => setAnchorEl(null)}
                                    sx={{
                                        py: 1.1,
                                        color: "#ff7759",
                                        "&:hover": {
                                            bgcolor: "rgba(255,119,89,0.08)",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        <PersonAddAlt fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Add another account
                                    </ListItemText>
                                </MenuItem>
                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />
                                {/* Account group */}
                                {[
                                    {
                                        href: "/dashboard/profile",
                                        icon: <Person fontSize="small" />,
                                        label: "Profile",
                                    },
                                    {
                                        href: "/dashboard/security",
                                        icon: <Security fontSize="small" />,
                                        label: "Security & 2FA",
                                    },
                                    {
                                        href: "/dashboard/subscriptions",
                                        icon: <Receipt fontSize="small" />,
                                        label: "Subscriptions",
                                    },
                                    {
                                        href: "/dashboard/services",
                                        icon: <DevicesOther fontSize="small" />,
                                        label: "Connected services",
                                    },
                                ].map((item) => (
                                    <MenuItem
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        onClick={() => setAnchorEl(null)}
                                        sx={{
                                            py: 1.25,
                                            color: "var(--fg-muted)",
                                            "&:hover": {
                                                bgcolor: "var(--overlay)",
                                                color: "var(--fg)",
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                color: "inherit",
                                                minWidth: 36,
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primaryTypographyProps={{
                                                fontSize: "0.875rem",
                                            }}
                                        >
                                            {item.label}
                                        </ListItemText>
                                    </MenuItem>
                                ))}

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                {/* Developer group — opens in same tab for
                                    internal pages, new tab for the external
                                    docs link. */}
                                {[
                                    {
                                        href: "/dashboard/oauth-apps",
                                        icon: <Apps fontSize="small" />,
                                        label: "OAuth apps",
                                        external: false,
                                    },
                                    {
                                        href: "/dashboard/webhooks",
                                        icon: <Webhook fontSize="small" />,
                                        label: "Webhooks",
                                        external: false,
                                    },
                                    {
                                        href: "/docs",
                                        icon: <MenuBook fontSize="small" />,
                                        label: "API docs",
                                        external: false,
                                    },
                                ].map((item) => (
                                    <MenuItem
                                        key={item.href}
                                        component={Link}
                                        href={item.href}
                                        onClick={() => setAnchorEl(null)}
                                        sx={{
                                            py: 1.25,
                                            color: "var(--fg-muted)",
                                            "&:hover": {
                                                bgcolor: "var(--overlay)",
                                                color: "var(--fg)",
                                            },
                                        }}
                                    >
                                        <ListItemIcon
                                            sx={{
                                                color: "inherit",
                                                minWidth: 36,
                                            }}
                                        >
                                            {item.icon}
                                        </ListItemIcon>
                                        <ListItemText
                                            primaryTypographyProps={{
                                                fontSize: "0.875rem",
                                            }}
                                        >
                                            {item.label}
                                        </ListItemText>
                                    </MenuItem>
                                ))}

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                {/* Light / dark theme preference */}
                                <MenuItem
                                    onClick={toggleAppTheme}
                                    sx={{
                                        py: 1.25,
                                        color: "var(--fg-muted)",
                                        "&:hover": {
                                            bgcolor: "var(--overlay)",
                                            color: "var(--fg)",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        {appTheme === "dark" ? (
                                            <LightModeOutlined fontSize="small" />
                                        ) : (
                                            <DarkModeOutlined fontSize="small" />
                                        )}
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        {appTheme === "dark"
                                            ? "Light mode"
                                            : "Dark mode"}
                                    </ListItemText>
                                </MenuItem>

                                <Divider
                                    sx={{
                                        borderColor: "var(--border)",
                                    }}
                                />

                                <MenuItem
                                    onClick={handleLogout}
                                    sx={{
                                        py: 1.25,
                                        color: "var(--fg-faint)",
                                        "&:hover": {
                                            bgcolor: "rgba(239, 68, 68, 0.08)",
                                            color: "#b91c1c",
                                        },
                                    }}
                                >
                                    <ListItemIcon
                                        sx={{ color: "inherit", minWidth: 36 }}
                                    >
                                        <Logout fontSize="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primaryTypographyProps={{
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Sign out
                                    </ListItemText>
                                </MenuItem>
                            </Menu>
                        </Toolbar>
                    </AppBar>
                    {/* Page Content */}

                    <Box
                        component="main"
                        sx={{
                            maxWidth: "1400px",
                            mx: "auto",
                            px: { xs: 2, md: 3 },
                            py: 3,
                        }}
                    >
                        {children}
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}
