export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { requireDashboardSession } from "@/lib/dashboard-session";
import { deliveryStats, listDeliveries } from "@/lib/deliveries";
import { listProductsWithCounts } from "@/lib/products";
import { listSenders } from "@/lib/senders";
import { listTemplates } from "@/lib/templates";
import { listWebhooks } from "@/lib/webhooks";
import type { SvgIconComponent } from "@mui/icons-material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import DescriptionIcon from "@mui/icons-material/Description";
import DnsIcon from "@mui/icons-material/Dns";
import HistoryIcon from "@mui/icons-material/History";
import InsightsIcon from "@mui/icons-material/Insights";
import InventoryIcon from "@mui/icons-material/Inventory2";
import SendIcon from "@mui/icons-material/Send";
import WebhookIcon from "@mui/icons-material/Webhook";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { PRIMARY_BTN } from "../components/dashboard-ui";
import { GlassCard } from "../components/glass-card";

const ACCENT = "#ff7759";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const BORDER = "var(--border)";

interface Snapshot {
    senders: number;
    products: number;
    templates: number;
    webhooks: number;
    sentThisMonth: number;
    deliverability: string;
    recent: { to: string; status: string; template: string | null; queued_at: string }[];
}

async function loadSnapshot(tenantId: string): Promise<Snapshot> {
    const empty: Snapshot = {
        senders: 0,
        products: 0,
        templates: 0,
        webhooks: 0,
        sentThisMonth: 0,
        deliverability: "—",
        recent: [],
    };
    try {
        const db = await getDatabase();
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const monthStr = monthStart.toISOString().replace("T", " ").slice(0, 19);

        const [senders, products, templates, webhooks, stats, recent, monthRow] = await Promise.all(
            [
                listSenders(db, tenantId),
                listProductsWithCounts(db, tenantId),
                listTemplates(db, tenantId),
                listWebhooks(db, tenantId),
                deliveryStats(db, tenantId),
                listDeliveries(db, tenantId, { limit: 5 }),
                db
                    .prepare(
                        "SELECT COUNT(*) AS n FROM deliveries WHERE tenant_id = ? AND status = 'sent' AND queued_at >= ?",
                    )
                    .bind(tenantId, monthStr)
                    .first(),
            ],
        );

        const total = stats.total;
        return {
            senders: senders.length,
            products: products.length,
            templates: templates.length,
            webhooks: webhooks.length,
            sentThisMonth: Number((monthRow as { n: number } | null)?.n) || 0,
            deliverability: total > 0 ? `${Math.round((stats.sent / total) * 100)}%` : "—",
            recent: recent.map((d) => ({
                to: d.to_email,
                status: d.status,
                template: d.template_name,
                queued_at: d.queued_at,
            })),
        };
    } catch {
        return empty;
    }
}

