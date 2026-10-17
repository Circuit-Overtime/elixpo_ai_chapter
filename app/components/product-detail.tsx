"use client";

import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import InventoryIcon from "@mui/icons-material/Inventory2";
import LanguageIcon from "@mui/icons-material/Language";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import UnsubscribeIcon from "@mui/icons-material/Unsubscribe";
import WebhookIcon from "@mui/icons-material/Webhook";
import {
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Menu,
    MenuItem,
    Link as MuiLink,
    Select,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import { BORDER, GlassCard, SURFACE } from "./glass-card";
import { useRole } from "./role-provider";

const ACCENT = "var(--accent)";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";

interface Product {
    id: string;
    name: string;
    client_id: string;
    has_secret: boolean;
    default_sender_id: string | null;
    description: string | null;
    homepage_url: string | null;
    support_email: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    footer_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}

interface Sender {
    id: string;
    email: string;
    display_name: string | null;
    is_default: boolean;
}

interface Webhook {
    id: string;
    product_id: string;
    template_id: string;
    name: string;
    endpoint_key: string;
    status: string;
    template_name: string;
    template_slug: string;
}

interface TemplateOpt {
    id: string;
    name: string;
    slug: string;
    variables: string[];
}

const darkField = {
    "& .MuiOutlinedInput-root": {
        color: TEXT,
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.92rem" },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
};

const selectSx = {
    color: TEXT,
    borderRadius: "10px",
    background: "var(--field-bg)",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSelect-icon": { color: "var(--fg-faint)" },
    "& .MuiSelect-select": { fontSize: "0.9rem", py: 1.1 },
};

const menuProps = {
    slotProps: {
        paper: {
            sx: {
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                backgroundImage: "none",
                "& .MuiMenuItem-root": { color: TEXT, fontSize: "0.9rem" },
                "& .MuiMenuItem-root.Mui-selected": { background: "var(--accent-tint)" },
            },
        },
    },
} as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
                mb: 0.7,
            }}
        >
            {children}
        </Typography>
    );
}

/** Node.js HMAC-signing usage snippet for a webhook (mirrors webhooks-manager). */
function buildSnippet(origin: string, key: string, vars: string[]): string {
    const varsObj = vars.length ? `{ ${vars.map((v) => `"${v}": "…"`).join(", ")} }` : "{}";
    const sigLine =
        'const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");';
    return [
        'import crypto from "node:crypto";',
        "",
        'const secret = "YOUR_PRODUCT_SECRET"; // your product’s shared secret',
        `const url = "${origin}/v1/hooks/${key}";`,
        "",
        "const payload = JSON.stringify({",
        '  to: "user@example.com",',
        `  variables: ${varsObj},`,
        "});",
        "",
        "const t = Math.floor(Date.now() / 1000);",
        sigLine,
        "",
        "await fetch(url, {",
        '  method: "POST",',
        "  headers: {",
        '    "Content-Type": "application/json",',
        '    "X-Elixpo-Signature": `t=${t},v1=${v1}`,',
        "  },",
        "  body: payload,",
        "});",
    ].join("\n");
}

