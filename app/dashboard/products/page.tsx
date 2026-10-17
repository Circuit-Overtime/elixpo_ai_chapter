"use client";

export const runtime = "edge";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LaunchIcon from "@mui/icons-material/Launch";
import MenuBookIcon from "@mui/icons-material/MenuBook";
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
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, GlassCard } from "@/components/dashboard-ui";

export default function ProductsPage() {
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<any[]>([]);
    const [search, setSearch] = useState("");

    const [registerDlg, setRegisterDlg] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const [creds, setCreds] = useState<{
        clientId: string;
        secret: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);
    const [secretHidden, setSecretHidden] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyId = async (clientId: string) => {
        try {
            await navigator.clipboard.writeText(clientId);
            setCopiedId(clientId);
            setTimeout(
                () => setCopiedId((c) => (c === clientId ? null : c)),
                1500,
            );
        } catch {
            // ignore
        }
    };

    const load = async () => {
        const p: any = await fetch("/api/dashboard/products", {
            credentials: "include",
        }).then((r) => r.json());
        setProducts(p.products || []);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const register = async (form: {
        name: string;
        description: string;
        homepage_url: string;
        pricing_url: string;
    }) => {
        setBusy(true);
        setErr("");
        try {
            const r = await fetch("/api/dashboard/apps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || null,
                    homepage_url: form.homepage_url || null,
                    pricing_url: form.pricing_url || null,
                }),
            });
            const d: any = await r.json();
            if (!r.ok) throw new Error(d.error_description || d.error);
            setRegisterDlg(false);
            setCopied(false);
            setSecretHidden(false);
            setCreds({ clientId: d.client_id, secret: d.client_secret });
            await load();
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setBusy(false);
        }
    };

    const copySecret = async () => {
        if (!creds) return;
        try {
            await navigator.clipboard.writeText(creds.secret);
            setCopied(true);
            setSecretHidden(true);
        } catch {
            // ignore
        }
    };

    // Sort by time_created ascending, then filter by search
    const filteredApps = useMemo(() => {
        const apps = groupByApp(products);
        // sort ascending by time_created (oldest first)
        apps.sort((a, b) => {
            const ta = new Date(a.time_created || 0).getTime();
            const tb = new Date(b.time_created || 0).getTime();
            return ta - tb;
        });
        if (!search.trim()) return apps;
        const q = search.toLowerCase();
        return apps.filter(
            (a) =>
                a.name?.toLowerCase().includes(q) ||
                a.client_id?.toLowerCase().includes(q),
        );
    }, [products, search]);

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
                        Products
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.92rem",
                        }}
                    >
                        Register a product to get its Client ID + secret, then
                        add pricing tiers inside it.
                    </Typography>
                </Box>
                <Button
                    startIcon={<AddIcon />}
                    onClick={() => {
                        setErr("");
                        setRegisterDlg(true);
                    }}
                    sx={primaryBtn}
                >
                    Register product
                </Button>
            </Stack>

            {creds && (
                <GlassCard
                    sx={{ mb: 3, border: "1px solid rgba(134,239,172,0.35)" }}
                >
                    <Typography
                        sx={{ fontWeight: 700, color: "#86efac", mb: 1.2 }}
                    >
                        Product registered — copy your client secret now
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
                        Client ID
                    </Typography>
                    <Box sx={{ ...mono, mb: 2, color: "#c4b5fd" }}>
                        {creds.clientId}
                    </Box>
                    <Typography
                        sx={{
                            fontSize: "0.72rem",
                            color: "var(--app-fg-faint)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            mb: 0.5,
                        }}
                    >
                        Client secret
                    </Typography>
                    {secretHidden ? (
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
                            Copied & hidden — for your security it won't be
                            shown again.
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
                                {creds.secret}
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

            {/* Search bar */}
            {products.length > 0 && (
                <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search products by name or client ID…"
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

            {products.length === 0 ? (
                <GlassCard sx={{ textAlign: "center", py: 6 }}>
                    <Typography
                        sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 1 }}
                    >
                        No products yet
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            mb: 3,
                            fontSize: "0.9rem",
                        }}
                    >
                        Register your first product to receive a Client ID and
                        secret, then add pricing tiers.
                    </Typography>
                    <Button
                        startIcon={<AddIcon />}
                        onClick={() => setRegisterDlg(true)}
                        sx={primaryBtn}
                    >
                        Register product
                    </Button>
                </GlassCard>
            ) : filteredApps.length === 0 ? (
                <GlassCard sx={{ textAlign: "center", py: 5 }}>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "0.9rem",
                        }}
                    >
                        No products match &ldquo;{search}&rdquo;.
                    </Typography>
                </GlassCard>
            ) : (
                <Stack spacing={2}>
                    {filteredApps.map((app) => {
                        const minPrice = app.prices.length
                            ? app.prices.reduce((m: any, x: any) =>
                                  x.unit_amount < m.unit_amount ? x : m,
                              )
                            : null;
                        return (
                            <GlassCard
                                key={app.app_id}
                                sx={{
                                    opacity: app.active ? 1 : 0.55,
                                    transition: "border-color 0.2s ease",
                                    "&:hover": {
                                        borderColor: "rgba(155,123,247,0.4)",
                                    },
                                }}
                            >
                                <Stack
                                    direction={{ xs: "column", sm: "row" }}
                                    justifyContent="space-between"
                                    alignItems={{
                                        xs: "flex-start",
                                        sm: "center",
                                    }}
                                    spacing={1.5}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            flexWrap="wrap"
                                        >
                                            <Typography
                                                component={Link}
                                                href={`/dashboard/products/${app.firstProductId}`}
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: "1.15rem",
                                                    color: "var(--app-fg)",
                                                    textDecoration: "none",
                                                    "&:hover": {
                                                        color: "#c4b5fd",
                                                        textDecoration:
                                                            "underline",
                                                        textUnderlineOffset:
                                                            "3px",
                                                    },
                                                }}
                                            >
                                                {app.name}
                                            </Typography>
                                            <Chip
                                                label={
                                                    app.active
                                                        ? "Active"
                                                        : "Archived"
                                                }
                                                size="small"
                                                sx={{
                                                    height: 22,
                                                    fontSize: "0.7rem",
                                                    color: app.active
                                                        ? "#4ade80"
                                                        : "#9ca3af",
                                                    bgcolor: app.active
                                                        ? "rgba(34,197,94,0.1)"
                                                        : "rgba(156,163,175,0.1)",
                                                    border: `1px solid ${app.active ? "rgba(34,197,94,0.25)" : "rgba(156,163,175,0.2)"}`,
                                                }}
                                            />
                                        </Stack>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            alignItems="center"
                                            sx={{ mt: 0.9 }}
                                            flexWrap="wrap"
                                        >
                                            <Box
                                                sx={{
                                                    fontFamily:
                                                        "var(--font-geist-mono)",
                                                    fontSize: "0.78rem",
                                                    color: "#c4b5fd",
                                                }}
                                            >
                                                {app.client_id}
                                            </Box>
                                            <Button
                                                onClick={() =>
                                                    copyId(app.client_id)
                                                }
                                                startIcon={
                                                    copiedId ===
                                                    app.client_id ? (
                                                        <CheckCircleIcon
                                                            sx={{
                                                                fontSize:
                                                                    "0.9rem !important",
                                                                color: "#86efac",
                                                            }}
                                                        />
                                                    ) : (
                                                        <ContentCopyIcon
                                                            sx={{
                                                                fontSize:
                                                                    "0.9rem !important",
                                                            }}
                                                        />
                                                    )
                                                }
                                                sx={chipBtn}
                                            >
                                                {copiedId === app.client_id
                                                    ? "Copied"
                                                    : "Copy ID"}
                                            </Button>
                                            {app.homepage_url && (
                                                <Button
                                                    component="a"
                                                    href={app.homepage_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    startIcon={
                                                        <LaunchIcon
                                                            sx={{
                                                                fontSize:
                                                                    "0.9rem !important",
                                                            }}
                                                        />
                                                    }
                                                    sx={chipBtn}
                                                >
                                                    Homepage
                                                </Button>
                                            )}
                                        </Stack>
                                        <Typography
                                            sx={{
                                                color: "var(--app-fg-muted)",
                                                fontSize: "0.85rem",
                                                mt: 0.9,
                                            }}
                                        >
                                            {app.tierCount === 0
                                                ? "No pricing tiers yet — sync them from code"
                                                : `${app.tierCount} tier${app.tierCount === 1 ? "" : "s"}${minPrice ? ` · from ${formatMoney(minPrice.unit_amount, minPrice.currency)}` : ""}`}
                                        </Typography>
                                    </Box>
                                    <Button
                                        component={Link}
                                        href={`/dashboard/products/${app.firstProductId}`}
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
                        );
                    })}
                </Stack>
            )}

            <Stack alignItems="center" sx={{ mt: 4 }}>
                <Button
                    component={Link}
                    href="/docs/quickstart"
                    startIcon={
                        <MenuBookIcon sx={{ fontSize: "1.1rem !important" }} />
                    }
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        color: "var(--app-fg)",
                        px: 3,
                        py: 1.2,
                        borderRadius: "12px",
                        border: "1px solid var(--app-border)",
                        "&:hover": {
                            borderColor: "rgba(155,123,247,0.5)",
                            background: "rgba(155,123,247,0.06)",
                        },
                    }}
                >
                    Read Integration Docs
                </Button>
            </Stack>

            <RegisterDialog
                open={registerDlg}
                busy={busy}
                err={err}
                onClose={() => setRegisterDlg(false)}
                onSubmit={register}
            />
        </Box>
    );
}