function relativeTime(s: string | null): string {
    if (!s) return "";
    const t = Date.parse(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
    if (Number.isNaN(t)) return "";
    const d = Math.floor((Date.now() - t) / 1000);
    if (d < 60) return "just now";
    if (d < 3600) return `${Math.floor(d / 60)}m ago`;
    if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
    return `${Math.floor(d / 86400)}d ago`;
}

function statusColor(s: string): string {
    if (s === "sent") return "#34d399";
    if (s === "failed") return "#f87171";
    if (s === "suppressed") return "#94a3b8";
    return "#fbbf24";
}

export default async function OverviewPage() {
    const session = await requireDashboardSession();
    const name = session.name || session.email;
    const snap = await loadSnapshot(session.tenantId);

    const stats = [
        { label: "Products", value: String(snap.products), icon: InventoryIcon, accent: "#ff7759" },
        {
            label: "Templates",
            value: String(snap.templates),
            icon: DescriptionIcon,
            accent: "#86efac",
        },
        {
            label: "Sends this month",
            value: String(snap.sentThisMonth),
            icon: SendIcon,
            accent: "#1863dc",
        },
        {
            label: "Deliverability",
            value: snap.deliverability,
            icon: InsightsIcon,
            accent: "#fbbf24",
        },
    ];

    const steps = [
        {
            icon: DnsIcon,
            title: "Connect a sender",
            body: "Add the mailbox you'll send from — email + app password, encrypted at rest.",
            cta: "Add sender",
            href: "/dashboard/senders",
            accent: "#ff7759",
            done: snap.senders > 0,
        },
        {
            icon: InventoryIcon,
            title: "Create a product",
            body: "Group your templates under a product with its own client ID and shared secret.",
            cta: "New product",
            href: "/dashboard/products",
            accent: "#86efac",
            done: snap.products > 0,
        },
        {
            icon: DescriptionIcon,
            title: "Design a template",
            body: "Compose in the visual editor with {{variables}} and a live preview.",
            cta: "Create template",
            href: "/dashboard/templates",
            accent: "#1863dc",
            done: snap.templates > 0,
        },
        {
            icon: WebhookIcon,
            title: "Add a webhook & send",
            body: "Wire a named, HMAC-signed webhook to a template and trigger your first send.",
            cta: "Add webhook",
            href: "/dashboard/webhooks",
            accent: "#fbbf24",
            done: snap.webhooks > 0,
        },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const allDone = doneCount === steps.length;

    return (
        <Box>
            {/* Greeting */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: { xs: 3.5, md: 4.5 } }}
            >
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: "1.7rem", md: "2.1rem" },
                            letterSpacing: "-0.02em",
                            color: TEXT,
                        }}
                    >
                        Welcome back, {name}
                    </Typography>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.95rem", mt: 0.5 }}>
                        Your transactional email workspace. Connect a sender, create a product, and
                        start sending.
                    </Typography>
                </Box>
                <Stack spacing={0.6} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
                    <Typography
                        sx={{
                            fontSize: "0.66rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--fg-faint)",
                            fontWeight: 700,
                        }}
                    >
                        Tenant
                    </Typography>
                    <Chip
                        label={session.tenantId}
                        sx={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.76rem",
                            bgcolor: "rgba(255, 119, 89, 0.12)",
                            color: "#ffad9b",
                            border: "1px solid rgba(255, 119, 89, 0.3)",
                        }}
                    />
                </Stack>
            </Stack>

            {/* Stat tiles */}
            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
                    mb: { xs: 3, md: 4 },
                }}
            >
                {stats.map((s) => (
                    <GlassCard key={s.label} sx={{ p: { xs: 2, md: 2.4 } }}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="flex-start"
                        >
                            <Box
                                sx={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: "11px",
                                    display: "grid",
                                    placeItems: "center",
                                    color: s.accent,
                                    background: `${s.accent}14`,
                                    border: `1px solid ${s.accent}33`,
                                }}
                            >
                                <s.icon sx={{ fontSize: 20 }} />
                            </Box>
                        </Stack>
                        <Typography
                            sx={{
                                fontWeight: 800,
                                fontSize: { xs: "1.6rem", md: "1.9rem" },
                                color: TEXT,
                                mt: 1.6,
                                lineHeight: 1,
                            }}
                        >
                            {s.value}
                        </Typography>
                        <Typography sx={{ color: TEXT_55, fontSize: "0.82rem", mt: 0.6 }}>
                            {s.label}
                        </Typography>
                    </GlassCard>
                ))}
            </Box>

            {/* Main grid: quickstart + recent activity */}
            <Box
                sx={{
                    display: "grid",
                    gap: 2.5,
                    gridTemplateColumns: { xs: "1fr", lg: "1.55fr 1fr" },
                    alignItems: "start",
                }}
            >
                {/* Get started checklist */}
                <GlassCard>
                    <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: TEXT }}>
                            {allDone ? "You're all set" : "Get started"}
                        </Typography>
                        <Chip
                            label={`${doneCount}/${steps.length} done`}
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: "0.66rem",
                                fontWeight: 700,
                                color: allDone ? "#86efac" : "#ffad9b",
                                bgcolor: allDone
                                    ? "rgba(52,211,153,0.12)"
                                    : "rgba(255, 119, 89, 0.12)",
                                border: `1px solid ${allDone ? "rgba(52,211,153,0.3)" : "rgba(255, 119, 89, 0.3)"}`,
                            }}
                        />
                    </Stack>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.9rem", mb: 2.5 }}>
                        {allDone
                            ? "Your workspace is wired up end-to-end. Trigger webhooks to start sending."
                            : "Set up your workspace and trigger your first transactional send."}
                    </Typography>

                    <Stack spacing={1.4}>
                        {steps.map((step, i) => (
                            <Box
                                key={step.title}
                                sx={{
                                    display: "flex",
                                    alignItems: { xs: "flex-start", sm: "center" },
                                    gap: 1.8,
                                    p: 1.8,
                                    borderRadius: "12px",
                                    border: `1px solid ${step.done ? "rgba(52,211,153,0.22)" : BORDER}`,
                                    background: step.done
                                        ? "rgba(52,211,153,0.05)"
                                        : "var(--overlay)",
                                    flexDirection: { xs: "column", sm: "row" },
                                }}
                            >
                                <Box sx={{ position: "relative", flexShrink: 0 }}>
                                    <Box
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: "12px",
                                            display: "grid",
                                            placeItems: "center",
                                            color: step.done ? "#34d399" : step.accent,
                                            background: step.done
                                                ? "rgba(52,211,153,0.14)"
                                                : `${step.accent}14`,
                                            border: `1px solid ${step.done ? "rgba(52,211,153,0.4)" : `${step.accent}40`}`,
                                        }}
                                    >
                                        <step.icon sx={{ fontSize: 22 }} />
                                    </Box>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            top: -6,
                                            right: -6,
                                            width: 20,
                                            height: 20,
                                            borderRadius: "50%",
                                            display: "grid",
                                            placeItems: "center",
                                            fontSize: "0.66rem",
                                            fontWeight: 800,
                                            color: "var(--bg)",
                                            background: step.done ? "#34d399" : step.accent,
                                        }}
                                    >
                                        {step.done ? <CheckIcon sx={{ fontSize: 13 }} /> : i + 1}
                                    </Box>
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <Typography
                                        sx={{ fontWeight: 700, fontSize: "0.96rem", color: TEXT }}
                                    >
                                        {step.title}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: TEXT_55,
                                            fontSize: "0.85rem",
                                            lineHeight: 1.55,
                                        }}
                                    >
                                        {step.body}
                                    </Typography>
                                </Box>
                                <Button
                                    component={Link}
                                    href={step.href}
                                    endIcon={
                                        !step.done ? (
                                            <ArrowForwardIcon
                                                sx={{ fontSize: "1rem !important" }}
                                            />
                                        ) : undefined
                                    }
                                    sx={{
                                        flexShrink: 0,
                                        textTransform: "none",
                                        fontWeight: 600,
                                        fontSize: "0.82rem",
                                        color: step.done ? "#86efac" : TEXT,
                                        px: 1.6,
                                        py: 0.7,
                                        borderRadius: "10px",
                                        border: `1px solid ${step.done ? "rgba(52,211,153,0.3)" : BORDER}`,
                                        whiteSpace: "nowrap",
                                        "&:hover": {
                                            borderColor: "var(--accent-border)",
                                            background: "var(--overlay)",
                                        },
                                    }}
                                >
                                    {step.done ? "Manage" : step.cta}
                                </Button>
                            </Box>
                        ))}
                    </Stack>
                </GlassCard>

                {/* Recent activity */}
                <GlassCard sx={{ height: "100%" }}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ mb: 0.5 }}
                    >
                        <Typography sx={{ fontWeight: 700, fontSize: "1.1rem", color: TEXT }}>
                            Recent activity
                        </Typography>
                        <Button
                            component={Link}
                            href="/dashboard/logs"
                            sx={{
                                textTransform: "none",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                color: ACCENT,
                                minWidth: 0,
                                p: 0.5,
                                "&:hover": {
                                    background: "transparent",
                                    textDecoration: "underline",
                                },
                            }}
                        >
                            View all
                        </Button>
                    </Stack>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.88rem", mb: 2.5 }}>
                        Delivery events appear here as you send.
                    </Typography>

                    {snap.recent.length > 0 ? (
                        <Stack divider={<Box sx={{ borderBottom: `1px solid ${BORDER}` }} />}>
                            {snap.recent.map((d, i) => (
                                <Stack
                                    key={`${d.to}-${i}`}
                                    direction="row"
                                    alignItems="center"
                                    spacing={1.2}
                                    sx={{ py: 1.1 }}
                                >
                                    <Box
                                        sx={{
                                            width: 9,
                                            height: 9,
                                            borderRadius: "50%",
                                            flexShrink: 0,
                                            background: statusColor(d.status),
                                        }}
                                    />
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography
                                            sx={{
                                                color: TEXT,
                                                fontSize: "0.86rem",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {d.to}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: TEXT_55,
                                                fontSize: "0.76rem",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {d.template || "—"} · {d.status}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.74rem",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {relativeTime(d.queued_at)}
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    ) : (
                        <Stack
                            alignItems="center"
                            textAlign="center"
                            spacing={1.6}
                            sx={{ py: { xs: 4, md: 5 } }}
                        >
                            <Box
                                sx={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: "16px",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "var(--fg-faint)",
                                    background: "var(--overlay)",
                                    border: `1px solid ${BORDER}`,
                                }}
                            >
                                <HistoryIcon sx={{ fontSize: 28 }} />
                            </Box>
                            <Box>
                                <Typography
                                    sx={{ fontWeight: 700, fontSize: "1rem", color: TEXT, mb: 0.5 }}
                                >
                                    No sends yet
                                </Typography>
                                <Typography
                                    sx={{
                                        color: TEXT_55,
                                        fontSize: "0.86rem",
                                        lineHeight: 1.6,
                                        maxWidth: 280,
                                    }}
                                >
                                    Once you trigger a webhook, your first delivery will show up
                                    right here.
                                </Typography>
                            </Box>
                            <Button
                                component={Link}
                                href={
                                    snap.senders === 0
                                        ? "/dashboard/senders"
                                        : "/dashboard/webhooks"
                                }
                                endIcon={
                                    <ArrowForwardIcon sx={{ fontSize: "1.05rem !important" }} />
                                }
                                sx={{ ...PRIMARY_BTN, fontSize: "0.86rem", px: 2.2 }}
                            >
                                {snap.senders === 0 ? "Get set up" : "Trigger a send"}
                            </Button>
                        </Stack>
                    )}
                </GlassCard>
            </Box>
        </Box>
    );
}