export default function ProductDetail({ id }: { id: string }) {
    const { canWrite } = useRole();
    const router = useRouter();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [senders, setSenders] = useState<Sender[]>([]);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [templates, setTemplates] = useState<TemplateOpt[]>([]);
    const [origin, setOrigin] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [revealSecret, setRevealSecret] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    useEffect(() => setOrigin(window.location.origin), []);

    const loadProduct = useCallback(async () => {
        try {
            const r = await fetch(`/api/products/${id}`);
            if (r.status === 404) {
                setNotFound(true);
                return;
            }
            const d: any = await r.json();
            if (d?.ok) setProduct(d.product as Product);
            else setNotFound(true);
        } catch {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const loadWebhooks = useCallback(async () => {
        try {
            const d: any = await fetch(`/api/webhooks?productId=${id}`).then((x) => x.json());
            if (d?.ok) setWebhooks(d.webhooks as Webhook[]);
        } catch {
            /* ignore */
        }
    }, [id]);

    useEffect(() => {
        loadProduct();
        loadWebhooks();
        fetch("/api/senders")
            .then((r) => r.json())
            .then((d: any) => d?.ok && setSenders(d.senders as Sender[]))
            .catch(() => {});
        fetch("/api/templates")
            .then((r) => r.json())
            .then((d: any) => d?.ok && setTemplates(d.templates as TemplateOpt[]))
            .catch(() => {});
    }, [loadProduct, loadWebhooks]);

    const templateVars = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const t of templates) map.set(t.id, t.variables || []);
        return map;
    }, [templates]);

    function copy(text: string, label = "Copied") {
        navigator.clipboard?.writeText(text).then(() => setToast(label));
    }

    // ── Edit dialog ──────────────────────────────────────────────────────────
    const [editOpen, setEditOpen] = useState(false);

    async function rotateSecret() {
        try {
            const d: any = await fetch(`/api/products/${id}/rotate-secret`, {
                method: "POST",
            }).then((r) => r.json());
            if (d?.ok && d.secret) {
                setRevealSecret(d.secret);
                setProduct((p) => (p ? { ...p, has_secret: true } : p));
            } else setToast("Could not rotate the secret.");
        } catch {
            setToast("Could not rotate the secret.");
        }
    }

    async function deleteProduct() {
        try {
            const r = await fetch(`/api/products/${id}`, { method: "DELETE" });
            const d: any = await r.json().catch(() => ({}));
            if (r.ok && d?.ok) {
                router.push("/dashboard/products");
            } else {
                setToast(d?.message || "Could not delete this product.");
            }
        } catch {
            setToast("Could not delete this product.");
        }
    }

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}>
                <CircularProgress sx={{ color: ACCENT }} />
            </Box>
        );
    }
    if (notFound || !product) {
        return (
            <Box>
                <BackLink />
                <EmptyState
                    icon={InventoryIcon}
                    headline="Product not found"
                    subtext="This product doesn't exist or you don't have access to it."
                    cta={
                        <Button component={Link} href="/dashboard/products" sx={GHOST_BTN}>
                            Back to products
                        </Button>
                    }
                />
            </Box>
        );
    }

    const defaultSender = senders.find((s) => s.id === product.default_sender_id) || null;

    return (
        <Box>
            <BackLink />

            {/* Commercial header */}
            <GlassCard sx={{ mb: 2.5 }}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2.5}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                >
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                        <Avatar
                            src={product.logo_url || undefined}
                            variant="rounded"
                            sx={{
                                width: 56,
                                height: 56,
                                bgcolor: "var(--accent-tint-strong)",
                                color: ACCENT,
                                fontWeight: 800,
                                border: `1px solid ${BORDER}`,
                            }}
                        >
                            {product.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: "1.4rem",
                                        color: TEXT,
                                        letterSpacing: "-0.01em",
                                    }}
                                >
                                    {product.name}
                                </Typography>
                                <Chip
                                    label={product.status === "active" ? "Active" : "Disabled"}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: "0.66rem",
                                        fontWeight: 700,
                                        color:
                                            product.status === "active"
                                                ? "var(--success)"
                                                : "var(--fg-muted)",
                                        bgcolor:
                                            product.status === "active"
                                                ? "rgba(52,211,153,0.12)"
                                                : "var(--overlay)",
                                        border: `1px solid ${product.status === "active" ? "rgba(52,211,153,0.3)" : BORDER}`,
                                    }}
                                />
                            </Stack>
                            {product.description && (
                                <Typography
                                    sx={{
                                        color: TEXT_55,
                                        fontSize: "0.9rem",
                                        mt: 0.5,
                                        maxWidth: 560,
                                    }}
                                >
                                    {product.description}
                                </Typography>
                            )}
                            <Stack
                                direction="row"
                                spacing={2}
                                sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}
                            >
                                {product.homepage_url && (
                                    <MuiLink
                                        href={product.homepage_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        sx={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            color: ACCENT,
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            textDecoration: "none",
                                            "&:hover": { textDecoration: "underline" },
                                        }}
                                    >
                                        <LanguageIcon sx={{ fontSize: 15 }} /> Homepage
                                    </MuiLink>
                                )}
                                {product.support_email && (
                                    <MuiLink
                                        href={`mailto:${product.support_email}`}
                                        sx={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            color: TEXT_55,
                                            fontSize: "0.82rem",
                                            fontWeight: 600,
                                            textDecoration: "none",
                                            "&:hover": { color: TEXT },
                                        }}
                                    >
                                        <MailOutlineIcon sx={{ fontSize: 15 }} />{" "}
                                        {product.support_email}
                                    </MuiLink>
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                    {canWrite && (
                        <Button
                            onClick={() => setEditOpen(true)}
                            startIcon={<EditIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={{ ...GHOST_BTN, flexShrink: 0 }}
                        >
                            Edit details
                        </Button>
                    )}
                </Stack>
            </GlassCard>

            {/* Credentials */}
            <GlassCard sx={{ mb: 2.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1rem", color: TEXT, mb: 0.4 }}>
                    Credentials
                </Typography>
                <Typography sx={{ color: TEXT_55, fontSize: "0.85rem", mb: 2 }}>
                    Your service authenticates webhook calls with this product&rsquo;s shared
                    secret.
                </Typography>
                <Box
                    sx={{
                        display: "grid",
                        gap: 2,
                        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    }}
                >
                    <Box>
                        <FieldLabel>Client ID</FieldLabel>
                        <CopyField
                            value={product.client_id}
                            onCopy={() => copy(product.client_id, "Client ID copied")}
                        />
                    </Box>
                    {canWrite && (
                        <Box>
                            <FieldLabel>Shared secret</FieldLabel>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button
                                    onClick={rotateSecret}
                                    startIcon={
                                        <AutorenewIcon sx={{ fontSize: "1rem !important" }} />
                                    }
                                    sx={{ ...GHOST_BTN, py: 0.7 }}
                                >
                                    Rotate
                                </Button>
                            </Stack>
                        </Box>
                    )}
                </Box>
                <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                    <Meta
                        label="Default sender"
                        value={defaultSender ? defaultSender.email : "Tenant default"}
                    />
                    <Meta label="Created" value={fmtDate(product.created_at)} />
                    <Meta label="Updated" value={fmtDate(product.updated_at)} />
                </Stack>
            </GlassCard>

            {/* Webhooks */}
            <WebhooksSection
                productId={id}
                origin={origin}
                webhooks={webhooks}
                templates={templates}
                templateVars={templateVars}
                expanded={expanded}
                setExpanded={setExpanded}
                onChanged={loadWebhooks}
                onCopy={copy}
                onToast={setToast}
            />

            <SuppressionsSection productId={id} onToast={setToast} />

            {editOpen && (
                <EditDialog
                    product={product}
                    senders={senders}
                    onClose={() => setEditOpen(false)}
                    onSaved={(p) => {
                        setProduct(p);
                        setEditOpen(false);
                        setToast("Saved");
                    }}
                    onDelete={deleteProduct}
                />
            )}

            <SecretRevealDialog
                secret={revealSecret}
                onClose={() => setRevealSecret(null)}
                onCopy={() => revealSecret && copy(revealSecret, "Secret copied")}
            />

            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={2500}
                onClose={() => setToast(null)}
                message={toast || ""}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
}

function BackLink() {
    return (
        <Button
            component={Link}
            href="/dashboard/products"
            startIcon={<ArrowBackIcon sx={{ fontSize: "1.1rem !important" }} />}
            sx={{ textTransform: "none", color: TEXT_55, mb: 2, "&:hover": { color: TEXT } }}
        >
            Products
        </Button>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <Box>
            <Typography
                sx={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--fg-faint)",
                }}
            >
                {label}
            </Typography>
            <Typography sx={{ fontSize: "0.85rem", color: "var(--fg-muted)", mt: 0.3 }}>
                {value}
            </Typography>
        </Box>
    );
}

function CopyField({ value, onCopy }: { value: string; onCopy: () => void }) {
    return (
        <Stack
            direction="row"
            alignItems="center"
            sx={{
                px: 1.4,
                py: 0.9,
                borderRadius: "10px",
                border: `1px solid ${BORDER}`,
                background: "var(--field-bg)",
                gap: 1,
            }}
        >
            <Typography
                sx={{
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.82rem",
                    color: "var(--fg-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                }}
            >
                {value}
            </Typography>
            <Tooltip title="Copy" arrow>
                <IconButton
                    size="small"
                    onClick={onCopy}
                    sx={{ color: TEXT_55, "&:hover": { color: ACCENT } }}
                >
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>
        </Stack>
    );
}

// ── Webhooks section ─────────────────────────────────────────────────────────

function WebhooksSection({
    productId,
    origin,
    webhooks,
    templates,
    templateVars,
    expanded,
    setExpanded,
    onChanged,
    onCopy,
    onToast,
}: {
    productId: string;
    origin: string;
    webhooks: Webhook[];
    templates: TemplateOpt[];
    templateVars: Map<string, string[]>;
    expanded: string | null;
    setExpanded: (v: string | null) => void;
    onChanged: () => void;
    onCopy: (text: string, label?: string) => void;
    onToast: (m: string) => void;
}) {
    const { canWrite } = useRole();
    const [createOpen, setCreateOpen] = useState(false);
    const [menuFor, setMenuFor] = useState<{ el: HTMLElement; wh: Webhook } | null>(null);
    const [renaming, setRenaming] = useState<Webhook | null>(null);

    async function patch(wh: Webhook, body: Record<string, unknown>) {
        await fetch(`/api/webhooks/${wh.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        onChanged();
    }
    async function remove(wh: Webhook) {
        await fetch(`/api/webhooks/${wh.id}`, { method: "DELETE" });
        onChanged();
        onToast("Webhook deleted");
    }

    return (
        <GlassCard>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: webhooks.length ? 2 : 0.5 }}
            >
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <WebhookIcon sx={{ fontSize: 19, color: ACCENT }} />
                        <Typography sx={{ fontWeight: 700, fontSize: "1rem", color: TEXT }}>
                            Webhooks
                        </Typography>
                    </Stack>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.85rem", mt: 0.4 }}>
                        Attach a template to this product — each webhook is a signed endpoint you
                        trigger to send it.
                    </Typography>
                </Box>
                {canWrite && (
                    <Button
                        onClick={() => setCreateOpen(true)}
                        disabled={templates.length === 0}
                        startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
                        sx={{ ...PRIMARY_BTN, flexShrink: 0 }}
                    >
                        New webhook
                    </Button>
                )}
            </Stack>

            {webhooks.length === 0 ? (
                <Box sx={{ py: 3, textAlign: "center" }}>
                    <Typography sx={{ color: TEXT_55, fontSize: "0.9rem" }}>
                        {templates.length === 0 ? (
                            <>
                                Create a{" "}
                                <Box
                                    component={Link}
                                    href="/dashboard/templates"
                                    sx={{
                                        color: ACCENT,
                                        fontWeight: 600,
                                        textDecoration: "none",
                                        "&:hover": { textDecoration: "underline" },
                                    }}
                                >
                                    template
                                </Box>{" "}
                                first, then add a webhook to attach it here.
                            </>
                        ) : (
                            "No webhooks yet. Add one to attach a template and get a signed trigger endpoint."
                        )}
                    </Typography>
                </Box>
            ) : (
                <Stack spacing={1.5}>
                    {webhooks.map((wh) => {
                        const url = origin
                            ? `${origin}/v1/hooks/${wh.endpoint_key}`
                            : "Loading endpoint…";
                        const open = expanded === wh.id;
                        return (
                            <Box
                                key={wh.id}
                                sx={{
                                    p: 1.6,
                                    borderRadius: "12px",
                                    border: `1px solid ${BORDER}`,
                                    background: "var(--field-bg)",
                                }}
                            >
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    spacing={1}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography
                                                sx={{
                                                    fontFamily: "var(--font-geist-mono)",
                                                    fontWeight: 700,
                                                    fontSize: "0.9rem",
                                                    color: TEXT,
                                                }}
                                            >
                                                {wh.name}
                                            </Typography>
                                            <Chip
                                                label={
                                                    wh.status === "active" ? "Active" : "Disabled"
                                                }
                                                size="small"
                                                sx={{
                                                    height: 18,
                                                    fontSize: "0.62rem",
                                                    fontWeight: 700,
                                                    color:
                                                        wh.status === "active"
                                                            ? "var(--success)"
                                                            : "var(--fg-muted)",
                                                    bgcolor:
                                                        wh.status === "active"
                                                            ? "rgba(52,211,153,0.12)"
                                                            : "var(--overlay)",
                                                    border: `1px solid ${wh.status === "active" ? "rgba(52,211,153,0.3)" : BORDER}`,
                                                }}
                                            />
                                        </Stack>
                                        <Typography
                                            sx={{ color: TEXT_55, fontSize: "0.8rem", mt: 0.3 }}
                                        >
                                            → template{" "}
                                            <Box
                                                component={Link}
                                                href={`/dashboard/templates/${wh.template_id}`}
                                                sx={{
                                                    display: "inline",
                                                    color: ACCENT,
                                                    fontWeight: 700,
                                                    textDecoration: "none",
                                                    "&:hover": { textDecoration: "underline" },
                                                }}
                                            >
                                                {wh.template_name}
                                            </Box>
                                        </Typography>
                                    </Box>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Button
                                            onClick={() => setExpanded(open ? null : wh.id)}
                                            sx={{
                                                ...GHOST_BTN,
                                                py: 0.5,
                                                px: 1.4,
                                                fontSize: "0.78rem",
                                            }}
                                        >
                                            {open ? "Hide" : "Usage"}
                                        </Button>
                                        {canWrite && (
                                            <IconButton
                                                size="small"
                                                onClick={(e) =>
                                                    setMenuFor({ el: e.currentTarget, wh })
                                                }
                                                sx={{ color: TEXT_55, "&:hover": { color: TEXT } }}
                                            >
                                                <MoreVertIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        )}
                                    </Stack>
                                </Stack>

                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    sx={{
                                        mt: 1.2,
                                        px: 1.2,
                                        py: 0.7,
                                        borderRadius: "8px",
                                        border: `1px solid ${BORDER}`,
                                        background: "rgba(0,0,0,0.2)",
                                        gap: 1,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontFamily: "var(--font-geist-mono)",
                                            fontSize: "0.76rem",
                                            color: "var(--fg-muted)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            flex: 1,
                                        }}
                                    >
                                        {url}
                                    </Typography>
                                    <Tooltip title="Copy URL" arrow>
                                        <IconButton
                                            size="small"
                                            disabled={!origin}
                                            onClick={() => onCopy(url, "Endpoint copied")}
                                            sx={{ color: TEXT_55, "&:hover": { color: ACCENT } }}
                                        >
                                            <ContentCopyIcon sx={{ fontSize: 15 }} />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>

                                <Collapse in={open} unmountOnExit>
                                    <Box sx={{ mt: 1.2 }}>
                                        <Stack
                                            direction="row"
                                            justifyContent="space-between"
                                            alignItems="center"
                                            sx={{ mb: 0.6 }}
                                        >
                                            <Typography
                                                sx={{
                                                    fontSize: "0.72rem",
                                                    fontWeight: 700,
                                                    letterSpacing: "0.04em",
                                                    textTransform: "uppercase",
                                                    color: "var(--fg-faint)",
                                                }}
                                            >
                                                Send with Node.js
                                            </Typography>
                                            <Tooltip title="Copy code sample" arrow>
                                                <IconButton
                                                    size="small"
                                                    onClick={() =>
                                                        onCopy(
                                                            buildSnippet(
                                                                origin,
                                                                wh.endpoint_key,
                                                                templateVars.get(wh.template_id) ||
                                                                    [],
                                                            ),
                                                            "Code copied",
                                                        )
                                                    }
                                                    sx={{
                                                        color: TEXT_55,
                                                        "&:hover": { color: ACCENT },
                                                    }}
                                                >
                                                    <ContentCopyIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                        <Box
                                            component="pre"
                                            sx={{
                                                m: 0,
                                                p: 1.4,
                                                borderRadius: "8px",
                                                background: "var(--bg)",
                                                border: `1px solid ${BORDER}`,
                                                overflow: "auto",
                                                fontFamily: "var(--font-geist-mono)",
                                                fontSize: "0.74rem",
                                                color: "#cbd5e1",
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {buildSnippet(
                                                origin,
                                                wh.endpoint_key,
                                                templateVars.get(wh.template_id) || [],
                                            )}
                                        </Box>
                                        <Typography
                                            sx={{
                                                color: "var(--fg-faint)",
                                                fontSize: "0.74rem",
                                                mt: 0.8,
                                            }}
                                        >
                                            Sign every request with the product&rsquo;s shared
                                            secret. We reject signatures older than 5 minutes. The
                                            secret is shown once when you create or rotate it.
                                        </Typography>
                                    </Box>
                                </Collapse>
                            </Box>
                        );
                    })}
                </Stack>
            )}

            <Menu
                open={Boolean(menuFor)}
                anchorEl={menuFor?.el}
                onClose={() => setMenuFor(null)}
                {...menuProps}
            >
                <MenuItem
                    onClick={() => {
                        if (menuFor) setRenaming(menuFor.wh);
                        setMenuFor(null);
                    }}
                >
                    Rename
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        if (menuFor)
                            patch(menuFor.wh, {
                                status: menuFor.wh.status === "active" ? "disabled" : "active",
                            });
                        setMenuFor(null);
                    }}
                >
                    {menuFor?.wh.status === "active" ? "Disable" : "Enable"}
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        if (menuFor) remove(menuFor.wh);
                        setMenuFor(null);
                    }}
                    sx={{ color: "#f87171 !important" }}
                >
                    Delete
                </MenuItem>
            </Menu>

            {createOpen && (
                <CreateWebhookDialog
                    productId={productId}
                    templates={templates}
                    onClose={() => setCreateOpen(false)}
                    onCreated={() => {
                        setCreateOpen(false);
                        onChanged();
                        onToast("Webhook created");
                    }}
                    onError={onToast}
                />
            )}
            {renaming && (
                <RenameDialog
                    initial={renaming.name}
                    onClose={() => setRenaming(null)}
                    onSave={async (name) => {
                        await patch(renaming, { name });
                        setRenaming(null);
                    }}
                />
            )}
        </GlassCard>
    );
}

// ── Suppressions ─────────────────────────────────────────────────────────────

interface Suppression {
    id: string;
    email: string;
    reason: string | null;
    created_at: string;
}

function SuppressionsSection({
    productId,
    onToast,
}: { productId: string; onToast: (m: string) => void }) {
    const { canWrite } = useRole();
    const [items, setItems] = useState<Suppression[] | null>(null);
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const d: any = await fetch(`/api/products/${productId}/suppressions`).then((r) =>
                r.json(),
            );
            setItems(d?.ok ? (d.suppressions as Suppression[]) : []);
        } catch {
            setItems([]);
        }
    }, [productId]);
    useEffect(() => {
        load();
    }, [load]);

    async function add() {
        const e = email.trim();
        if (!e || busy) return;
        setBusy(true);
        try {
            const r = await fetch(`/api/products/${productId}/suppressions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: e }),
            });
            const d: any = await r.json().catch(() => ({}));
            if (r.ok && d?.ok) {
                setEmail("");
                load();
                onToast("Suppressed");
            } else onToast(d?.message || "Could not suppress.");
        } finally {
            setBusy(false);
        }
    }
    async function remove(em: string) {
        await fetch(`/api/products/${productId}/suppressions?email=${encodeURIComponent(em)}`, {
            method: "DELETE",
        });
        load();
        onToast("Re-subscribed");
    }

    return (
        <GlassCard sx={{ mt: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <UnsubscribeIcon sx={{ fontSize: 19, color: ACCENT }} />
                <Typography sx={{ fontWeight: 700, fontSize: "1rem", color: TEXT }}>
                    Suppressions{items?.length ? ` (${items.length})` : ""}
                </Typography>
            </Stack>
            <Typography sx={{ color: TEXT_55, fontSize: "0.85rem", mt: 0.4, mb: 1.8 }}>
                Unsubscribed (or manually blocked) recipients — skipped on every non-transactional
                send.
            </Typography>

            {canWrite && (
                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <TextField
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && add()}
                        placeholder="name@example.com"
                        size="small"
                        sx={{ ...darkField, flex: 1, maxWidth: 360 }}
                    />
                    <Button
                        onClick={add}
                        disabled={!email.trim() || busy}
                        sx={{ ...GHOST_BTN, py: 0.7 }}
                    >
                        Suppress
                    </Button>
                </Stack>
            )}

            {items === null ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={20} sx={{ color: ACCENT }} />
                </Box>
            ) : items.length === 0 ? (
                <Typography sx={{ color: TEXT_55, fontSize: "0.88rem" }}>
                    No suppressions yet.
                </Typography>
            ) : (
                <Stack divider={<Box sx={{ borderBottom: `1px solid ${BORDER}` }} />}>
                    {items.map((s) => (
                        <Stack
                            key={s.id}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={1}
                            sx={{ py: 1 }}
                        >
                            <Stack
                                direction="row"
                                alignItems="center"
                                spacing={1.2}
                                sx={{ minWidth: 0 }}
                            >
                                <Typography
                                    sx={{
                                        color: TEXT,
                                        fontSize: "0.88rem",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {s.email}
                                </Typography>
                                <Chip
                                    label={s.reason || "unsubscribe"}
                                    size="small"
                                    sx={{
                                        height: 18,
                                        fontSize: "0.62rem",
                                        color: TEXT_55,
                                        bgcolor: "var(--overlay)",
                                        border: `1px solid ${BORDER}`,
                                    }}
                                />
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.76rem",
                                        display: { xs: "none", sm: "block" },
                                    }}
                                >
                                    {fmtDate(s.created_at)}
                                </Typography>
                            </Stack>
                            {canWrite && (
                                <Button
                                    onClick={() => remove(s.email)}
                                    sx={{
                                        textTransform: "none",
                                        fontSize: "0.8rem",
                                        color: ACCENT,
                                        "&:hover": { background: "var(--accent-tint)" },
                                    }}
                                >
                                    Re-subscribe
                                </Button>
                            )}
                        </Stack>
                    ))}
                </Stack>
            )}
        </GlassCard>
    );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

