"use client";

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Menu,
    MenuItem,
    Select,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import { EmptyState, GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import { BORDER, GlassCard, SURFACE } from "./glass-card";
import { useRole } from "./role-provider";

// ── Palette ─────────────────────────────────────────────────────────────────
const ACCENT = "var(--accent)";
const GREEN = "var(--success)";
const RED = "var(--danger)";
const AMBER = "#fbbf24";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

// ── Types ───────────────────────────────────────────────────────────────────
interface ProductSummary {
    id: string;
    name: string;
    client_id: string;
    has_secret: boolean;
    default_sender_id: string | null;
    status: "active" | "disabled";
    description: string | null;
    homepage_url: string | null;
    support_email: string | null;
    logo_url: string | null;
    created_at: string;
    updated_at: string;
    template_count: number;
    webhook_count: number;
}

interface Sender {
    id: string;
    email: string;
    display_name: string | null;
    is_default?: boolean;
}

/** Compose a display label like `Acme Support <support@acme.com>`. */
function senderLabel(s: Sender): string {
    return s.display_name ? `${s.display_name} <${s.email}>` : s.email;
}

// ── Relative-time formatter (no deps) ───────────────────────────────────────
function relativeTime(iso: string | null): string {
    if (!iso) return "";
    // D1 stores `datetime('now')` as "YYYY-MM-DD HH:MM:SS" (UTC, no tz). Treat as UTC.
    const normalized = iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`;
    const then = new Date(normalized).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Date.now() - then;
    const sec = Math.round(diff / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec} seconds ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
    const mon = Math.round(day / 30);
    if (mon < 12) return `${mon} month${mon === 1 ? "" : "s"} ago`;
    const yr = Math.round(mon / 12);
    return `${yr} year${yr === 1 ? "" : "s"} ago`;
}

// ── Shared dark TextField styling (matches workspace-name-form) ──────────────
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
};

// ── Shared dark Select styling (matches senders-manager) ─────────────────────
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
                "& .MuiMenuItem-root": { color: TEXT, fontSize: "0.9rem" },
                "& .MuiMenuItem-root.Mui-selected": {
                    background: "var(--accent-tint)",
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

// ── Count chip ──────────────────────────────────────────────────────────────
function CountChip({ label }: { label: string }) {
    return (
        <Chip
            label={label}
            size="small"
            sx={{
                height: 22,
                fontSize: "0.7rem",
                fontWeight: 600,
                color: TEXT_55,
                bgcolor: "var(--overlay)",
                border: `1px solid ${BORDER}`,
            }}
        />
    );
}

// ── Small copy button (mono value + clipboard) ──────────────────────────────
function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
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

// ── Secret reveal modal (shared by create + rotate) ──────────────────────────
function SecretRevealDialog({
    secret,
    onClose,
}: {
    secret: string | null;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (secret) setCopied(false);
    }, [secret]);

    async function copy() {
        if (!secret) return;
        try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    }

    return (
        <Dialog
            open={secret != null}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.2rem", pb: 1 }}>
                <Stack direction="row" spacing={1.2} alignItems="center">
                    <VpnKeyOutlinedIcon sx={{ fontSize: 22, color: ACCENT }} />
                    Your shared secret
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    {/* Can't-miss warning */}
                    <Box
                        sx={{
                            display: "flex",
                            gap: 1.2,
                            p: 1.6,
                            borderRadius: "10px",
                            background: "rgba(251,191,36,0.07)",
                            border: "1px solid rgba(251,191,36,0.3)",
                        }}
                    >
                        <WarningAmberIcon
                            sx={{ fontSize: 19, color: AMBER, flexShrink: 0, mt: 0.1 }}
                        />
                        <Typography
                            sx={{
                                fontSize: "0.84rem",
                                color: "var(--fg-muted)",
                                lineHeight: 1.6,
                            }}
                        >
                            Copy this now — you won&rsquo;t be able to see it again. Store it
                            somewhere safe; we only keep a hashed copy.
                        </Typography>
                    </Box>

                    {/* Mono secret box */}
                    <Box>
                        <FieldLabel>Shared secret</FieldLabel>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                p: 1.4,
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
                                    fontSize: "0.82rem",
                                    color: TEXT,
                                    wordBreak: "break-all",
                                    lineHeight: 1.5,
                                }}
                            >
                                {secret}
                            </Typography>
                            <Button
                                onClick={copy}
                                startIcon={
                                    copied ? (
                                        <CheckCircleIcon sx={{ fontSize: "1rem !important" }} />
                                    ) : (
                                        <ContentCopyIcon sx={{ fontSize: "1rem !important" }} />
                                    )
                                }
                                sx={{
                                    ...GHOST_BTN,
                                    flexShrink: 0,
                                    fontSize: "0.82rem",
                                    py: 0.7,
                                    ...(copied
                                        ? { color: GREEN, borderColor: "rgba(134,239,172,0.4)" }
                                        : {}),
                                }}
                            >
                                {copied ? "Copied" : "Copy"}
                            </Button>
                        </Box>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2 }}>
                <Button onClick={onClose} sx={{ ...PRIMARY_BTN, minWidth: 110 }}>
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Create dialog ────────────────────────────────────────────────────────────
function CreateDialog({
    open,
    senders,
    onClose,
    onCreated,
}: {
    open: boolean;
    senders: Sender[];
    onClose: () => void;
    onCreated: (secret: string) => void;
}) {
    const [name, setName] = useState("");
    const [defaultSenderId, setDefaultSenderId] = useState("");
    const [description, setDescription] = useState("");
    const [homepageUrl, setHomepageUrl] = useState("");
    const [supportEmail, setSupportEmail] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName("");
        setDefaultSenderId("");
        setDescription("");
        setHomepageUrl("");
        setSupportEmail("");
        setLogoUrl("");
        setSaving(false);
        setError(null);
    }, [open]);

    const canSubmit = !saving && name.trim().length > 0;

    async function submit() {
        if (!canSubmit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    defaultSenderId: defaultSenderId || undefined,
                    description: description.trim() || undefined,
                    homepageUrl: homepageUrl.trim() || undefined,
                    supportEmail: supportEmail.trim() || undefined,
                    logoUrl: logoUrl.trim() || undefined,
                }),
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not create the product.");
            }
            onClose();
            onCreated(String(data.secret));
        } catch (e: any) {
            setError(e?.message || "Could not create the product.");
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
                Create a product
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Stack spacing={2.2} sx={{ mt: 0.5 }}>
                    <Box>
                        <FieldLabel>Name (required)</FieldLabel>
                        <TextField
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Transactional emails"
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
                    </Box>

                    <Box>
                        <FieldLabel>Default sender (optional)</FieldLabel>
                        <Select
                            value={defaultSenderId}
                            onChange={(e) => setDefaultSenderId(e.target.value)}
                            displayEmpty
                            fullWidth
                            size="small"
                            sx={darkSelect}
                            MenuProps={darkMenuProps}
                        >
                            <MenuItem value="">— none —</MenuItem>
                            {senders.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {senderLabel(s)}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <FieldLabel>Description</FieldLabel>
                        <TextField
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What this product is — shown on its page."
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            maxRows={3}
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Homepage URL</FieldLabel>
                        <TextField
                            value={homepageUrl}
                            onChange={(e) => setHomepageUrl(e.target.value)}
                            placeholder="https://yourproduct.com"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Support email</FieldLabel>
                        <TextField
                            value={supportEmail}
                            onChange={(e) => setSupportEmail(e.target.value)}
                            placeholder="support@yourproduct.com"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Logo URL</FieldLabel>
                        <TextField
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://…/logo.png"
                            fullWidth
                            size="small"
                            sx={darkField}
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
                        "Create product"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Edit dialog ──────────────────────────────────────────────────────────────
function EditDialog({
    product,
    senders,
    onClose,
    onSaved,
}: {
    product: ProductSummary | null;
    senders: Sender[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [defaultSenderId, setDefaultSenderId] = useState("");
    const [status, setStatus] = useState<"active" | "disabled">("active");
    const [description, setDescription] = useState("");
    const [homepageUrl, setHomepageUrl] = useState("");
    const [supportEmail, setSupportEmail] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!product) return;
        setName(product.name);
        setDefaultSenderId(product.default_sender_id ?? "");
        setStatus(product.status);
        setDescription(product.description ?? "");
        setHomepageUrl(product.homepage_url ?? "");
        setSupportEmail(product.support_email ?? "");
        setLogoUrl(product.logo_url ?? "");
        setSaving(false);
        setError(null);
    }, [product]);

    const canSubmit = !saving && name.trim().length > 0;

    async function submit() {
        if (!product || !canSubmit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    defaultSenderId: defaultSenderId || null,
                    status,
                    description: description.trim(),
                    homepageUrl: homepageUrl.trim(),
                    supportEmail: supportEmail.trim(),
                    logoUrl: logoUrl.trim(),
                }),
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not save changes.");
            }
            onSaved();
            onClose();
        } catch (e: any) {
            setError(e?.message || "Could not save changes.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open={product != null}
            onClose={() => !saving && onClose()}
            fullWidth
            maxWidth="sm"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.2rem", pb: 1 }}>
                Edit product
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Stack spacing={2.2} sx={{ mt: 0.5 }}>
                    <Box>
                        <FieldLabel>Name (required)</FieldLabel>
                        <TextField
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Transactional emails"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Default sender</FieldLabel>
                        <Select
                            value={defaultSenderId}
                            onChange={(e) => setDefaultSenderId(e.target.value)}
                            displayEmpty
                            fullWidth
                            size="small"
                            sx={darkSelect}
                            MenuProps={darkMenuProps}
                        >
                            <MenuItem value="">— none —</MenuItem>
                            {senders.map((s) => (
                                <MenuItem key={s.id} value={s.id}>
                                    {senderLabel(s)}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <FieldLabel>Status</FieldLabel>
                        <Select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as "active" | "disabled")}
                            fullWidth
                            size="small"
                            sx={darkSelect}
                            MenuProps={darkMenuProps}
                        >
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="disabled">Disabled</MenuItem>
                        </Select>
                    </Box>

                    <Box>
                        <FieldLabel>Description</FieldLabel>
                        <TextField
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What this product is — shown on its page."
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            maxRows={3}
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Homepage URL</FieldLabel>
                        <TextField
                            value={homepageUrl}
                            onChange={(e) => setHomepageUrl(e.target.value)}
                            placeholder="https://yourproduct.com"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Support email</FieldLabel>
                        <TextField
                            value={supportEmail}
                            onChange={(e) => setSupportEmail(e.target.value)}
                            placeholder="support@yourproduct.com"
                            fullWidth
                            size="small"
                            sx={darkField}
                        />
                    </Box>

                    <Box>
                        <FieldLabel>Logo URL</FieldLabel>
                        <TextField
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            placeholder="https://…/logo.png"
                            fullWidth
                            size="small"
                            sx={darkField}
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
                        minWidth: 130,
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
                        "Save changes"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Rotate-secret confirm dialog ─────────────────────────────────────────────
function RotateDialog({
    product,
    onClose,
    onRotated,
}: {
    product: ProductSummary | null;
    onClose: () => void;
    onRotated: (secret: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (product) {
            setBusy(false);
            setError(null);
        }
    }, [product]);

    async function confirm() {
        if (!product || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/products/${product.id}/rotate-secret`, {
                method: "POST",
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not rotate the secret.");
            }
            onClose();
            onRotated(String(data.secret));
        } catch (e: any) {
            setError(e?.message || "Could not rotate the secret.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={product != null}
            onClose={() => !busy && onClose()}
            fullWidth
            maxWidth="xs"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.1rem" }}>
                Rotate secret
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: TEXT_55, fontSize: "0.9rem", lineHeight: 1.6 }}>
                    Rotate the secret for <strong style={{ color: TEXT }}>{product?.name}</strong>?
                    The current secret keeps working for a short grace period.
                </Typography>
                {error && (
                    <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ mt: 1.6 }}>
                        <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                        <Typography sx={{ fontSize: "0.82rem", color: RED }}>{error}</Typography>
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
                        minWidth: 120,
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
                        "Rotate secret"
                    )}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteDialog({
    product,
    onClose,
    onDeleted,
}: {
    product: ProductSummary | null;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (product) {
            setBusy(false);
            setError(null);
        }
    }, [product]);

    async function confirm() {
        if (!product || busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not delete the product.");
            }
            onDeleted();
            onClose();
        } catch (e: any) {
            setError(e?.message || "Could not delete the product.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog
            open={product != null}
            onClose={() => !busy && onClose()}
            fullWidth
            maxWidth="xs"
            slotProps={darkPaper}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.1rem" }}>
                Delete product
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: TEXT_55, fontSize: "0.9rem", lineHeight: 1.6 }}>
                    Delete <strong style={{ color: TEXT }}>{product?.name}</strong>? Its client ID
                    and secret will stop working immediately. This can&rsquo;t be undone.
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

