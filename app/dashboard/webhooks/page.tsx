"use client";

export const runtime = "edge";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SearchIcon from "@mui/icons-material/Search";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/dashboard-ui";

interface Product {
    id: string;
    app_name: string;
    client_id: string;
    active: boolean;
}

interface WebhookEndpoint {
    productId: string;
    productName: string;
    clientId: string;
    url: string;
    events: string[];
    status: string;
    time_created?: string | null;
}

interface EventTemplate {
    type: string;
    label: string;
    description: string;
    required: boolean;
}

// These mirror WEBHOOK_EVENT_TYPES from src/lib/webhooks.ts
const EVENT_TEMPLATES: EventTemplate[] = [
    {
        type: "entitlement.updated",
        label: "Entitlement updated",
        description:
            "A buyer's access was granted, changed, or expired. Required to fulfill purchases.",
        required: true,
    },
    {
        type: "payment.captured",
        label: "Payment captured",
        description:
            "A payment succeeded. Useful for receipts, analytics, or your own ledger.",
        required: false,
    },
];

export default function WebhooksPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
    const [search, setSearch] = useState("");

    const [registerDlg, setRegisterDlg] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [secretCopied, setSecretCopied] = useState(false);

    const loadAll = async () => {
        try {
            const prodRes = await fetch("/api/dashboard/products", {
                credentials: "include",
            });
            const prodData: any = prodRes.ok ? await prodRes.json() : {};
            const rawProducts: any[] = prodData.products || [];

            // Deduplicate by app_id to get one entry per product
            const seen = new Set<string>();
            const dedupedProducts: Product[] = [];
            for (const p of rawProducts) {
                if (!seen.has(p.app_id)) {
                    seen.add(p.app_id);
                    dedupedProducts.push({
                        id: p.id,
                        app_name: p.app_name || p.name,
                        client_id: p.client_id,
                        active: !!p.active,
                    });
                }
            }
            setProducts(dedupedProducts);

            // Load webhooks for each product
            const hooks: WebhookEndpoint[] = [];
            await Promise.all(
                dedupedProducts.map(async (prod) => {
                    const r = await fetch(
                        `/api/dashboard/products/${prod.id}/webhook`,
                        { credentials: "include" },
                    );
                    if (!r.ok) return;
                    const d: any = await r.json();
                    if (d.endpoint) {
                        hooks.push({
                            productId: prod.id,
                            productName: prod.app_name,
                            clientId: prod.client_id,
                            url: d.endpoint.url,
                            events: d.endpoint.events || [],
                            status: d.endpoint.status || "active",
                            time_created: d.endpoint.time_created ?? null,
                        });
                    }
                }),
            );

            // Sort by time_created ascending (oldest first), newest registered at top
            hooks.sort((a, b) => {
                const ta = new Date(a.time_created || 0).getTime();
                const tb = new Date(b.time_created || 0).getTime();
                return ta - tb;
            });
            // Newly registered webhook goes to top: reverse to show newest first
            hooks.reverse();

            setWebhooks(hooks);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const registerWebhook = async (form: {
        productId: string;
        url: string;
        events: string[];
    }) => {
        setBusy(true);
        setErr("");
        try {
            const r = await fetch(
                `/api/dashboard/products/${form.productId}/webhook`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        url: form.url.trim(),
                        events: form.events,
                    }),
                },
            );
            const d: any = await r.json();
            if (!r.ok)
                throw new Error(d.error_description || d.error || "Failed");
            if (d.signing_secret) {
                setNewSecret(d.signing_secret);
                setSecretCopied(false);
            }
            setRegisterDlg(false);
            setLoading(true);
            await loadAll();
        } catch (e: any) {
            setErr(e.message || "Could not register webhook");
        } finally {
            setBusy(false);
        }
    };

    const copySecret = async () => {
        if (!newSecret) return;
        try {
            await navigator.clipboard.writeText(newSecret);
            setSecretCopied(true);
        } catch {
            // ignore
        }
    };

    // Count webhooks per event template type
    const webhookCountPerTemplate = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const tmpl of EVENT_TEMPLATES) {
            counts[tmpl.type] = webhooks.filter((w) =>
                w.events.includes(tmpl.type),
            ).length;
        }
        return counts;
    }, [webhooks]);

    // Filtered webhooks by search
    const filteredWebhooks = useMemo(() => {
        if (!search.trim()) return webhooks;
        const q = search.toLowerCase();
        return webhooks.filter(
            (w) =>
                w.productName.toLowerCase().includes(q) ||
                w.url.toLowerCase().includes(q) ||
                w.clientId.toLowerCase().includes(q),
        );
    }, [webhooks, search]);

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
                <CircularProgress sx={{ color: "#9b7bf7" }} />
            </Box>
        );
    }

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
                        Webhooks
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.92rem",
                        }}
                    >
                        Manage webhook endpoints across all your products.
                    </Typography>
                </Box>
                <Button
                    startIcon={<AddIcon />}
                    onClick={() => {
                        setErr("");
                        setRegisterDlg(true);
                    }}
                    disabled={products.length === 0}
                    sx={primaryBtn}
                >
                    Register webhook
                </Button>
            </Stack>

            {/* New secret banner */}
            {newSecret && (
                <GlassCard
                    sx={{ mb: 3, border: "1px solid rgba(134,239,172,0.35)" }}
                >
                    <Typography
                        sx={{ fontWeight: 700, color: "#86efac", mb: 1.2 }}
                    >
                        Webhook registered — copy your signing secret now
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: "0.72rem",
                            color: "var(--app-fg-faint)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            mb: 0.5,
                        }}
                    >
                        Signing secret — shown once
                    </Typography>
                    {secretCopied ? (
                        <Box
                            sx={{
                                ...mono,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                color: "var(--app-fg-muted)",
                            }}
                        >
                            <CheckCircleIcon
                                sx={{ fontSize: 16, color: "#86efac" }}
                            />
                            Copied & hidden — store it as ELIXPO_PAY_WEBHOOK_SECRET.
                        </Box>
                    ) : (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                                sx={{
                                    ...mono,
                                    flexGrow: 1,
                                    overflowX: "auto",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {newSecret}
                            </Box>
                            <Button
                                onClick={copySecret}
                                startIcon={
                                    <ContentCopyIcon
                                        sx={{ fontSize: "1rem !important" }}
                                    />
                                }
                                sx={{
                                    textTransform: "none",
                                    fontWeight: 600,
                                    color: "#fff",
                                    px: 2,
                                    background: "#7c5cff",
                                    borderRadius: "10px",
                                    "&:hover": { background: "#8a6dff" },
                                }}
                            >
                                Copy
                            </Button>
                        </Stack>
                    )}
                </GlassCard>
            )}

            {/* Event templates with webhook counts */}
            <GlassCard sx={{ mb: 3 }}>
                <Typography
                    sx={{ fontWeight: 700, fontSize: "1rem", mb: 1.5 }}
                >
                    Event templates
                </Typography>
                <Stack spacing={1}>
                    {EVENT_TEMPLATES.map((tmpl) => (
                        <Stack
                            key={tmpl.type}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={1.5}
                            sx={{
                                p: 1.4,
                                borderRadius: "10px",
                                border: "1px solid var(--app-border)",
                                background: "var(--app-overlay)",
                            }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ mb: 0.3 }}
                                    flexWrap="wrap"
                                >
                                    <Box
                                        component="code"
                                        sx={{
                                            fontFamily:
                                                "var(--font-geist-mono)",
                                            fontSize: "0.8rem",
                                            color: "#c4b5fd",
                                        }}
                                    >
                                        {tmpl.type}
                                    </Box>
                                    {tmpl.required && (
                                        <Chip
                                            label="required"
                                            size="small"
                                            sx={{
                                                height: 18,
                                                fontSize: "0.6rem",
                                                color: "var(--app-fg-muted)",
                                                bgcolor:
                                                    "var(--app-overlay)",
                                            }}
                                        />
                                    )}
                                    {/* Webhook count chip */}
                                    <Chip
                                        label={`${webhookCountPerTemplate[tmpl.type] ?? 0} webhook${webhookCountPerTemplate[tmpl.type] === 1 ? "" : "s"}`}
                                        size="small"
                                        sx={{
                                            height: 18,
                                            fontSize: "0.6rem",
                                            fontWeight: 600,
                                            color: "#9b7bf7",
                                            bgcolor:
                                                "rgba(155,123,247,0.12)",
                                            border: "1px solid rgba(155,123,247,0.25)",
                                        }}
                                    />
                                </Stack>
                                <Typography
                                    sx={{
                                        color: "var(--app-fg-muted)",
                                        fontSize: "0.8rem",
                                    }}
                                >
                                    {tmpl.description}
                                </Typography>
                            </Box>
                        </Stack>
                    ))}
                </Stack>
            </GlassCard>

            {/* Search bar */}
            {webhooks.length > 0 && (
                <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search webhooks by product, URL, or client ID…"
                    size="small"
                    fullWidth
                    sx={{ ...field, mb: 2.5 }}
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
            )}

            {/* Webhook list */}
            {webhooks.length === 0 ? (
                <GlassCard sx={{ textAlign: "center", py: 6 }}>
                    <Typography
                        sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 1 }}
                    >
                        No webhooks yet
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            mb: 3,
                            fontSize: "0.9rem",
                        }}
                    >
                        Register a webhook endpoint to start receiving events
                        from your products.
                    </Typography>
                    <Button
                        startIcon={<AddIcon />}
                        onClick={() => setRegisterDlg(true)}
                        disabled={products.length === 0}
                        sx={primaryBtn}
                    >
                        Register webhook
                    </Button>
                </GlassCard>
            ) : filteredWebhooks.length === 0 ? (
                <GlassCard sx={{ textAlign: "center", py: 5 }}>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.9rem",
                        }}
                    >
                        No webhooks match &ldquo;{search}&rdquo;.
                    </Typography>
                </GlassCard>
            ) : (
                <Stack spacing={2}>
                    {filteredWebhooks.map((wh) => (
                        <GlassCard
                            key={wh.productId}
                            sx={{
                                transition: "border-color 0.2s ease",
                                "&:hover": {
                                    borderColor: "rgba(155,123,247,0.4)",
                                },
                            }}
                        >
                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                justifyContent="space-between"
                                alignItems={{ xs: "flex-start", sm: "center" }}
                                spacing={1.5}
                            >
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        flexWrap="wrap"
                                        sx={{ mb: 0.5 }}
                                    >
                                        <Typography
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: "1rem",
                                                color: "var(--app-fg)",
                                            }}
                                        >
                                            {wh.productName}
                                        </Typography>
                                        <Chip
                                            label={wh.status}
                                            size="small"
                                            sx={{
                                                height: 20,
                                                fontSize: "0.62rem",
                                                fontWeight: 700,
                                                color:
                                                    wh.status === "active"
                                                        ? "#4ade80"
                                                        : "#9ca3af",
                                                bgcolor:
                                                    wh.status === "active"
                                                        ? "rgba(34,197,94,0.1)"
                                                        : "rgba(156,163,175,0.1)",
                                                border: `1px solid ${wh.status === "active" ? "rgba(34,197,94,0.25)" : "rgba(156,163,175,0.2)"}`,
                                            }}
                                        />
                                    </Stack>
                                    <Box
                                        sx={{
                                            fontFamily:
                                                "var(--font-geist-mono)",
                                            fontSize: "0.78rem",
                                            color: "var(--app-fg-muted)",
                                            mb: 0.8,
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        {wh.url}
                                    </Box>
                                    <Stack
                                        direction="row"
                                        spacing={0.8}
                                        flexWrap="wrap"
                                    >
                                        {wh.events.map((ev) => (
                                            <Chip
                                                key={ev}
                                                label={ev}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: "0.62rem",
                                                    fontFamily:
                                                        "var(--font-geist-mono)",
                                                    color: "#c4b5fd",
                                                    bgcolor:
                                                        "rgba(155,123,247,0.1)",
                                                    border: "1px solid rgba(155,123,247,0.2)",
                                                }}
                                            />
                                        ))}
                                    </Stack>
                                </Box>
                                <Button
                                    component="a"
                                    href={`/dashboard/products/${wh.productId}`}
                                    sx={{
                                        textTransform: "none",
                                        color: "#9b7bf7",
                                        fontWeight: 700,
                                        fontSize: "0.9rem",
                                        whiteSpace: "nowrap",
                                        "&:hover": {
                                            background:
                                                "rgba(155,123,247,0.06)",
                                        },
                                    }}
                                >
                                    Manage →
                                </Button>
                            </Stack>
                        </GlassCard>
                    ))}
                </Stack>
            )}

            <RegisterWebhookDialog
                open={registerDlg}
                products={products}
                busy={busy}
                err={err}
                onClose={() => {
                    setRegisterDlg(false);
                    setErr("");
                }}
                onSubmit={registerWebhook}
            />
        </Box>
    );
}

