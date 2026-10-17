"use client";

import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Chip,
    CircularProgress,
    Collapse,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Select,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "./dashboard-ui";
import { BORDER, GlassCard, SURFACE } from "./glass-card";

// ── Palette ─────────────────────────────────────────────────────────────────
const ACCENT = "var(--accent)";
const GREEN = "#34d399";
const RED = "#f87171";
const AMBER = "#fbbf24";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

// ── Types ───────────────────────────────────────────────────────────────────
interface DeliverySummary {
    id: string;
    product_id: string;
    template_id: string | null;
    webhook_id: string | null;
    sender_id: string | null;
    to_email: string;
    subject: string | null;
    status: string; // "sent" | "failed" | "sending" | "queued"
    attempts: number;
    error: string | null;
    smtp_response: string | null;
    vars: Record<string, unknown> | null;
    idempotency_key: string | null;
    queued_at: string | null;
    sent_at: string | null;
    template_name: string | null;
    product_name: string | null;
    webhook_name: string | null;
    sender_email: string | null;
}

interface LogStats {
    total: number;
    sent: number;
    failed: number;
}

interface LogsResponse {
    ok?: boolean;
    deliveries?: DeliverySummary[];
    stats?: LogStats;
    error?: string;
    message?: string;
}

interface ProductSummary {
    id: string;
    name: string;
}

interface ProductsResponse {
    ok?: boolean;
    products?: ProductSummary[];
    error?: string;
    message?: string;
}