const dialogPaper = {
    sx: {
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        backgroundImage: "none",
        borderRadius: "16px",
        width: "100%",
        maxWidth: 460,
    },
} as const;

/** Upload a product logo to Cloudinary (optimized) and return its URL. */
function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function pick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploading(true);
        setErr(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const d: any = await fetch("/api/uploads/image", { method: "POST", body: form }).then(
                (r) => r.json(),
            );
            if (d?.url) onChange(d.url as string);
            else setErr(d?.message || "Upload failed");
        } catch {
            setErr("Upload failed");
        } finally {
            setUploading(false);
        }
    }

    return (
        <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
                src={value || undefined}
                variant="rounded"
                sx={{
                    width: 48,
                    height: 48,
                    bgcolor: "var(--accent-tint-strong)",
                    color: ACCENT,
                    border: `1px solid ${BORDER}`,
                }}
            >
                {!value && "?"}
            </Avatar>
            <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                sx={{ ...GHOST_BTN, py: 0.7 }}
            >
                {uploading ? <CircularProgress size={15} sx={{ color: ACCENT, mr: 1 }} /> : null}
                {uploading ? "Uploading…" : value ? "Replace" : "Upload logo"}
            </Button>
            {value && (
                <Button
                    onClick={() => onChange("")}
                    sx={{
                        textTransform: "none",
                        color: "#f87171",
                        fontSize: "0.84rem",
                        "&:hover": { background: "rgba(248,113,113,0.08)" },
                    }}
                >
                    Remove
                </Button>
            )}
            {err && (
                <Typography sx={{ color: "var(--danger)", fontSize: "0.78rem" }}>{err}</Typography>
            )}
            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={pick}
            />
        </Stack>
    );
}