function RegisterWebhookDialog({
    open,
    products,
    busy,
    err,
    onClose,
    onSubmit,
}: {
    open: boolean;
    products: Product[];
    busy: boolean;
    err: string;
    onClose: () => void;
    onSubmit: (form: {
        productId: string;
        url: string;
        events: string[];
    }) => void;
}) {
    const [productSearch, setProductSearch] = useState("");
    const [selectedProductId, setSelectedProductId] = useState("");
    const [url, setUrl] = useState("");
    const [selectedEvents, setSelectedEvents] = useState<string[]>(
        EVENT_TEMPLATES.filter((e) => e.required).map((e) => e.type),
    );

    const filteredProducts = useMemo(() => {
        if (!productSearch.trim()) return products;
        const q = productSearch.toLowerCase();
        return products.filter(
            (p) =>
                p.app_name.toLowerCase().includes(q) ||
                p.client_id.toLowerCase().includes(q),
        );
    }, [products, productSearch]);

    const toggleEvent = (type: string, on: boolean) => {
        setSelectedEvents((prev) =>
            on ? [...new Set([...prev, type])] : prev.filter((t) => t !== type),
        );
    };

    const handleSubmit = () => {
        onSubmit({
            productId: selectedProductId,
            url,
            events: selectedEvents,
        });
    };

    const canSubmit =
        !!selectedProductId && url.trim().startsWith("https://") && !busy;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: dialogPaper }}
        >
            <DialogTitle sx={{ fontWeight: 700 }}>
                Register webhook
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    {/* Product search + select */}
                    <Box>
                        <Typography
                            sx={{
                                fontSize: "0.78rem",
                                color: "var(--app-fg-muted)",
                                mb: 0.8,
                                fontWeight: 600,
                            }}
                        >
                            Product
                        </Typography>
                        <TextField
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Search products…"
                            size="small"
                            fullWidth
                            sx={{ ...field, mb: 1 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon
                                            sx={{
                                                fontSize: 16,
                                                color: "var(--app-fg-faint)",
                                            }}
                                        />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Stack spacing={0.5} sx={{ maxHeight: 180, overflowY: "auto" }}>
                            {filteredProducts.length === 0 ? (
                                <Typography
                                    sx={{
                                        color: "var(--app-fg-faint)",
                                        fontSize: "0.82rem",
                                        py: 1,
                                        textAlign: "center",
                                    }}
                                >
                                    No products found.
                                </Typography>
                            ) : (
                                filteredProducts.map((p) => (
                                    <Box
                                        key={p.id}
                                        onClick={() =>
                                            setSelectedProductId(p.id)
                                        }
                                        sx={{
                                            p: 1.2,
                                            borderRadius: "10px",
                                            border: `1px solid ${selectedProductId === p.id ? "rgba(155,123,247,0.5)" : "var(--app-border)"}`,
                                            background:
                                                selectedProductId === p.id
                                                    ? "rgba(155,123,247,0.1)"
                                                    : "var(--app-overlay)",
                                            cursor: "pointer",
                                            transition: "all 0.15s ease",
                                            "&:hover": {
                                                borderColor:
                                                    "rgba(155,123,247,0.4)",
                                                background:
                                                    "rgba(155,123,247,0.06)",
                                            },
                                        }}
                                    >
                                        <Stack
                                            direction="row"
                                            justifyContent="space-between"
                                            alignItems="center"
                                        >
                                            <Box>
                                                <Typography
                                                    sx={{
                                                        fontWeight: 600,
                                                        fontSize: "0.88rem",
                                                        color: "var(--app-fg)",
                                                    }}
                                                >
                                                    {p.app_name}
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        fontFamily:
                                                            "var(--font-geist-mono)",
                                                        fontSize: "0.72rem",
                                                        color: "#c4b5fd",
                                                    }}
                                                >
                                                    {p.client_id}
                                                </Typography>
                                            </Box>
                                            {selectedProductId === p.id && (
                                                <CheckCircleIcon
                                                    sx={{
                                                        fontSize: 18,
                                                        color: "#9b7bf7",
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                    </Box>
                                ))
                            )}
                        </Stack>
                    </Box>

                    {/* Endpoint URL */}
                    <TextField
                        label="Endpoint URL"
                        placeholder="https://yourapp.com/api/billing/webhook"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        helperText="Must start with https://"
                        size="small"
                        sx={field}
                        fullWidth
                    />

                    {/* Event templates */}
                    <Box>
                        <Typography
                            sx={{
                                fontSize: "0.78rem",
                                color: "var(--app-fg-muted)",
                                mb: 0.8,
                                fontWeight: 600,
                            }}
                        >
                            Events to receive
                        </Typography>
                        <Stack spacing={0.8}>
                            {EVENT_TEMPLATES.map((tmpl) => {
                                const on =
                                    tmpl.required ||
                                    selectedEvents.includes(tmpl.type);
                                return (
                                    <Stack
                                        key={tmpl.type}
                                        direction="row"
                                        alignItems="flex-start"
                                        justifyContent="space-between"
                                        spacing={1.5}
                                        sx={{
                                            p: 1.2,
                                            borderRadius: "10px",
                                            border: "1px solid var(--app-border)",
                                            background:
                                                "var(--app-overlay)",
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Stack
                                                direction="row"
                                                spacing={0.8}
                                                alignItems="center"
                                                sx={{ mb: 0.2 }}
                                                flexWrap="wrap"
                                            >
                                                <Box
                                                    component="code"
                                                    sx={{
                                                        fontFamily:
                                                            "var(--font-geist-mono)",
                                                        fontSize: "0.77rem",
                                                        color: "#c4b5fd",
                                                    }}
                                                >
                                                    {tmpl.type}
                                                </Box>
                                                {tmpl.required && (
                                                    <Chip
                                                        label="required"
                                                        size="small"
                                                        sx={{
                                                            height: 16,
                                                            fontSize: "0.58rem",
                                                            color: "var(--app-fg-muted)",
                                                            bgcolor:
                                                                "var(--app-overlay)",
                                                        }}
                                                    />
                                                )}
                                            </Stack>
                                            <Typography
                                                sx={{
                                                    color: "var(--app-fg-muted)",
                                                    fontSize: "0.77rem",
                                                }}
                                            >
                                                {tmpl.description}
                                            </Typography>
                                        </Box>
                                        <Switch
                                            size="small"
                                            checked={on}
                                            disabled={tmpl.required}
                                            onChange={(e) =>
                                                toggleEvent(
                                                    tmpl.type,
                                                    e.target.checked,
                                                )
                                            }
                                            sx={{
                                                "& .MuiSwitch-switchBase.Mui-checked":
                                                    { color: "#9b7bf7" },
                                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                                                    {
                                                        backgroundColor:
                                                            "#7c5cff",
                                                    },
                                            }}
                                        />
                                    </Stack>
                                );
                            })}
                        </Stack>
                    </Box>

                    {err && (
                        <Typography sx={{ color: "#f87171", fontSize: "0.85rem" }}>
                            {err}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button
                    onClick={onClose}
                    sx={{
                        textTransform: "none",
                        color: "var(--app-fg-muted)",
                    }}
                >
                    Cancel
                </Button>
                <Button
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    sx={primaryBtn}
                >
                    {busy ? "Registering…" : "Register webhook"}
                </Button>
            </DialogActions>
        </Dialog>
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
    "& .MuiFormHelperText-root": { color: "var(--app-fg-faint)" },
};

const mono = {
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.82rem",
    p: 1.2,
    borderRadius: "10px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--app-border)",
    overflowX: "auto",
    whiteSpace: "nowrap",
};

const dialogPaper = {
    bgcolor: "var(--app-surface)",
    border: "1px solid var(--app-border)",
    borderRadius: "16px",
    color: "var(--app-fg)",
    backgroundImage: "none",
};

const primaryBtn = {
    textTransform: "none",
    fontWeight: 700,
    color: "#fff",
    px: 2.4,
    py: 1,
    borderRadius: "10px",
    background: "#7c5cff",
    "&:hover": { background: "#8a6dff" },
    "&.Mui-disabled": { opacity: 0.4, color: "#fff" },
};