// ── Product card ─────────────────────────────────────────────────────────────
function ProductCard({
    product,
    senderLabelText,
    onEdit,
    onRotate,
    onDelete,
}: {
    product: ProductSummary;
    senderLabelText: string | null;
    onEdit: () => void;
    onRotate: () => void;
    onDelete: () => void;
}) {
    const { canWrite } = useRole();
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

    return (
        <GlassCard>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                spacing={2}
                alignItems={{ sm: "flex-start" }}
            >
                {/* Identity + meta */}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.2}
                        sx={{ flexWrap: "wrap", rowGap: 0.6 }}
                    >
                        <Typography
                            component={Link}
                            href={`/dashboard/products/${product.id}`}
                            sx={{
                                fontWeight: 700,
                                fontSize: "1.02rem",
                                color: TEXT,
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                "&:hover": { color: ACCENT, textDecoration: "underline" },
                            }}
                        >
                            {product.name}
                        </Typography>
                        <StatusChip status={product.status} />
                    </Stack>

                    {/* client_id mono + copy */}
                    <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 1 }}>
                        <Typography
                            sx={{
                                fontSize: "0.78rem",
                                color: TEXT_55,
                                fontFamily: "var(--font-geist-mono)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {product.client_id}
                        </Typography>
                        <CopyButton value={product.client_id} label="Copy client ID" />
                    </Stack>

                    {/* count chips */}
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{ mt: 1.2, flexWrap: "wrap", rowGap: 0.6 }}
                    >
                        <CountChip
                            label={`${product.template_count} template${product.template_count === 1 ? "" : "s"}`}
                        />
                        <CountChip
                            label={`${product.webhook_count} webhook${product.webhook_count === 1 ? "" : "s"}`}
                        />
                    </Stack>

                    {/* default sender + created time */}
                    <Typography sx={{ fontSize: "0.8rem", color: TEXT_55, mt: 1.2 }}>
                        {senderLabelText
                            ? `Default sender: ${senderLabelText}`
                            : "No default sender"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.76rem", color: TEXT_40, mt: 0.4 }}>
                        Created {relativeTime(product.created_at)}
                    </Typography>
                </Box>

                {/* Action row */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                    {!canWrite && <ReadOnlyChip />}
                    {canWrite && (
                        <>
                            <Button
                                onClick={onEdit}
                                startIcon={
                                    <EditOutlinedIcon sx={{ fontSize: "1rem !important" }} />
                                }
                                sx={{ ...GHOST_BTN, fontSize: "0.84rem" }}
                            >
                                Edit
                            </Button>
                            <Button
                                onClick={onRotate}
                                startIcon={
                                    <VpnKeyOutlinedIcon sx={{ fontSize: "1rem !important" }} />
                                }
                                sx={{ ...GHOST_BTN, fontSize: "0.84rem" }}
                            >
                                Rotate secret
                            </Button>

                            <IconButton
                                onClick={(e) => setMenuAnchor(e.currentTarget)}
                                size="small"
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
                                <MoreVertIcon sx={{ fontSize: 19 }} />
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
                                            minWidth: 160,
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
        </GlassCard>
    );
}

// ── Manager (root) ──────────────────────────────────────────────────────────
export default function ProductsManager() {
    const { canWrite } = useRole();
    const [products, setProducts] = useState<ProductSummary[]>([]);
    const [senders, setSenders] = useState<Sender[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ProductSummary | null>(null);
    const [rotating, setRotating] = useState<ProductSummary | null>(null);
    const [deleting, setDeleting] = useState<ProductSummary | null>(null);
    const [revealSecret, setRevealSecret] = useState<string | null>(null);
    const [query, setQuery] = useState("");

    async function load() {
        try {
            const [pRes, sRes] = await Promise.all([fetch("/api/products"), fetch("/api/senders")]);
            const pData: any = await pRes.json().catch(() => ({}));
            const sData: any = await sRes.json().catch(() => ({}));
            if (!pRes.ok || !pData?.ok) {
                throw new Error(pData?.message || pData?.error || "Could not load products.");
            }
            setProducts(Array.isArray(pData.products) ? (pData.products as ProductSummary[]) : []);
            // Senders are best-effort: used to label and populate the Select.
            setSenders(
                sRes.ok && sData?.ok && Array.isArray(sData.senders)
                    ? (sData.senders as Sender[])
                    : [],
            );
            setLoadError(null);
        } catch (e: any) {
            setLoadError(e?.message || "Could not load products.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function senderLabelFor(id: string | null): string | null {
        if (!id) return null;
        const s = senders.find((x) => x.id === id);
        return s ? senderLabel(s) : null;
    }

    function refresh() {
        load();
    }

    // Client-side filter (substring, case-insensitive) — preserves source order.
    const q = query.trim().toLowerCase();
    const filtered = q
        ? products.filter((p) =>
              [p.name, p.client_id, p.homepage_url ?? ""].some((v) => v.toLowerCase().includes(q)),
          )
        : products;

    // ── Render states ──
    if (loading) {
        return (
            <GlassCard sx={{ py: { xs: 6, md: 8 } }}>
                <Stack alignItems="center" spacing={2}>
                    <CircularProgress size={28} sx={{ color: ACCENT }} />
                    <Typography sx={{ color: TEXT_55, fontSize: "0.9rem" }}>
                        Loading products…
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

    return (
        <Box>
            {products.length === 0 ? (
                <EmptyState
                    icon={Inventory2Icon}
                    accent={ACCENT}
                    headline="No products yet"
                    subtext="A product groups your templates and holds the credentials your service uses to trigger sends — a public client ID and a shared secret. Create one to get started."
                    cta={
                        canWrite ? (
                            <Button
                                onClick={() => setCreateOpen(true)}
                                startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
                                sx={PRIMARY_BTN}
                            >
                                Create product
                            </Button>
                        ) : (
                            <ReadOnlyChip />
                        )
                    }
                />
            ) : (
                <Box>
                    {canWrite && (
                        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                            <Button
                                onClick={() => setCreateOpen(true)}
                                startIcon={<AddIcon sx={{ fontSize: "1.1rem !important" }} />}
                                sx={PRIMARY_BTN}
                            >
                                New product
                            </Button>
                        </Stack>
                    )}
                    <TextField
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name, client ID, or homepage…"
                        fullWidth
                        size="small"
                        sx={{ ...darkField, mb: 2 }}
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
                    {filtered.length === 0 ? (
                        <Typography
                            sx={{
                                fontSize: "0.88rem",
                                color: TEXT_55,
                                textAlign: "center",
                                py: 4,
                            }}
                        >
                            No products match &ldquo;{query.trim()}&rdquo;.
                        </Typography>
                    ) : (
                        <Stack spacing={2}>
                            {filtered.map((p) => (
                                <ProductCard
                                    key={p.id}
                                    product={p}
                                    senderLabelText={senderLabelFor(p.default_sender_id)}
                                    onEdit={() => setEditing(p)}
                                    onRotate={() => setRotating(p)}
                                    onDelete={() => setDeleting(p)}
                                />
                            ))}
                        </Stack>
                    )}
                </Box>
            )}

            <CreateDialog
                open={createOpen}
                senders={senders}
                onClose={() => setCreateOpen(false)}
                onCreated={(secret) => {
                    setRevealSecret(secret);
                    refresh();
                }}
            />
            <EditDialog
                product={editing}
                senders={senders}
                onClose={() => setEditing(null)}
                onSaved={refresh}
            />
            <RotateDialog
                product={rotating}
                onClose={() => setRotating(null)}
                onRotated={(secret) => {
                    setRevealSecret(secret);
                    refresh();
                }}
            />
            <DeleteDialog
                product={deleting}
                onClose={() => setDeleting(null)}
                onDeleted={refresh}
            />
            <SecretRevealDialog secret={revealSecret} onClose={() => setRevealSecret(null)} />
        </Box>
    );
}