function EditDialog({
    product,
    senders,
    onClose,
    onSaved,
    onDelete,
}: {
    product: Product;
    senders: Sender[];
    onClose: () => void;
    onSaved: (p: Product) => void;
    onDelete: () => void;
}) {
    const [name, setName] = useState(product.name);
    const [description, setDescription] = useState(product.description ?? "");
    const [homepageUrl, setHomepageUrl] = useState(product.homepage_url ?? "");
    const [supportEmail, setSupportEmail] = useState(product.support_email ?? "");
    const [logoUrl, setLogoUrl] = useState(product.logo_url ?? "");
    const [address, setAddress] = useState(product.address ?? "");
    const [phone, setPhone] = useState(product.phone ?? "");
    const [footerNote, setFooterNote] = useState(product.footer_note ?? "");
    const [defaultSenderId, setDefaultSenderId] = useState(product.default_sender_id ?? "");
    const [status, setStatus] = useState(product.status);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const d: any = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    description,
                    homepageUrl,
                    supportEmail,
                    logoUrl,
                    address,
                    phone,
                    footerNote,
                    defaultSenderId: defaultSenderId || null,
                    status,
                }),
            }).then((r) => r.json());
            if (d?.ok && d.product) onSaved(d.product as Product);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: TEXT, fontWeight: 800 }}>Edit product</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <Box>
                        <FieldLabel>Name</FieldLabel>
                        <TextField
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Description</FieldLabel>
                        <TextField
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            maxRows={4}
                            sx={darkField}
                            placeholder="What this product is — shown on its page."
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Homepage URL</FieldLabel>
                        <TextField
                            value={homepageUrl}
                            onChange={(e) => setHomepageUrl(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                            placeholder="https://yourproduct.com"
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Support email</FieldLabel>
                        <TextField
                            value={supportEmail}
                            onChange={(e) => setSupportEmail(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                            placeholder="support@yourproduct.com"
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Logo</FieldLabel>
                        <LogoUploader value={logoUrl} onChange={setLogoUrl} />
                        <TextField
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            fullWidth
                            size="small"
                            sx={{ ...darkField, mt: 1 }}
                            placeholder="…or paste an image URL"
                        />
                    </Box>

                    <Box sx={{ pt: 0.5, mt: 0.5, borderTop: `1px solid ${BORDER}` }}>
                        <Typography
                            sx={{ fontSize: "0.8rem", fontWeight: 700, color: TEXT, mb: 0.3 }}
                        >
                            Email footer
                        </Typography>
                        <Typography sx={{ color: TEXT_55, fontSize: "0.78rem", mb: 1.5 }}>
                            Appended to every email this product sends (logo above + the details
                            below).
                        </Typography>
                    </Box>
                    <Box>
                        <FieldLabel>Address</FieldLabel>
                        <TextField
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            maxRows={3}
                            sx={darkField}
                            placeholder="123 Main St, City, Country (required for CAN-SPAM)"
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Phone</FieldLabel>
                        <TextField
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                            placeholder="+1 555 123 4567"
                        />
                    </Box>
                    <Box>
                        <FieldLabel>Quote / tagline</FieldLabel>
                        <TextField
                            value={footerNote}
                            onChange={(e) => setFooterNote(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                            placeholder="Making email simple."
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Default sender</FieldLabel>
                        <Select
                            value={defaultSenderId}
                            onChange={(e) => setDefaultSenderId(e.target.value)}
                            fullWidth
                            size="small"
                            displayEmpty
                            renderValue={(v) =>
                                v
                                    ? (senders.find((s) => s.id === v)?.email ?? "Unknown")
                                    : "Tenant default"
                            }
                            sx={selectSx}
                            MenuProps={menuProps}
                        >
                            <MenuItem value="">Tenant default</MenuItem>
                            {senders.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {s.email}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                    <Box>
                        <FieldLabel>Status</FieldLabel>
                        <Select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            fullWidth
                            size="small"
                            sx={selectSx}
                            MenuProps={menuProps}
                        >
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="disabled">Disabled</MenuItem>
                        </Select>
                    </Box>

                    {confirmDelete ? (
                        <Box
                            sx={{
                                p: 1.4,
                                borderRadius: "10px",
                                border: "1px solid rgba(248,113,113,0.3)",
                                background: "rgba(248,113,113,0.06)",
                            }}
                        >
                            <Typography sx={{ color: "var(--danger)", fontSize: "0.82rem", mb: 1 }}>
                                Delete this product? Its webhooks are removed. This can&rsquo;t be
                                undone.
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    onClick={onDelete}
                                    sx={{
                                        textTransform: "none",
                                        fontWeight: 700,
                                        color: "#fff",
                                        background: "#dc2626",
                                        borderRadius: "9px",
                                        px: 2,
                                        "&:hover": { background: "#b91c1c" },
                                    }}
                                >
                                    Delete
                                </Button>
                                <Button
                                    onClick={() => setConfirmDelete(false)}
                                    sx={{ ...GHOST_BTN, py: 0.6 }}
                                >
                                    Cancel
                                </Button>
                            </Stack>
                        </Box>
                    ) : (
                        <Button
                            onClick={() => setConfirmDelete(true)}
                            startIcon={<DeleteOutlineIcon sx={{ fontSize: "1rem !important" }} />}
                            sx={{
                                textTransform: "none",
                                color: "#f87171",
                                alignSelf: "flex-start",
                                fontSize: "0.84rem",
                                "&:hover": { background: "rgba(248,113,113,0.08)" },
                            }}
                        >
                            Delete product
                        </Button>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={{ ...GHOST_BTN, py: 0.7 }}>
                    Cancel
                </Button>
                <Button onClick={save} disabled={saving || !name.trim()} sx={PRIMARY_BTN}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function CreateWebhookDialog({
    productId,
    templates,
    onClose,
    onCreated,
    onError,
}: {
    productId: string;
    templates: TemplateOpt[];
    onClose: () => void;
    onCreated: () => void;
    onError: (m: string) => void;
}) {
    const [templateId, setTemplateId] = useState("");
    const [name, setName] = useState("");
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [counts, setCounts] = useState<Record<string, number>>({});

    // How many webhooks already point at each template (across all products).
    useEffect(() => {
        fetch("/api/webhooks")
            .then((r) => r.json())
            .then((d: any) => {
                if (!d?.ok || !Array.isArray(d.webhooks)) return;
                const c: Record<string, number> = {};
                for (const w of d.webhooks) c[w.template_id] = (c[w.template_id] || 0) + 1;
                setCounts(c);
            })
            .catch(() => {});
    }, []);

    const q = query.trim().toLowerCase();
    const filtered = q
        ? templates.filter(
              (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
          )
        : templates;

    async function create() {
        if (!templateId || !name.trim()) return;
        setBusy(true);
        try {
            const r = await fetch("/api/webhooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, name: name.trim(), productId }),
            });
            const d: any = await r.json().catch(() => ({}));
            if (r.ok && d?.ok) onCreated();
            else onError(d?.message || d?.error || "Could not create the webhook.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: TEXT, fontWeight: 800 }}>New webhook</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <Box>
                        <FieldLabel>Template (required)</FieldLabel>
                        <TextField
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search templates…"
                            fullWidth
                            size="small"
                            sx={{ ...darkField, mb: 1 }}
                        />
                        <Box
                            sx={{
                                maxHeight: 230,
                                overflowY: "auto",
                                borderRadius: "10px",
                                border: `1px solid ${BORDER}`,
                            }}
                        >
                            {filtered.length === 0 ? (
                                <Typography
                                    sx={{
                                        color: TEXT_55,
                                        fontSize: "0.85rem",
                                        p: 1.6,
                                        textAlign: "center",
                                    }}
                                >
                                    {templates.length === 0
                                        ? "No templates yet."
                                        : "No templates match."}
                                </Typography>
                            ) : (
                                filtered.map((t) => {
                                    const n = counts[t.id] || 0;
                                    const active = t.id === templateId;
                                    return (
                                        <Box
                                            key={t.id}
                                            onClick={() => setTemplateId(t.id)}
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 1,
                                                px: 1.4,
                                                py: 1,
                                                cursor: "pointer",
                                                borderBottom: `1px solid ${BORDER}`,
                                                background: active
                                                    ? "var(--accent-tint-strong)"
                                                    : "transparent",
                                                "&:hover": {
                                                    background: active
                                                        ? "var(--accent-tint-strong)"
                                                        : "var(--field-bg)",
                                                },
                                                "&:last-of-type": { borderBottom: "none" },
                                            }}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography
                                                    sx={{
                                                        color: TEXT,
                                                        fontSize: "0.88rem",
                                                        fontWeight: active ? 700 : 500,
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {t.name}
                                                </Typography>
                                                <Typography
                                                    sx={{
                                                        color: TEXT_55,
                                                        fontSize: "0.74rem",
                                                        fontFamily: "var(--font-geist-mono)",
                                                    }}
                                                >
                                                    {t.slug}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={`${n} webhook${n === 1 ? "" : "s"}`}
                                                size="small"
                                                sx={{
                                                    flexShrink: 0,
                                                    height: 20,
                                                    fontSize: "0.66rem",
                                                    color: n ? "var(--accent)" : TEXT_55,
                                                    bgcolor: n
                                                        ? "var(--accent-tint)"
                                                        : "var(--overlay)",
                                                    border: `1px solid ${n ? "var(--accent-border)" : BORDER}`,
                                                }}
                                            />
                                        </Box>
                                    );
                                })
                            )}
                        </Box>
                    </Box>
                    <Box>
                        <FieldLabel>Event name (required)</FieldLabel>
                        <TextField
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            fullWidth
                            size="small"
                            sx={darkField}
                            placeholder="order.paid"
                            onKeyDown={(e) => e.key === "Enter" && create()}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={{ ...GHOST_BTN, py: 0.7 }}>
                    Cancel
                </Button>
                <Button
                    onClick={create}
                    disabled={busy || !templateId || !name.trim()}
                    sx={PRIMARY_BTN}
                >
                    {busy ? "Creating…" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function RenameDialog({
    initial,
    onClose,
    onSave,
}: { initial: string; onClose: () => void; onSave: (name: string) => void }) {
    const [name, setName] = useState(initial);
    return (
        <Dialog open onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: TEXT, fontWeight: 800 }}>Rename webhook</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    size="small"
                    sx={{ ...darkField, mt: 0.5 }}
                    onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={{ ...GHOST_BTN, py: 0.7 }}>
                    Cancel
                </Button>
                <Button
                    onClick={() => name.trim() && onSave(name.trim())}
                    disabled={!name.trim()}
                    sx={PRIMARY_BTN}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function SecretRevealDialog({
    secret,
    onClose,
    onCopy,
}: { secret: string | null; onClose: () => void; onCopy: () => void }) {
    return (
        <Dialog open={Boolean(secret)} onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: TEXT, fontWeight: 800 }}>New shared secret</DialogTitle>
            <DialogContent>
                <Typography sx={{ color: "var(--danger)", fontSize: "0.84rem", mb: 1.5 }}>
                    Copy it now — it won&rsquo;t be shown again. The previous secret stays valid for
                    a short grace window.
                </Typography>
                <Stack
                    direction="row"
                    alignItems="center"
                    sx={{
                        px: 1.4,
                        py: 1,
                        borderRadius: "10px",
                        border: `1px solid ${BORDER}`,
                        background: "rgba(0,0,0,0.25)",
                        gap: 1,
                    }}
                >
                    <Typography
                        sx={{
                            fontFamily: "var(--font-geist-mono)",
                            fontSize: "0.82rem",
                            color: "var(--success)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                        }}
                    >
                        {secret}
                    </Typography>
                    <Tooltip title="Copy" arrow>
                        <IconButton
                            size="small"
                            onClick={onCopy}
                            sx={{ color: TEXT_55, "&:hover": { color: ACCENT } }}
                        >
                            <ContentCopyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={PRIMARY_BTN}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function fmtDate(s: string): string {
    try {
        return new Date(`${s.replace(" ", "T")}Z`).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return s;
    }
}
