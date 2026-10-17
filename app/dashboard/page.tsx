"use client";

export const runtime = "edge";

import {
    Box,
    Button,
    CircularProgress,
    Stack,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
    fmtDate,
    formatMoney,
    GlassCard,
    StatCard,
    StatusChip,
} from "@/components/dashboard-ui";

interface Overview {
    counts: {
        apps: number;
        products: number;
        activeEntitlements: number;
        paidTransactions: number;
    };
    revenue: { currency: string; count: number; total: number }[];
    recentTransactions: any[];
}

export default function OverviewPage() {
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/dashboard/overview", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                setData(d);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "#9b7bf7" }} />
            </Box>
        );
    }

    const primary = data?.revenue?.[0];

    return (
        <Box>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
                sx={{ mb: 3 }}
            >
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 800,
                            fontSize: "1.7rem",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        Overview
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.92rem",
                        }}
                    >
                        Live revenue, entitlements, and activity across your
                        apps.
                    </Typography>
                </Box>
                <Button
                    component={Link}
                    href="/dashboard/products"
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: "#fff",
                        px: 2.4,
                        py: 1,
                        borderRadius: "10px",
                        background:
                            "linear-gradient(135deg, #9b7bf7 0%, #7c5cff 100%)",
                        "&:hover": {
                            background:
                                "linear-gradient(135deg, #b094ff 0%, #8a6dff 100%)",
                        },
                    }}
                >
                    Manage products
                </Button>
            </Stack>

            {data?.counts.products === 0 && (
                <GlassCard sx={{ mb: 3, border: "1px solid rgba(155,123,247,0.3)" }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "1.15rem" }}>
                        Get set up in 3 steps
                    </Typography>
                    <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.88rem", mb: 2 }}>
                        New here? This is the whole flow — each step links to where you do it.
                    </Typography>
                    <Stack spacing={1.4}>
                        {[
                            {
                                n: "1",
                                t: "Connect your product",
                                d: "Register it and grab your client ID + secret key. Sync pricing from code.",
                                href: "/dashboard/products",
                                cta: "Go to Products",
                            },
                            {
                                n: "2",
                                t: "Set up payouts",
                                d: "Connect your bank so each payment is split to you (minus the platform fee).",
                                href: "/dashboard/payouts",
                                cta: "Connect bank",
                            },
                            {
                                n: "3",
                                t: "Go live",
                                d: "Drop in the hosted checkout and handle the entitlement webhook. See the docs.",
                                href: "/docs/quickstart",
                                cta: "Read the docs",
                            },
                        ].map((s) => (
                            <Stack
                                key={s.n}
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1.5}
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                justifyContent="space-between"
                                sx={{ p: 1.6, borderRadius: "12px", border: "1px solid var(--app-border)", background: "var(--app-overlay)" }}
                            >
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                                    <Box sx={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.85rem", color: "#c4b5fd", background: "rgba(155,123,247,0.12)", border: "1px solid rgba(155,123,247,0.3)" }}>
                                        {s.n}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>{s.t}</Typography>
                                        <Typography sx={{ color: "var(--app-fg-muted)", fontSize: "0.82rem" }}>{s.d}</Typography>
                                    </Box>
                                </Stack>
                                <Button
                                    component={Link}
                                    href={s.href}
                                    sx={{ flexShrink: 0, textTransform: "none", fontWeight: 600, color: "#c4b5fd", border: "1px solid rgba(155,123,247,0.3)", borderRadius: "10px", px: 1.8, whiteSpace: "nowrap", "&:hover": { borderColor: "rgba(155,123,247,0.6)", background: "rgba(155,123,247,0.06)" } }}
                                >
                                    {s.cta}
                                </Button>
                            </Stack>
                        ))}
                    </Stack>
                </GlassCard>
            )}

            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                        xs: "1fr 1fr",
                        md: "repeat(4, 1fr)",
                    },
                    mb: 3,
                }}
            >
                <StatCard
                    label="Revenue"
                    value={
                        primary
                            ? formatMoney(primary.total, primary.currency)
                            : "—"
                    }
                    sub={
                        data && data.revenue.length > 1
                            ? `+${data.revenue.length - 1} more currency`
                            : "captured payments"
                    }
                    accent="#86efac"
                />
                <StatCard
                    label="Active members"
                    value={String(data?.counts.activeEntitlements ?? 0)}
                    sub="entitlements live now"
                    accent="#9b7bf7"
                />
                <StatCard
                    label="Paid txns"
                    value={String(data?.counts.paidTransactions ?? 0)}
                    sub="lifetime captured"
                    accent="#fbbf24"
                />
                <StatCard
                    label="Products"
                    value={String(data?.counts.products ?? 0)}
                    sub={`${data?.counts.apps ?? 0} app${data?.counts.apps === 1 ? "" : "s"}`}
                    accent="#c4b5fd"
                />
            </Box>

            {data && data.revenue.length > 0 && (
                <GlassCard sx={{ mb: 3 }}>
                    <Typography
                        sx={{ fontWeight: 700, mb: 2, fontSize: "1.05rem" }}
                    >
                        Revenue by currency
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: "repeat(auto-fill, minmax(180px, 1fr))",
                            },
                        }}
                    >
                        {data.revenue.map((r) => (
                            <Box
                                key={r.currency}
                                sx={{
                                    p: 2,
                                    borderRadius: "12px",
                                    border: "1px solid var(--app-border)",
                                    background: "var(--app-overlay)",
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "0.78rem",
                                        color: "var(--app-fg-muted)",
                                    }}
                                >
                                    {r.currency} · {r.count} txn
                                    {r.count === 1 ? "" : "s"}
                                </Typography>
                                <Typography
                                    sx={{ fontWeight: 800, fontSize: "1.4rem" }}
                                >
                                    {formatMoney(r.total, r.currency)}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </GlassCard>
            )}

            <GlassCard>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                >
                    <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                        Recent activity
                    </Typography>
                    <Typography
                        component={Link}
                        href="/dashboard/transactions"
                        sx={{
                            color: "#9b7bf7",
                            textDecoration: "none",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                        }}
                    >
                        View all →
                    </Typography>
                </Stack>

                {!data?.recentTransactions?.length ? (
                    <Box sx={{ py: 5, textAlign: "center" }}>
                        <Typography
                            sx={{ color: "var(--app-fg-muted)", mb: 0.5 }}
                        >
                            No transactions yet
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-faint)",
                                fontSize: "0.85rem",
                            }}
                        >
                            Once a customer checks out, payments appear here in
                            real time.
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: "auto" }}>
                        <Box
                            component="table"
                            sx={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 520,
                            }}
                        >
                            <Box component="thead">
                                <Box
                                    component="tr"
                                    sx={{
                                        "& th": {
                                            textAlign: "left",
                                            py: 1,
                                            px: 1,
                                            fontSize: "0.72rem",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            color: "var(--app-fg-faint)",
                                            fontWeight: 600,
                                        },
                                    }}
                                >
                                    <th>App</th>
                                    <th>Customer</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>When</th>
                                </Box>
                            </Box>
                            <Box component="tbody">
                                {data.recentTransactions.map((t) => (
                                    <Box
                                        component="tr"
                                        key={t.id}
                                        sx={{
                                            borderTop:
                                                "1px solid var(--app-border)",
                                            "& td": {
                                                py: 1.2,
                                                px: 1,
                                                fontSize: "0.88rem",
                                            },
                                        }}
                                    >
                                        <td>
                                            <Box
                                                component="span"
                                                sx={{ color: "#c4b5fd" }}
                                            >
                                                {t.app_slug}
                                            </Box>
                                        </td>
                                        <td>
                                            <Box
                                                component="span"
                                                sx={{
                                                    fontFamily:
                                                        "var(--font-geist-mono)",
                                                    color: "var(--app-fg-muted)",
                                                }}
                                            >
                                                {t.uid || "—"}
                                            </Box>
                                        </td>
                                        <td>
                                            <strong>
                                                {formatMoney(
                                                    t.amount,
                                                    t.currency,
                                                )}
                                            </strong>
                                        </td>
                                        <td>
                                            <StatusChip status={t.status} />
                                        </td>
                                        <td>
                                            <Box
                                                component="span"
                                                sx={{
                                                    color: "var(--app-fg-muted)",
                                                }}
                                            >
                                                {fmtDate(t.created_at)}
                                            </Box>
                                        </td>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                )}
            </GlassCard>
        </Box>
    );
}
