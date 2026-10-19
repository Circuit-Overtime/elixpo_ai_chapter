"use client";

import type { SvgIconComponent } from "@mui/icons-material";
import DescriptionIcon from "@mui/icons-material/Description";
import DnsIcon from "@mui/icons-material/Dns";
import HistoryIcon from "@mui/icons-material/History";
import InventoryIcon from "@mui/icons-material/Inventory2";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import WebhookIcon from "@mui/icons-material/Webhook";
import { Box, Stack } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ACCENT = "#ff7759"; // Coral

export interface NavItem {
    label: string;
    href: string;
    icon: SvgIconComponent;
}

// Single-word labels for a compact top navigation. Settings + Billing live in
// the profile menu, not here.
export const NAV_ITEMS: NavItem[] = [
    { label: "Overview", href: "/dashboard", icon: SpaceDashboardIcon },
    { label: "Products", href: "/dashboard/products", icon: InventoryIcon },
    { label: "Templates", href: "/dashboard/templates", icon: DescriptionIcon },
    { label: "Senders", href: "/dashboard/senders", icon: DnsIcon },
    { label: "Webhooks", href: "/dashboard/webhooks", icon: WebhookIcon },
    { label: "Logs", href: "/dashboard/logs", icon: HistoryIcon },
    { label: "Docs", href: "/docs", icon: MenuBookIcon },
];

export function isActive(pathname: string, href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
}

/** Renders the dashboard nav links horizontally (top bar) or vertically (mobile drawer). */
export function DashboardNavLinks({
    orientation = "horizontal",
    onNavigate,
}: {
    orientation?: "horizontal" | "vertical";
    onNavigate?: () => void;
}) {
    const pathname = usePathname() || "/dashboard";
    const horizontal = orientation === "horizontal";

    return (
        <Stack
            direction={horizontal ? "row" : "column"}
            spacing={horizontal ? 0.4 : 0.4}
            sx={{ alignItems: horizontal ? "center" : "stretch" }}
        >
            {NAV_ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                    <Box
                        key={item.href}
                        component={Link}
                        href={item.href}
                        onClick={onNavigate}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: horizontal ? 0.8 : 1.3,
                            px: horizontal ? 1.35 : 1.5,
                            py: horizontal ? 0.8 : 1.05,
                            borderRadius: "10px",
                            textDecoration: "none",
                            fontSize: horizontal ? "0.86rem" : "0.9rem",
                            fontWeight: active ? 600 : 500,
                            whiteSpace: "nowrap",
                            color: active ? "var(--accent)" : "var(--fg-muted)",
                            background: active ? "var(--accent-tint)" : "transparent",
                            border: `1px solid ${active ? "var(--accent-border)" : "transparent"}`,
                            transition: "all 0.15s ease",
                            "&:hover": {
                                color: active ? "var(--accent)" : "var(--fg)",
                                background: active ? "var(--accent-tint-strong)" : "var(--overlay)",
                            },
                        }}
                    >
                        <Icon sx={{ fontSize: 19, color: active ? ACCENT : "var(--fg-muted)" }} />
                        {item.label}
                    </Box>
                );
            })}
        </Stack>
    );
}