// ── Timestamp helpers ─────────────────────────────────────────────────────────
/** Parse a SQLite UTC string ("2026-06-18 14:03:09", no tz) as UTC. */
function parseUtc(s: string | null): Date | null {
    if (!s) return null;
    const normalized = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Short relative label: "just now", "3m ago", "2h ago", else an absolute date. */
function formatRelative(s: string | null): string {
    const d = parseUtc(s);
    if (!d) return "—";
    const diff = Date.now() - d.getTime();
    const sec = Math.round(diff / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day}d ago`;
    // Older than a week → absolute short date ("Jun 18" or "Jun 18, 2025").
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(sameYear ? {} : { year: "numeric" }),
    });
}

/** Absolute local time for tooltips. */
function formatAbsolute(s: string | null): string {
    const d = parseUtc(s);
    if (!d) return "—";
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ── Shared dark Select styling (matches products-manager) ─────────────────────
const darkSelect = {
    color: TEXT,
    borderRadius: "11px",
    background: "var(--field-bg)",
    minWidth: 160,
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSelect-icon": { color: TEXT_40 },
    "& .MuiSelect-select": { fontSize: "0.88rem", py: 1 },
};

const darkSearchField = {
    "& .MuiInputBase-root": {
        color: TEXT,
        borderRadius: "11px",
        background: "var(--field-bg)",
        fontSize: "0.88rem",
    },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "& .Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiInputBase-input": { py: 1 },
    "& .MuiInputBase-input::placeholder": { color: TEXT_40, opacity: 1 },
};

const darkMenuProps = {
    slotProps: {
        paper: {
            sx: {
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                backgroundImage: "none",
                maxHeight: 360,
                "& .MuiMenuItem-root": { color: TEXT, fontSize: "0.88rem" },
                "& .MuiMenuItem-root.Mui-selected": {
                    background: "var(--accent-tint)",
                },
            },
        },
    },
};

// ── Status visual tokens ──────────────────────────────────────────────────────
const SLATE = "#94a3b8";

function statusColor(status: string): string {
    if (status === "sent") return GREEN;
    if (status === "failed") return RED;
    if (status === "suppressed") return SLATE;
    return AMBER; // sending / queued
}

function statusLabel(status: string): string {
    if (status === "sent") return "Sent";
    if (status === "failed") return "Failed";
    if (status === "sending") return "Sending";
    if (status === "queued") return "Queued";
    if (status === "suppressed") return "Suppressed";
    return status;
}

function StatusChip({ status }: { status: string }) {
    const color = statusColor(status);
    return (
        <Chip
            label={statusLabel(status)}
            size="small"
            sx={{
                height: 22,
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                color,
                bgcolor: `${color}1a`,
                border: `1px solid ${color}44`,
                flexShrink: 0,
            }}
        />
    );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <GlassCard sx={{ flex: 1, p: { xs: 2, md: 2.2 } }}>
            <Typography
                sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: TEXT_40,
                    mb: 0.6,
                }}
            >
                {label}
            </Typography>
            <Typography sx={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1.1 }}>
                {value}
            </Typography>
        </GlassCard>
    );
}

// ── Detail key/value row ──────────────────────────────────────────────────────
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "150px 1fr" },
                gap: { xs: 0.3, sm: 1.4 },
                py: 0.6,
            }}
        >
            <Typography
                sx={{
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: TEXT_40,
                    pt: 0.1,
                }}
            >
                {label}
            </Typography>
            <Box sx={{ minWidth: 0 }}>{children}</Box>
        </Box>
    );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DeliveryDetail({ d }: { d: DeliverySummary }) {
    const vars = d.vars && typeof d.vars === "object" ? d.vars : null;
    const varEntries = vars ? Object.entries(vars) : [];

    return (
        <Box
            sx={{
                mt: 1.6,
                pt: 1.6,
                borderTop: `1px solid ${BORDER}`,
            }}
        >
            <DetailRow label="Subject">
                <Typography
                    sx={{
                        fontSize: "0.85rem",
                        color: TEXT,
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                    }}
                >
                    {d.subject || "—"}
                </Typography>
            </DetailRow>

            <DetailRow label="From">
                <Typography
                    sx={{
                        fontSize: "0.82rem",
                        color: TEXT,
                        fontFamily: "var(--font-geist-mono)",
                        wordBreak: "break-all",
                    }}
                >
                    {d.sender_email || "—"}
                </Typography>
            </DetailRow>

            <DetailRow label="Status">
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexWrap: "wrap", rowGap: 0.6 }}
                >
                    <StatusChip status={d.status} />
                    <Typography sx={{ fontSize: "0.8rem", color: TEXT_55 }}>
                        {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
                    </Typography>
                </Stack>
            </DetailRow>

            {d.sent_at && (
                <DetailRow label="Sent at">
                    <Tooltip title={formatAbsolute(d.sent_at)} arrow>
                        <Typography
                            sx={{ fontSize: "0.82rem", color: TEXT, display: "inline-block" }}
                        >
                            {formatAbsolute(d.sent_at)}
                        </Typography>
                    </Tooltip>
                </DetailRow>
            )}

            {d.idempotency_key && (
                <DetailRow label="Idempotency key">
                    <Typography
                        sx={{
                            fontSize: "0.8rem",
                            color: TEXT_55,
                            fontFamily: "var(--font-geist-mono)",
                            wordBreak: "break-all",
                        }}
                    >
                        {d.idempotency_key}
                    </Typography>
                </DetailRow>
            )}

            {d.error && (
                <DetailRow label="Error">
                    <Typography
                        sx={{
                            fontSize: "0.82rem",
                            color: RED,
                            lineHeight: 1.5,
                            wordBreak: "break-word",
                        }}
                    >
                        {d.error}
                    </Typography>
                </DetailRow>
            )}

            {d.smtp_response && (
                <DetailRow label="SMTP response">
                    <Box
                        sx={{
                            p: 1.2,
                            borderRadius: "8px",
                            background: "var(--field-bg)",
                            border: `1px solid ${BORDER}`,
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: "0.78rem",
                                color: TEXT_55,
                                fontFamily: "var(--font-geist-mono)",
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}
                        >
                            {d.smtp_response}
                        </Typography>
                    </Box>
                </DetailRow>
            )}

            <DetailRow label="Variables">
                {varEntries.length === 0 ? (
                    <Typography sx={{ fontSize: "0.8rem", color: TEXT_40 }}>
                        No variables
                    </Typography>
                ) : (
                    <Stack spacing={0.5}>
                        {varEntries.map(([k, v]) => (
                            <Box
                                key={k}
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: {
                                        xs: "1fr",
                                        sm: "minmax(80px, 200px) 1fr",
                                    },
                                    gap: { xs: 0, sm: 1.2 },
                                    px: 1.2,
                                    py: 0.7,
                                    borderRadius: "8px",
                                    background: "var(--field-bg)",
                                    border: `1px solid ${BORDER}`,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "0.78rem",
                                        color: ACCENT,
                                        fontFamily: "var(--font-geist-mono)",
                                        wordBreak: "break-all",
                                    }}
                                >
                                    {k}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: "0.78rem",
                                        color: TEXT,
                                        fontFamily: "var(--font-geist-mono)",
                                        wordBreak: "break-word",
                                        whiteSpace: "pre-wrap",
                                    }}
                                >
                                    {typeof v === "string" ? v : JSON.stringify(v)}
                                </Typography>
                            </Box>
                        ))}
                    </Stack>
                )}
            </DetailRow>
        </Box>
    );
}

// ── Delivery row ──────────────────────────────────────────────────────────────
function DeliveryRow({ d }: { d: DeliverySummary }) {
    const [open, setOpen] = useState(false);
    const webhook = d.webhook_name || "test send";

    return (
        <Box sx={{ py: 1.6 }}>
            <Stack direction="row" spacing={1.6} alignItems="flex-start">
                <Box sx={{ pt: 0.2 }}>
                    <StatusChip status={d.status} />
                </Box>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack
                        direction="row"
                        spacing={1.2}
                        alignItems="baseline"
                        sx={{ flexWrap: "wrap", rowGap: 0.4 }}
                    >
                        <Typography
                            sx={{
                                fontSize: "0.9rem",
                                fontWeight: 700,
                                color: TEXT,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: { xs: "100%", sm: 280 },
                            }}
                        >
                            {d.to_email}
                        </Typography>
                        <Tooltip title={formatAbsolute(d.queued_at)} arrow>
                            <Typography
                                component="span"
                                sx={{ fontSize: "0.76rem", color: TEXT_40, flexShrink: 0 }}
                            >
                                {formatRelative(d.queued_at)}
                            </Typography>
                        </Tooltip>
                    </Stack>

                    {d.subject && (
                        <Tooltip title={d.subject} arrow>
                            <Typography
                                sx={{
                                    fontSize: "0.82rem",
                                    color: TEXT_55,
                                    mt: 0.3,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {d.subject}
                            </Typography>
                        </Tooltip>
                    )}

                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ mt: 0.6, flexWrap: "wrap", rowGap: 0.4 }}
                    >
                        <Typography sx={{ fontSize: "0.74rem", color: TEXT_40 }}>
                            {d.template_name || "—"}
                        </Typography>
                        <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: TEXT_40 }} />
                        <Typography sx={{ fontSize: "0.74rem", color: TEXT_40 }}>
                            {webhook}
                        </Typography>
                    </Stack>
                </Box>

                <Tooltip title={open ? "Hide details" : "Show details"} arrow>
                    <IconButton
                        onClick={() => setOpen((v) => !v)}
                        size="small"
                        sx={{
                            color: TEXT_40,
                            flexShrink: 0,
                            "&:hover": { color: ACCENT, background: "var(--accent-tint)" },
                        }}
                        aria-label={open ? "Hide delivery details" : "Show delivery details"}
                    >
                        <ExpandMoreIcon
                            sx={{
                                fontSize: 22,
                                transition: "transform .2s",
                                transform: open ? "rotate(180deg)" : "none",
                            }}
                        />
                    </IconButton>
                </Tooltip>
            </Stack>

            <Collapse in={open} unmountOnExit>
                <DeliveryDetail d={d} />
            </Collapse>
        </Box>
    );
}

// ── Manager (root) ────────────────────────────────────────────────────────────
export default function LogsManager() {
    const [products, setProducts] = useState<ProductSummary[]>([]);
    const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
    const [stats, setStats] = useState<LogStats>({ total: 0, sent: 0, failed: 0 });

    const [productId, setProductId] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [search, setSearch] = useState<string>("");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [snack, setSnack] = useState<string | null>(null);

    // Snapshot of whether ANY logs exist (filter-independent), for the empty-state choice.
    const hasAnyLogs = useRef(false);

    const loadLogs = useCallback(
        async (silent = false) => {
            if (silent) setRefreshing(true);
            try {
                const params = new URLSearchParams();
                if (productId) params.set("productId", productId);
                if (status) params.set("status", status);
                const qs = params.toString();
                const res = await fetch(`/api/logs${qs ? `?${qs}` : ""}`);
                const data = (await res.json().catch(() => ({}))) as LogsResponse;
                if (!res.ok || !data?.ok) {
                    throw new Error(
                        data?.message || data?.error || "Could not load delivery logs.",
                    );
                }
                const rows = Array.isArray(data.deliveries) ? data.deliveries : [];
                setDeliveries(rows);
                setStats(data.stats ?? { total: 0, sent: 0, failed: 0 });
                // Track whether any logs exist at all (only trust an unfiltered fetch).
                if (!productId && !status) hasAnyLogs.current = rows.length > 0;
                else if (rows.length > 0) hasAnyLogs.current = true;
            } catch (e) {
                setSnack(e instanceof Error ? e.message : "Could not load delivery logs.");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [productId, status],
    );

    // Products for the filter dropdown (best-effort).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/products");
                const data = (await res.json().catch(() => ({}))) as ProductsResponse;
                if (!cancelled && res.ok && data?.ok && Array.isArray(data.products)) {
                    setProducts(data.products.map((p) => ({ id: p.id, name: p.name })));
                }
            } catch {
                /* non-fatal — the filter just stays empty */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Refetch logs whenever filters change (and on mount).
    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    // ── Loading ──
    if (loading) {
        return (
            <GlassCard sx={{ py: { xs: 6, md: 8 } }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress size={28} sx={{ color: ACCENT }} />
                    <Typography sx={{ color: TEXT_55, fontSize: "0.9rem" }}>
                        Loading delivery logs…
                    </Typography>
                </Stack>
            </GlassCard>
        );
    }

    // Client-side recipient search over the currently loaded deliveries.
    const searchTerm = search.trim().toLowerCase();
    const visibleDeliveries = searchTerm
        ? deliveries.filter((d) => d.to_email.toLowerCase().includes(searchTerm))
        : deliveries;

    const filtersActive = productId !== "" || status !== "" || searchTerm !== "";
    const noLogsAtAll = !hasAnyLogs.current && !filtersActive;

    return (
        <Box>
            {/* Stat row */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }}>
                <StatCard label="Total" value={stats.total} color={TEXT} />
                <StatCard label="Sent" value={stats.sent} color={GREEN} />
                <StatCard label="Failed" value={stats.failed} color={RED} />
            </Stack>

            {/* Filters */}
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                alignItems={{ xs: "stretch", sm: "center" }}
                sx={{ mb: 2.5 }}
            >
                <Select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    displayEmpty
                    size="small"
                    sx={darkSelect}
                    MenuProps={darkMenuProps}
                >
                    <MenuItem value="">All products</MenuItem>
                    {products.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                            {p.name}
                        </MenuItem>
                    ))}
                </Select>

                <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    displayEmpty
                    size="small"
                    sx={darkSelect}
                    MenuProps={darkMenuProps}
                >
                    <MenuItem value="">All statuses</MenuItem>
                    <MenuItem value="sent">Sent</MenuItem>
                    <MenuItem value="failed">Failed</MenuItem>
                    <MenuItem value="suppressed">Suppressed</MenuItem>
                    <MenuItem value="sending">Sending</MenuItem>
                </Select>

                <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search recipient email…"
                    size="small"
                    sx={{ ...darkSearchField, flex: 1, minWidth: { xs: "auto", sm: 220 } }}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 18, color: TEXT_40 }} />
                                </InputAdornment>
                            ),
                        },
                        htmlInput: {
                            "aria-label": "Search recipient email",
                        },
                    }}
                />

                <Tooltip title="Refresh" arrow>
                    <span>
                        <IconButton
                            onClick={() => loadLogs(true)}
                            disabled={refreshing}
                            sx={{
                                color: TEXT_55,
                                border: "1px solid var(--field-border)",
                                borderRadius: "11px",
                                "&:hover": {
                                    borderColor: "var(--accent-border)",
                                    background: "var(--accent-tint)",
                                },
                            }}
                            aria-label="Refresh delivery logs"
                        >
                            {refreshing ? (
                                <CircularProgress size={18} sx={{ color: TEXT_55 }} />
                            ) : (
                                <RefreshIcon sx={{ fontSize: 20 }} />
                            )}
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>

            {/* List */}
            {visibleDeliveries.length === 0 ? (
                noLogsAtAll ? (
                    <EmptyState
                        icon={HistoryIcon}
                        accent={AMBER}
                        headline="No sends yet"
                        subtext="Once you trigger a webhook or run a template test, each delivery — success or failure — will be logged here with its recipient, status, and merged variables."
                    />
                ) : deliveries.length > 0 ? (
                    <Typography
                        sx={{
                            color: TEXT_55,
                            fontSize: "0.85rem",
                            textAlign: "center",
                            py: 3,
                        }}
                    >
                        No deliveries match.
                    </Typography>
                ) : (
                    <GlassCard sx={{ py: { xs: 4, md: 5 } }}>
                        <Typography
                            sx={{ color: TEXT_55, fontSize: "0.9rem", textAlign: "center" }}
                        >
                            No deliveries match these filters.
                        </Typography>
                    </GlassCard>
                )
            ) : (
                <GlassCard sx={{ py: 0.5 }}>
                    {visibleDeliveries.map((d, i) => (
                        <Box key={d.id}>
                            <DeliveryRow d={d} />
                            {i < visibleDeliveries.length - 1 && (
                                <Divider sx={{ borderColor: BORDER }} />
                            )}
                        </Box>
                    ))}
                </GlassCard>
            )}

            <Snackbar
                open={snack != null}
                autoHideDuration={6000}
                onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ErrorOutlineIcon sx={{ fontSize: 18, color: RED }} />
                        <span>{snack}</span>
                    </Stack>
                }
                slotProps={{
                    content: {
                        sx: {
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            color: TEXT,
                            borderRadius: "11px",
                            fontSize: "0.85rem",
                        },
                    },
                }}
            />
        </Box>
    );
}
