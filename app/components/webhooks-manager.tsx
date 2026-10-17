"use client";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import WebhookIcon from "@mui/icons-material/Webhook";
import {
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
    InputAdornment,
    Menu,
    MenuItem,
    Select,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import { BORDER, GlassCard, SURFACE } from "./glass-card";
import { useRole } from "./role-provider";

// ── Palette ─────────────────────────────────────────────────────────────────
const ACCENT = "var(--accent)";
const HOOK_ACCENT = "#5fb6ff";
const GREEN = "var(--success)";
const RED = "var(--danger)";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

// ── Types ───────────────────────────────────────────────────────────────────
interface WebhookSummary {
    id: string;
    product_id: string;
    template_id: string;
    name: string;
    endpoint_key: string;
    status: "active" | "disabled";
    created_at: string;
    updated_at: string;
    template_name: string;
    template_slug: string;
    product_name: string;
}

interface TemplateSummary {
    id: string;
    product_id: string;
    slug: string;
    name: string;
    kind: string;
    subject: string;
    variables: string[];
    sender_id: string | null;
    status: string;
    updated_at: string;
}

interface ProductSummary {
    id: string;
    name: string;
}

// ── Shared dark field / select styling (matches products-manager) ────────────
const darkField = {
    "& .MuiOutlinedInput-root": {
        color: TEXT,
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
        "&.Mui-disabled fieldset": { borderColor: "var(--border)" },
    },
    "& .MuiInputBase-input": { fontSize: "0.92rem", py: 1.05 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
    "& .MuiFormHelperText-root": { color: TEXT_40, fontSize: "0.74rem", mx: 0, mt: 0.6 },
};

const darkSelect = {
    color: TEXT,
    borderRadius: "10px",
    background: "var(--field-bg)",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--field-border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--accent-border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSelect-icon": { color: TEXT_40 },
    "& .MuiSelect-select": { fontSize: "0.92rem", py: 1.05 },
};

const darkMenuProps = {
    slotProps: {
        paper: {
            sx: {
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                backgroundImage: "none",
                maxHeight: 360,
                "& .MuiMenuItem-root": { color: TEXT, fontSize: "0.9rem" },
                "& .MuiMenuItem-root.Mui-selected": {
                    background: "var(--accent-tint)",
                },
                "& .MuiListSubheader-root": {
                    background: SURFACE,
                    color: TEXT_40,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    lineHeight: "32px",
                },
            },
        },
    },
};

const darkPaper = {
    paper: {
        sx: {
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: "16px",
            backgroundImage: "none",
        },
    },
};

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: TEXT_40,
                mb: 0.7,
            }}
        >
            {children}
        </Typography>
    );
}

// ── Read-only access chip (shown to viewers where a write button would be) ───
function ReadOnlyChip() {
    return (
        <Chip
            label="Read-only access"
            size="small"
            sx={{
                color: "var(--fg-muted)",
                bgcolor: "var(--overlay)",
                border: "1px solid var(--border)",
            }}
        />
    );
}

// ── Status chip ─────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
    const active = status === "active";
    return (
        <Chip
            label={active ? "Active" : "Disabled"}
            size="small"
            sx={{
                height: 22,
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: active ? GREEN : TEXT_55,
                bgcolor: active ? "rgba(134,239,172,0.1)" : "var(--overlay)",
                border: `1px solid ${active ? "rgba(134,239,172,0.28)" : BORDER}`,
            }}
        />
    );
}

// ── Small copy icon button (clipboard + toast via callback) ──────────────────
function CopyButton({
    value,
    label,
    onCopied,
}: {
    value: string;
    label: string;
    onCopied: () => void;
}) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            onCopied();
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* ignore */
        }
    }
    return (
        <Tooltip title={copied ? "Copied!" : label} arrow>
            <IconButton
                onClick={copy}
                size="small"
                sx={{
                    color: copied ? GREEN : TEXT_40,
                    "&:hover": {
                        color: copied ? GREEN : ACCENT,
                        background: "var(--accent-tint)",
                    },
                }}
                aria-label={label}
            >
                {copied ? (
                    <CheckCircleIcon sx={{ fontSize: 16 }} />
                ) : (
                    <ContentCopyIcon sx={{ fontSize: 16 }} />
                )}
            </IconButton>
        </Tooltip>
    );
}