function RegisterDialog({ open, busy, err, onClose, onSubmit }: any) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [homepage, setHomepage] = useState("");
    const [pricing, setPricing] = useState("");

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: dialogPaper }}
        >
            <DialogTitle sx={{ fontWeight: 700 }}>Register product</DialogTitle>
            <DialogContent>
                <Stack spacing={2.2} sx={{ mt: 1 }}>
                    <TextField
                        label="Product name"
                        placeholder="My App"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        helperText={
                            name.trim().length >= 2
                                ? `Client ID: ${slugPreview(name)}`
                                : "We derive a stable Client ID from this"
                        }
                        sx={field}
                        fullWidth
                    />
                    <TextField
                        label="Description"
                        multiline
                        minRows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        sx={field}
                        fullWidth
                    />
                    <TextField
                        label="Homepage URL"
                        placeholder="http://localhost:3000 or https://myapp.com"
                        value={homepage}
                        onChange={(e) => setHomepage(e.target.value)}
                        sx={field}
                        fullWidth
                    />
                    <TextField
                        label="Pricing page URL"
                        placeholder="https://myapp.com/pricing"
                        helperText="Must be https and return 200, else left empty"
                        value={pricing}
                        onChange={(e) => setPricing(e.target.value)}
                        sx={field}
                        fullWidth
                    />
                    <Typography
                        sx={{
                            color: "var(--app-fg-faint)",
                            fontSize: "0.82rem",
                        }}
                    >
                        You'll add pricing tiers after registering, inside the
                        product.
                    </Typography>
                    {err && (
                        <Typography
                            sx={{ color: "#f87171", fontSize: "0.85rem" }}
                        >
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
                    disabled={busy || name.trim().length < 2}
                    onClick={() =>
                        onSubmit({
                            name,
                            description,
                            homepage_url: homepage,
                            pricing_url: pricing,
                        })
                    }
                    sx={primaryBtn}
                >
                    {busy ? "Registering…" : "Register product"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Group products-rows into one entry per app (the app IS the "product"). */
function groupByApp(products: any[]) {
    const acc: Record<string, any> = {};
    for (const p of products) {
        if (!acc[p.app_id]) {
            acc[p.app_id] = {
                app_id: p.app_id,
                name: p.app_name || p.name,
                client_id: p.client_id,
                homepage_url: p.homepage_url,
                active: false,
                tierCount: 0,
                prices: [] as any[],
                firstProductId: p.id,
                time_created: p.time_created ?? p.created_at ?? null,
            };
        }
        const a = acc[p.app_id];
        a.tierCount += 1;
        a.active = a.active || !!p.active;
        a.prices.push(...(p.prices || []));
    }
    return Object.values(acc);
}

function slugPreview(name: string): string {
    return (
        name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 38) || "app"
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

const mono = {
    fontFamily: "var(--font-geist-mono)",
    fontSize: "0.85rem",
    p: 1.2,
    borderRadius: "10px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid var(--app-border)",
};

const chipBtn = {
    textTransform: "none",
    fontWeight: 600,
    fontSize: "0.74rem",
    color: "var(--app-fg-muted)",
    minWidth: 0,
    px: 1.1,
    py: 0.2,
    borderRadius: "8px",
    border: "1px solid var(--app-border)",
    "&:hover": {
        borderColor: "rgba(155,123,247,0.5)",
        background: "rgba(155,123,247,0.06)",
        color: "var(--app-fg)",
    },
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
