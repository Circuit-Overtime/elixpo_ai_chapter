export const runtime = "edge";

// NOTE: Billing is NOT wired yet. The current plan below is a placeholder
// (every tenant is treated as Starter / Free) and prices are illustrative.
// Future: paid plans + metering via Elixpo Pay.

import { requireDashboardSession } from "@/lib/dashboard-session";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { GHOST_BTN, PRIMARY_BTN, PageHeader } from "../../components/dashboard-ui";
import { GlassCard } from "../../components/glass-card";

const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const ACCENT = "var(--accent)";
const BORDER = "var(--border)";

const STARTER_LIMITS: { label: string; value: string }[] = [
    { label: "Products", value: "1" },
    { label: "Templates", value: "5" },
    { label: "Senders", value: "1" },
    { label: "Sends / month", value: "1,000" },
    { label: "Log retention", value: "7 days" },
    { label: "Support", value: "Community" },
];

function UsageRow({ label, used, limit }: { label: string; used: string; limit: string }) {
    return (
        <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ py: 1.1, borderBottom: `1px solid ${BORDER}` }}
        >
            <Typography sx={{ fontSize: "0.88rem", color: "var(--fg-muted)" }}>{label}</Typography>
            <Typography
                sx={{ fontSize: "0.86rem", color: TEXT_55, fontFamily: "var(--font-geist-mono)" }}
            >
                <Box component="span" sx={{ color: TEXT }}>
                    {used}
                </Box>{" "}
                / {limit}
            </Typography>
        </Stack>
    );
}

export default async function BillingPage() {
    await requireDashboardSession();

    return (
        <Box>
            <PageHeader
                title="Billing & Plan"
                description="Your subscription and usage. Billing isn't enabled yet — every workspace runs on the free Starter plan for now."
            />

            <Box
                sx={{
                    display: "grid",
                    gap: 2.5,
                    gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" },
                    alignItems: "start",
                }}
            >
                {/* Current plan card */}
                <GlassCard
                    sx={{
                        background: "var(--accent-tint)",
                        border: "1px solid var(--accent-border)",
                    }}
                >
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                        sx={{ mb: 2 }}
                    >
                        <Box>
                            <Typography
                                sx={{
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    color: ACCENT,
                                    mb: 0.8,
                                }}
                            >
                                Current plan
                            </Typography>
                            <Stack direction="row" alignItems="baseline" spacing={1}>
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: "1.8rem",
                                        color: TEXT,
                                        letterSpacing: "-0.02em",
                                    }}
                                >
                                    Starter
                                </Typography>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: "1rem",
                                        color: "var(--success)",
                                    }}
                                >
                                    Free
                                </Typography>
                            </Stack>
                        </Box>
                        <Chip
                            label="Active"
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: "var(--success)",
                                bgcolor: "rgba(134,239,172,0.12)",
                                border: "1px solid rgba(134,239,172,0.3)",
                            }}
                        />
                    </Stack>

                    <Box
                        sx={{
                            display: "grid",
                            gap: 1.2,
                            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            mb: 2.5,
                        }}
                    >
                        {STARTER_LIMITS.map((l) => (
                            <Stack key={l.label} direction="row" spacing={1} alignItems="center">
                                <CheckIcon
                                    sx={{ fontSize: 16, color: "var(--success)", flexShrink: 0 }}
                                />
                                <Typography sx={{ fontSize: "0.86rem", color: "var(--fg-muted)" }}>
                                    {l.value}{" "}
                                    <Box component="span" sx={{ color: TEXT_55 }}>
                                        {l.label.toLowerCase()}
                                    </Box>
                                </Typography>
                            </Stack>
                        ))}
                    </Box>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.4}>
                        <Button
                            component={Link}
                            href="/pricing"
                            endIcon={<ArrowForwardIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={{ ...PRIMARY_BTN, fontSize: "0.9rem" }}
                        >
                            Upgrade plan
                        </Button>
                        <Button
                            component={Link}
                            href="/pricing"
                            sx={{ ...GHOST_BTN, fontSize: "0.9rem" }}
                        >
                            Compare plans
                        </Button>
                    </Stack>
                </GlassCard>

                {/* Usage this period */}
                <GlassCard>
                    <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT, mb: 0.4 }}>
                        Usage this period
                    </Typography>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.86rem", mb: 1.5 }}>
                        Resets monthly. No sends recorded yet.
                    </Typography>
                    <UsageRow label="Sends" used="0" limit="1,000" />
                    <UsageRow label="Products" used="0" limit="1" />
                    <UsageRow label="Templates" used="0" limit="5" />
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ pt: 1.1 }}
                    >
                        <Typography sx={{ fontSize: "0.88rem", color: "var(--fg-muted)" }}>
                            Senders
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: "0.86rem",
                                color: TEXT_55,
                                fontFamily: "var(--font-geist-mono)",
                            }}
                        >
                            <Box component="span" sx={{ color: TEXT }}>
                                0
                            </Box>{" "}
                            / 1
                        </Typography>
                    </Stack>
                </GlassCard>
            </Box>

            <Typography sx={{ color: "var(--fg-faint)", fontSize: "0.8rem", mt: 2.5 }}>
                Paid plans and metered billing are coming soon, powered by Elixpo Pay.
            </Typography>
        </Box>
    );
}