// ── Build the Node.js HMAC-signed request sample for a webhook ────────────────
function buildSnippet(origin: string, endpointKey: string, variables: string[]): string {
    const base = origin || "https://your-domain";
    const url = `${base}/v1/hooks/${endpointKey}`;
    const varsObj =
        variables.length > 0 ? `{ ${variables.map((v) => `"${v}": "..."`).join(", ")} }` : "{}";
    // Build as a plain string so the literal backticks and ${...} appear verbatim
    // in the snippet the user copies — they are JS, not TSX template interpolation.
    const dollar = "$";
    return [
        `import crypto from "node:crypto";`,
        "",
        `const secret = "YOUR_PRODUCT_SECRET"; // your product's shared secret`,
        `const url = "${url}";`,
        "",
        "const payload = JSON.stringify({",
        `  to: "user@example.com",`,
        `  variables: ${varsObj},`,
        "});",
        "",
        "const t = Math.floor(Date.now() / 1000);",
        `const v1 = crypto.createHmac("sha256", secret).update(\`${dollar}{t}.${dollar}{payload}\`).digest("hex");`,
        "",
        "const res = await fetch(url, {",
        `  method: "POST",`,
        "  headers: {",
        `    "Content-Type": "application/json",`,
        `    "X-Elixpo-Signature": \`t=${dollar}{t},v1=${dollar}{v1}\`,`,
        "  },",
        "  body: payload,",
        "});",
    ].join("\n");
}

