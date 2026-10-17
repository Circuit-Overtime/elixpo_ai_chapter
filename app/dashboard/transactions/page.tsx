"use client";

export const runtime = "edge";

import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Button,
    CircularProgress,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
    fmtDate,
    formatMoney,
    GlassCard,
    StatusChip,
} from "@/components/dashboard-ui";

const STATUS_FILTERS = ["all", "captured", "failed", "created", "expired"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function TransactionsPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [emailSearch, setEmailSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    useEffect(() => {
        fetch("/api/dashboard/transactions?limit=100", {
            credentials: "include",
        })
            .then((r) => (r.ok ? r.json() : { transactions: [] }))
            .then((d: any) => {
                setRows(d.transactions || []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => {
        return rows.filter((t) => {
            const matchesStatus =
                statusFilter === "all" || t.status === statusFilter;
            const matchesEmail =
                !emailSearch.trim() ||
                (t.uid || "")
                    .toLowerCase()
                    .includes(emailSearch.toLowerCase());
            return matchesStatus && matchesEmail;
        });
    }, [rows, statusFilter, emailSearch]);

    return (
        <Box>
            <Box sx={{ mb: 3 }}>
                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: "1.7rem",
                        letterSpacing: "-0.02em",
                    }}
                >
                    Transactions
                </Typography>
                <Typography
                    sx={{
                        color: "var(--app-fg-muted)",
                        fontSize: "0.92rem",
                    }}
                >
                    Every charge across your apps, newest first.
                </Typography>
            </Box>

            {/* Filters */}
            {!loading && rows.length > 0 && (
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{ mb: 2.5 }}
                    alignItems={{ xs: "stretch", sm: "center" }}
                >
                    {/* Email / UID search */}
                    <TextField
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        placeholder="Search by email or user ID…"
                        size="small"
                        sx={{ ...field, flex: 1, minWidth: 220 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon
                                        sx={{
                                            fontSize: 18,
                                            color: "var(--app-fg-faint)",
                                        }}
                                    />
                                </InputAdornment>
                            ),
                        }}
                    />

                    {/* Status filter chips */}
                    <Stack direction="row" spacing={0.8} flexWrap="wrap">
                        {STATUS_FILTERS.map((s) => (
                            <Button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                sx={{
                                    textTransform: "none",
                                    fontWeight: 600,
                                    fontSize: "0.76rem",
                                    px: 1.4,
                                    py: 0.5,
                                    borderRadius: "8px",
                                    minWidth: 0,
                                    color:
                                        statusFilter === s
                                            ? "#fff"
                                            : "var(--app-fg-muted)",
                                    background:
                                        statusFilter === s
                                            ? "#7c5cff"
                                            : "var(--app-overlay)",
                                    border:
                                        statusFilter === s
                                            ? "1px solid #7c5cff"
                                            : "1px solid var(--app-border)",
                                    "&:hover": {
                                        background:
                                            statusFilter === s
                                                ? "#8a6dff"
                                                : "rgba(155,123,247,0.1)",
                                        borderColor: "rgba(155,123,247,0.4)",
                                        color: "var(--app-fg)",
                                    },
                                }}
                            >
                                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                            </Button>
                        ))}
                    </Stack>
                </Stack>
            )}

            <GlassCard>
                {loading ? (
                    <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
                        <CircularProgress sx={{ color: "#9b7bf7" }} />
                    </Box>
                ) : rows.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography sx={{ color: "var(--app-fg-muted)" }}>
                            No transactions yet.
                        </Typography>
                    </Box>
                ) : filtered.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography sx={{ color: "var(--app-fg-muted)" }}>
                            No transactions match your filters.
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: "auto" }}>
                        <Box
                            component="table"
                            sx={{
                                width: "100%",
                                borderCollapse: "collapse",
                                minWidth: 700,
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
                                    <th>Payment ID</th>
                                    <th>When</th>
                                </Box>
                            </Box>
                            <Box component="tbody">
                                {filtered.map((t) => (
                                    <Box
                                        component="tr"
                                        key={t.id}
                                        sx={{
                                            borderTop:
                                                "1px solid var(--app-border)",
                                            "& td": {
                                                py: 1.3,
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
                                                    fontFamily:
                                                        "var(--font-geist-mono)",
                                                    color: "var(--app-fg-faint)",
                                                    fontSize: "0.78rem",
                                                }}
                                            >
                                                {t.provider_payment_id || "—"}
                                            </Box>
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

const field = {
    "& .MuiOutlinedInput-root": {
        color: "var(--app-fg)",
        background: "var(--app-overlay)",
        "& fieldset": { borderColor: "var(--app-border)" },
        "&:hover fieldset": { borderColor: "rgba(155,123,247,0.4)" },
        "&.Mui-focused fieldset": { borderColor: "#9b7bf7" },
    },
    "& .MuiInputLabel-root": { color: "var(--app-fg-muted)" },
};