// ── Create dialog ────────────────────────────────────────────────────────────
function CreateDialog({
    open,
    templates,
    products,
    webhookCountByTemplate,
    onClose,
    onCreated,
}: {
    open: boolean;
    templates: TemplateSummary[];
    products: ProductSummary[];
    webhookCountByTemplate: Map<string, number>;
    onClose: () => void;
    onCreated: (webhook: WebhookSummary) => void;
}) {
    const [productId, setProductId] = useState("");
    const [templateId, setTemplateId] = useState("");
    const [templateQuery, setTemplateQuery] = useState("");
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setProductId("");
        setTemplateId("");
        setTemplateQuery("");
        setName("");
        setSaving(false);
        setError(null);
    }, [open]);

    // Filter the template list by the search query (name + slug, case-insensitive).
    const filteredTemplates = useMemo(() => {
        const q = templateQuery.trim().toLowerCase();
        if (!q) return templates;
        return templates.filter(
            (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
        );
    }, [templates, templateQuery]);

    const canSubmit = !saving && productId !== "" && templateId !== "" && name.trim().length > 0;

    async function submit() {
        if (!canSubmit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/webhooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, name: name.trim(), productId }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                webhook?: WebhookSummary;
                error?: string;
                message?: string;
            };
            if (!res.ok || !data?.ok || !data.webhook) {
                throw new Error(data?.message || data?.error || "Could not create the webhook.");
            }
            onCreated(data.webhook);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create the webhook.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open={open}
            onClose={() => !saving && onClose()}
            fullWidth
            maxWidth="sm"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.2rem", pb: 1 }}>
                New webhook
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Stack spacing={2.2} sx={{ mt: 0.5 }}>
                    <Box>
                        <FieldLabel>Product (required)</FieldLabel>
                        <Select
                            value={productId}
                            onChange={(e) => setProductId(e.target.value)}
                            displayEmpty
                            fullWidth
                            size="small"
                            sx={darkSelect}
                            MenuProps={darkMenuProps}
                            renderValue={(val) => {
                                if (!val) {
                                    return (
                                        <Typography
                                            sx={{
                                                color: "var(--fg-faint)",
                                                fontSize: "0.92rem",
                                            }}
                                        >
                                            Choose a product
                                        </Typography>
                                    );
                                }
                                const p = products.find((x) => x.id === val);
                                return p ? p.name : String(val);
                            }}
                        >
                            {products.map((p) => (
                                <MenuItem key={p.id} value={p.id}>
                                    {p.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <FieldLabel>Template (required)</FieldLabel>
                        {templates.length === 0 ? (
                            <Typography
                                sx={{ fontSize: "0.84rem", color: TEXT_55, lineHeight: 1.6 }}
                            >
                                You don&rsquo;t have any templates yet. Create one under{" "}
                                <Box
                                    component={Link}
                                    href="/dashboard/templates"
                                    sx={{
                                        color: HOOK_ACCENT,
                                        textDecoration: "none",
                                        "&:hover": { textDecoration: "underline" },
                                    }}
                                >
                                    Templates
                                </Box>{" "}
                                first.
                            </Typography>
                        ) : (
                            <>
                                <TextField
                                    value={templateQuery}
                                    onChange={(e) => setTemplateQuery(e.target.value)}
                                    placeholder="Search templates…"
                                    fullWidth
                                    size="small"
                                    sx={darkField}
                                    slotProps={{
                                        input: {
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SearchIcon
                                                        sx={{ fontSize: 18, color: TEXT_40 }}
                                                    />
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                                <Box
                                    sx={{
                                        mt: 1,
                                        maxHeight: 230,
                                        overflowY: "auto",
                                        borderRadius: "10px",
                                        border: `1px solid ${BORDER}`,
                                        background: "var(--field-bg)",
                                    }}
                                >
                                    {filteredTemplates.length === 0 ? (
                                        <Typography
                                            sx={{
                                                fontSize: "0.82rem",
                                                color: TEXT_40,
                                                p: 1.6,
                                                textAlign: "center",
                                            }}
                                        >
                                            No templates match
                                        </Typography>
                                    ) : (
                                        filteredTemplates.map((t) => {
                                            const selected = t.id === templateId;
                                            const count = webhookCountByTemplate.get(t.id) ?? 0;
                                            return (
                                                <Box
                                                    key={t.id}
                                                    onClick={() => setTemplateId(t.id)}
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 1.2,
                                                        px: 1.4,
                                                        py: 1.1,
                                                        cursor: "pointer",
                                                        borderBottom: `1px solid ${BORDER}`,
                                                        "&:last-of-type": { borderBottom: "none" },
                                                        background: selected
                                                            ? "var(--accent-tint)"
                                                            : "transparent",
                                                        "&:hover": {
                                                            background: selected
                                                                ? "var(--accent-tint-strong)"
                                                                : "var(--field-bg)",
                                                        },
                                                    }}
                                                >
                                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                                        <Typography
                                                            sx={{
                                                                fontSize: "0.9rem",
                                                                fontWeight: 600,
                                                                color: selected ? ACCENT : TEXT,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {t.name}
                                                        </Typography>
                                                        <Typography
                                                            sx={{
                                                                fontSize: "0.74rem",
                                                                color: TEXT_40,
                                                                fontFamily:
                                                                    "var(--font-geist-mono)",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {t.slug}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        label={`${count} ${count === 1 ? "webhook" : "webhooks"}`}
                                                        size="small"
                                                        sx={{
                                                            height: 20,
                                                            fontSize: "0.68rem",
                                                            fontWeight: 600,
                                                            color: TEXT_55,
                                                            bgcolor: "var(--overlay)",
                                                            border: `1px solid ${BORDER}`,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                </Box>
                                            );
                                        })
                                    )}
                                </Box>
                            </>
                        )}
                    </Box>

                    <Box>
                        <FieldLabel>Event name (required)</FieldLabel>
                        <TextField
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="order.paid"
                            helperText="A label for this event"
                            fullWidth
                            size="small"
                            sx={darkField}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                        />
                    </Box>

                    {error && (
                        <Stack direction="row" spacing={0.8} alignItems="flex-start">
                            <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                            <Typography sx={{ fontSize: "0.82rem", color: RED, lineHeight: 1.5 }}>
                                {error}
                            </Typography>
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={saving} sx={GHOST_BTN}>
                    Cancel
                </Button>
                <Button
                    onClick={submit}
                    disabled={!canSubmit}
                    sx={{
                        ...PRIMARY_BTN,
                        minWidth: 140,
                        "&.Mui-disabled": {
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                            boxShadow: "none",
                        },
                    }}
                >
                    {saving ? (
                        <CircularProgress size={18} sx={{ color: "var(--fg-muted)" }} />
                    ) : (
                        "Create webhook"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Rename dialog ────────────────────────────────────────────────────────────
function RenameDialog({
    webhook,
    onClose,
    onSaved,
}: {
    webhook: WebhookSummary | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!webhook) return;
        setName(webhook.name);
        setSaving(false);
        setError(null);
    }, [webhook]);

    const canSubmit = !saving && name.trim().length > 0;

    async function submit() {
        if (!webhook || !canSubmit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/webhooks/${webhook.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
            };
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not rename the webhook.");
            }
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not rename the webhook.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open={webhook != null}
            onClose={() => !saving && onClose()}
            fullWidth
            maxWidth="xs"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.1rem", pb: 1 }}>
                Rename webhook
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Box sx={{ mt: 0.5 }}>
                    <FieldLabel>Event name (required)</FieldLabel>
                    <TextField
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="order.paid"
                        fullWidth
                        size="small"
                        autoFocus
                        sx={darkField}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                submit();
                            }
                        }}
                    />
                    {error && (
                        <Stack
                            direction="row"
                            spacing={0.8}
                            alignItems="flex-start"
                            sx={{ mt: 1.6 }}
                        >
                            <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                            <Typography sx={{ fontSize: "0.82rem", color: RED, lineHeight: 1.5 }}>
                                {error}
                            </Typography>
                        </Stack>
                    )}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={saving} sx={GHOST_BTN}>
                    Cancel
                </Button>
                <Button
                    onClick={submit}
                    disabled={!canSubmit}
                    sx={{
                        ...PRIMARY_BTN,
                        minWidth: 120,
                        "&.Mui-disabled": {
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                            boxShadow: "none",
                        },
                    }}
                >
                    {saving ? (
                        <CircularProgress size={18} sx={{ color: "var(--fg-muted)" }} />
                    ) : (
                        "Save"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteDialog({
    webhook,
    onClose,
    onDeleted,
}: {
    webhook: WebhookSummary | null;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (webhook) {
            setBusy(false);
            setError(null);
        }
    }, [webhook]);

    async function confirm() {
        if (!webhook || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
            };
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not delete the webhook.");
            }
            onDeleted();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete the webhook.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={webhook != null}
            onClose={() => !busy && onClose()}
            fullWidth
            maxWidth="xs"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.1rem" }}>
                Delete webhook
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: TEXT_55, fontSize: "0.9rem", lineHeight: 1.6 }}>
                    Delete <strong style={{ color: TEXT }}>{webhook?.name}</strong>? Its trigger
                    endpoint will stop working immediately. This can&rsquo;t be undone.
                </Typography>
                {error && (
                    <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ mt: 1.6 }}>
                        <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                        <Typography sx={{ fontSize: "0.82rem", color: RED, lineHeight: 1.5 }}>
                            {error}
                        </Typography>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={busy} sx={GHOST_BTN}>
                    Cancel
                </Button>
                <Button
                    onClick={confirm}
                    disabled={busy}
                    sx={{
                        ...PRIMARY_BTN,
                        minWidth: 100,
                        background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
                        boxShadow: "0 8px 24px rgba(239,68,68,0.3)",
                        "&:hover": {
                            background: "linear-gradient(135deg, #fca5a5 0%, #f87171 100%)",
                        },
                        "&.Mui-disabled": {
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                            boxShadow: "none",
                        },
                    }}
                >
                    {busy ? (
                        <CircularProgress size={18} sx={{ color: "var(--fg-muted)" }} />
                    ) : (
                        "Delete"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Webhook row ──────────────────────────────────────────────────────────────
function WebhookRow({
    webhook,
    origin,
    variables,
    expanded,
    onToggleExpand,
    onCopied,
    onRename,
    onToggleStatus,
    onDelete,
    busy,
}: {
    webhook: WebhookSummary;
    origin: string;
    variables: string[];
    expanded: boolean;
    onToggleExpand: () => void;
    onCopied: (msg: string) => void;
    onRename: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
    busy: boolean;
}) {
    const { canWrite } = useRole();
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const triggerUrl = `${origin}/v1/hooks/${webhook.endpoint_key}`;
    const snippet = buildSnippet(origin, webhook.endpoint_key, variables);
    const disabled = webhook.status === "disabled";

    return (
        <Box
            sx={{
                p: { xs: 1.8, md: 2.2 },
                borderRadius: "12px",
                background: "var(--field-bg)",
                border: `1px solid ${BORDER}`,
            }}
        >
            <Stack
                direction="row"
                justifyContent="space-between"
                spacing={1.5}
                alignItems="flex-start"
            >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.2}
                        sx={{ flexWrap: "wrap", rowGap: 0.6 }}
                    >
                        <Typography
                            sx={{
                                fontWeight: 700,
                                fontSize: "0.98rem",
                                color: TEXT,
                                fontFamily: "var(--font-geist-mono)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {webhook.name}
                        </Typography>
                        <StatusChip status={webhook.status} />
                    </Stack>
                    <Typography sx={{ fontSize: "0.8rem", color: TEXT_55, mt: 0.6 }}>
                        {webhook.template_name} · {webhook.product_name}
                    </Typography>
                </Box>

                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Button
                        onClick={onToggleExpand}
                        endIcon={
                            <ExpandMoreIcon
                                sx={{
                                    fontSize: "1.1rem !important",
                                    transition: "transform 0.2s",
                                    transform: expanded ? "rotate(180deg)" : "none",
                                }}
                            />
                        }
                        sx={{ ...GHOST_BTN, fontSize: "0.82rem", py: 0.6, px: 1.6 }}
                    >
                        Usage
                    </Button>
                    {canWrite && (
                        <>
                            <IconButton
                                onClick={(e) => setMenuAnchor(e.currentTarget)}
                                size="small"
                                disabled={busy}
                                sx={{
                                    color: TEXT_55,
                                    border: "1px solid var(--field-border)",
                                    borderRadius: "10px",
                                    "&:hover": {
                                        borderColor: "var(--accent-border)",
                                        background: "var(--accent-tint)",
                                    },
                                }}
                                aria-label="More actions"
                            >
                                {busy ? (
                                    <CircularProgress size={16} sx={{ color: TEXT_55 }} />
                                ) : (
                                    <MoreVertIcon sx={{ fontSize: 19 }} />
                                )}
                            </IconButton>
                            <Menu
                                anchorEl={menuAnchor}
                                open={!!menuAnchor}
                                onClose={() => setMenuAnchor(null)}
                                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                                transformOrigin={{ vertical: "top", horizontal: "right" }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            background: SURFACE,
                                            border: `1px solid ${BORDER}`,
                                            borderRadius: "12px",
                                            backgroundImage: "none",
                                            minWidth: 170,
                                            "& .MuiMenuItem-root": {
                                                fontSize: "0.86rem",
                                                color: TEXT,
                                                gap: 1.2,
                                                py: 1,
                                            },
                                        },
                                    },
                                }}
                            >
                                <MenuItem
                                    onClick={() => {
                                        setMenuAnchor(null);
                                        onRename();
                                    }}
                                >
                                    <EditOutlinedIcon sx={{ fontSize: 18, color: TEXT_55 }} />
                                    Rename
                                </MenuItem>
                                <MenuItem
                                    onClick={() => {
                                        setMenuAnchor(null);
                                        onToggleStatus();
                                    }}
                                >
                                    {disabled ? (
                                        <PlayCircleOutlineIcon
                                            sx={{ fontSize: 18, color: GREEN }}
                                        />
                                    ) : (
                                        <PauseCircleOutlineIcon
                                            sx={{ fontSize: 18, color: TEXT_55 }}
                                        />
                                    )}
                                    {disabled ? "Enable" : "Disable"}
                                </MenuItem>
                                <MenuItem
                                    onClick={() => {
                                        setMenuAnchor(null);
                                        onDelete();
                                    }}
                                    sx={{ color: `${RED} !important` }}
                                >
                                    <DeleteOutlineIcon sx={{ fontSize: 18, color: RED }} />
                                    Delete
                                </MenuItem>
                            </Menu>
                        </>
                    )}
                </Stack>
            </Stack>

            {/* Trigger URL */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 1.4,
                    p: 1,
                    pl: 1.4,
                    borderRadius: "10px",
                    background: "var(--field-bg)",
                    border: `1px solid ${BORDER}`,
                }}
            >
                <Typography
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: "var(--font-geist-mono)",
                        fontSize: "0.78rem",
                        color: origin ? TEXT : TEXT_40,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {origin ? triggerUrl : "Loading endpoint…"}
                </Typography>
                <CopyButton
                    value={triggerUrl}
                    label="Copy trigger URL"
                    onCopied={() => onCopied("Copied")}
                />
            </Box>

            {/* Usage expander */}
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Box sx={{ mt: 1.6 }}>
                    <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 0.7 }}
                    >
                        <FieldLabel>Send with Node.js</FieldLabel>
                        <CopyButton
                            value={snippet}
                            label="Copy code sample"
                            onCopied={() => onCopied("Copied")}
                        />
                    </Stack>
                    <Box
                        component="pre"
                        sx={{
                            m: 0,
                            p: 1.6,
                            borderRadius: "10px",
                            background: "rgba(0,0,0,0.3)",
                            border: `1px solid ${BORDER}`,
                            overflowX: "auto",
                            fontFamily: "var(--font-geist-mono)",
                            fontSize: "0.76rem",
                            lineHeight: 1.7,
                            color: "var(--fg-muted)",
                            whiteSpace: "pre",
                        }}
                    >
                        {snippet}
                    </Box>
                    <Typography
                        sx={{ fontSize: "0.78rem", color: TEXT_55, mt: 1.2, lineHeight: 1.6 }}
                    >
                        Sign every request with your product&rsquo;s shared secret. The{" "}
                        <Box
                            component="code"
                            sx={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.74rem" }}
                        >
                            X-Elixpo-Signature
                        </Box>{" "}
                        header is{" "}
                        <Box
                            component="code"
                            sx={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.74rem" }}
                        >
                            t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256 of &quot;t.body&quot;&gt;
                        </Box>
                        . We reject signatures older than 5 minutes. Your product secret is shown
                        once when you create or rotate the product — find it under{" "}
                        <Box
                            component={Link}
                            href="/dashboard/products"
                            sx={{
                                color: HOOK_ACCENT,
                                textDecoration: "none",
                                "&:hover": { textDecoration: "underline" },
                            }}
                        >
                            Products
                        </Box>
                        .
                    </Typography>
                    {variables.length > 0 && (
                        <Stack
                            direction="row"
                            spacing={0.8}
                            sx={{ mt: 1.2, flexWrap: "wrap", rowGap: 0.6 }}
                            alignItems="center"
                        >
                            <Typography sx={{ fontSize: "0.74rem", color: TEXT_40 }}>
                                Declared variables:
                            </Typography>
                            {variables.map((v) => (
                                <Chip
                                    key={v}
                                    label={v}
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: "0.68rem",
                                        fontFamily: "var(--font-geist-mono)",
                                        color: TEXT_55,
                                        bgcolor: "var(--overlay)",
                                        border: `1px solid ${BORDER}`,
                                    }}
                                />
                            ))}
                        </Stack>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
}

// ── Manager (root) ──────────────────────────────────────────────────────────
export default function WebhooksManager() {
    const { canWrite } = useRole();
    const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
    const [templates, setTemplates] = useState<TemplateSummary[]>([]);
    const [products, setProducts] = useState<ProductSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [origin, setOrigin] = useState("");

    const [createOpen, setCreateOpen] = useState(false);
    const [renaming, setRenaming] = useState<WebhookSummary | null>(null);
    const [deleting, setDeleting] = useState<WebhookSummary | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [productFilter, setProductFilter] = useState("");

    const [toast, setToast] = useState<string | null>(null);

    // Guard SSR: only read window.location.origin on the client.
    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    async function load() {
        try {
            const [wRes, tRes, pRes] = await Promise.all([
                fetch("/api/webhooks"),
                fetch("/api/templates"),
                fetch("/api/products"),
            ]);
            const wData = (await wRes.json().catch(() => ({}))) as {
                ok?: boolean;
                webhooks?: WebhookSummary[];
                error?: string;
                message?: string;
            };
            const tData = (await tRes.json().catch(() => ({}))) as {
                ok?: boolean;
                templates?: TemplateSummary[];
            };
            const pData = (await pRes.json().catch(() => ({}))) as {
                ok?: boolean;
                products?: ProductSummary[];
            };
            if (!wRes.ok || !wData?.ok) {
                throw new Error(wData?.message || wData?.error || "Could not load webhooks.");
            }
            setWebhooks(Array.isArray(wData.webhooks) ? wData.webhooks : []);
            setTemplates(
                tRes.ok && tData?.ok && Array.isArray(tData.templates) ? tData.templates : [],
            );
            setProducts(
                pRes.ok && pData?.ok && Array.isArray(pData.products) ? pData.products : [],
            );
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Could not load webhooks.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function refresh() {
        load();
    }

    function variablesFor(templateId: string): string[] {
        const t = templates.find((x) => x.id === templateId);
        return t && Array.isArray(t.variables) ? t.variables : [];
    }

    async function toggleStatus(webhook: WebhookSummary) {
        setTogglingId(webhook.id);
        const next = webhook.status === "active" ? "disabled" : "active";
        try {
            const res = await fetch(`/api/webhooks/${webhook.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: next }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
            };
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not update the webhook.");
            }
            setToast(next === "active" ? "Webhook enabled" : "Webhook disabled");
            refresh();
        } catch (e) {
            setToast(e instanceof Error ? e.message : "Could not update the webhook.");
        } finally {
            setTogglingId(null);
        }
    }

    // Per-template webhook counts for the create dialog's template chips.
    const webhookCountByTemplate = useMemo(() => {
        const counts = new Map<string, number>();
        for (const w of webhooks) {
            counts.set(w.template_id, (counts.get(w.template_id) ?? 0) + 1);
        }
        return counts;
    }, [webhooks]);

    // Client-side filter by product, then by webhook / template / product name.
    const filteredWebhooks = useMemo(() => {
        const q = search.trim().toLowerCase();
        return webhooks.filter((w) => {
            if (productFilter && w.product_id !== productFilter) return false;
            if (!q) return true;
            return (
                w.name.toLowerCase().includes(q) ||
                w.template_name.toLowerCase().includes(q) ||
                w.product_name.toLowerCase().includes(q)
            );
        });
    }, [webhooks, search, productFilter]);

    // Group filtered webhooks by template. Within each group the newest
    // webhook (by created_at) sorts to the top; groups order by their newest
    // webhook, so the most recently created webhook is always first.
    const groups = useMemo(() => {
        const ts = (iso: string) =>
            Date.parse(iso?.includes("T") ? iso : `${`${iso}`.replace(" ", "T")}Z`) || 0;
        const byTemplate = new Map<
            string,
            {
                templateId: string;
                templateName: string;
                productName: string;
                items: WebhookSummary[];
            }
        >();
        for (const w of filteredWebhooks) {
            if (!byTemplate.has(w.template_id)) {
                byTemplate.set(w.template_id, {
                    templateId: w.template_id,
                    templateName: w.template_name,
                    productName: w.product_name,
                    items: [],
                });
            }
            byTemplate.get(w.template_id)?.items.push(w);
        }
        const out = Array.from(byTemplate.values());
        for (const g of out) g.items.sort((a, b) => ts(b.created_at) - ts(a.created_at));
        out.sort((a, b) => ts(b.items[0]?.created_at) - ts(a.items[0]?.created_at));
        return out;
    }, [filteredWebhooks]);

    const hasTemplates = templates.length > 0;

    // ── Render states ──
    if (loading) {
        return (
            <GlassCard sx={{ py: { xs: 6, md: 8 } }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress size={28} sx={{ color: ACCENT }} />
                    <Typography sx={{ color: TEXT_55, fontSize: "0.9rem" }}>
                        Loading webhooks…
                    </Typography>
                </Stack>
            </GlassCard>
        );
    }

    if (loadError) {
        return (
            <GlassCard>
                <Stack
                    direction="row"
                    spacing={1.2}
                    alignItems="center"
                    justifyContent="space-between"
                >
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ErrorOutlineIcon sx={{ fontSize: 18, color: RED }} />
                        <Typography sx={{ color: RED, fontSize: "0.9rem" }}>{loadError}</Typography>
                    </Stack>
                    <Button
                        onClick={() => {
                            setLoading(true);
                            load();
                        }}
                        sx={GHOST_BTN}
                    >
                        Retry
                    </Button>
                </Stack>
            </GlassCard>
        );
    }

    const newButton = (
        <Button
            onClick={() => setCreateOpen(true)}
            disabled={!hasTemplates}
            startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
            sx={{
                ...PRIMARY_BTN,
                "&.Mui-disabled": {
                    background: "var(--overlay)",
                    color: "var(--fg-faint)",
                    boxShadow: "none",
                },
            }}
        >
            New webhook
        </Button>
    );

    return (
        <Box>
            {webhooks.length === 0 ? (
                hasTemplates ? (
                    <EmptyState
                        icon={WebhookIcon}
                        accent={HOOK_ACCENT}
                        headline="No webhooks yet"
                        subtext="Create a named, signed trigger endpoint on one of your templates, then POST to it from your stack to send the email."
                        cta={canWrite ? newButton : <ReadOnlyChip />}
                    />
                ) : (
                    <EmptyState
                        icon={WebhookIcon}
                        accent={HOOK_ACCENT}
                        headline="Create a template first"
                        subtext="Webhooks attach to a template. Add a template, then come back here to create a signed trigger endpoint for it."
                        cta={
                            <Button component={Link} href="/dashboard/templates" sx={PRIMARY_BTN}>
                                Go to templates
                            </Button>
                        }
                    />
                )
            ) : (
                <Box>
                    {canWrite && (
                        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                            {newButton}
                        </Stack>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search webhooks by name, template, or product…"
                            size="small"
                            sx={{ ...darkField, flex: 1 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon sx={{ fontSize: 18, color: TEXT_40 }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        {products.length > 0 && (
                            <Select
                                value={productFilter}
                                onChange={(e) => setProductFilter(e.target.value)}
                                displayEmpty
                                size="small"
                                sx={{ ...darkSelect, minWidth: { xs: "100%", sm: 200 } }}
                                MenuProps={darkMenuProps}
                                renderValue={(val) =>
                                    val
                                        ? (products.find((p) => p.id === val)?.name ?? "Product")
                                        : "All products"
                                }
                            >
                                <MenuItem value="">All products</MenuItem>
                                {products.map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                        {p.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        )}
                    </Stack>
                    {groups.length === 0 ? (
                        <Typography
                            sx={{
                                fontSize: "0.88rem",
                                color: TEXT_55,
                                textAlign: "center",
                                py: 4,
                            }}
                        >
                            {search.trim()
                                ? `No webhooks match “${search.trim()}”`
                                : "No webhooks for the selected product"}
                        </Typography>
                    ) : (
                        <Stack spacing={2}>
                            {groups.map((group) => (
                                <GlassCard key={group.templateId}>
                                    <Stack
                                        direction="row"
                                        alignItems="center"
                                        spacing={1.2}
                                        sx={{ mb: 1.8, flexWrap: "wrap", rowGap: 0.5 }}
                                    >
                                        <WebhookIcon sx={{ fontSize: 18, color: HOOK_ACCENT }} />
                                        <Typography
                                            sx={{ fontWeight: 700, fontSize: "1rem", color: TEXT }}
                                        >
                                            {group.templateName}
                                        </Typography>
                                        <Typography sx={{ fontSize: "0.8rem", color: TEXT_40 }}>
                                            {group.productName}
                                        </Typography>
                                    </Stack>
                                    <Stack spacing={1.4}>
                                        {group.items.map((w) => (
                                            <WebhookRow
                                                key={w.id}
                                                webhook={w}
                                                origin={origin}
                                                variables={variablesFor(w.template_id)}
                                                expanded={expandedId === w.id}
                                                onToggleExpand={() =>
                                                    setExpandedId((cur) =>
                                                        cur === w.id ? null : w.id,
                                                    )
                                                }
                                                onCopied={(msg) => setToast(msg)}
                                                onRename={() => setRenaming(w)}
                                                onToggleStatus={() => toggleStatus(w)}
                                                onDelete={() => setDeleting(w)}
                                                busy={togglingId === w.id}
                                            />
                                        ))}
                                    </Stack>
                                </GlassCard>
                            ))}
                        </Stack>
                    )}
                </Box>
            )}

            <CreateDialog
                open={createOpen}
                templates={templates}
                products={products}
                webhookCountByTemplate={webhookCountByTemplate}
                onClose={() => setCreateOpen(false)}
                onCreated={(webhook) => {
                    setToast("Webhook created");
                    setExpandedId(webhook.id);
                    refresh();
                }}
            />
            <RenameDialog
                webhook={renaming}
                onClose={() => setRenaming(null)}
                onSaved={() => {
                    setToast("Webhook renamed");
                    refresh();
                }}
            />
            <DeleteDialog
                webhook={deleting}
                onClose={() => setDeleting(null)}
                onDeleted={() => {
                    setToast("Webhook deleted");
                    refresh();
                }}
            />

            <Snackbar
                open={toast != null}
                autoHideDuration={2400}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={toast ?? ""}
            />
        </Box>
    );
}
