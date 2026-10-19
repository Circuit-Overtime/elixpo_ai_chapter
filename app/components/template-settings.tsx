"use client";

import type { EmailFooter } from "@/lib/render";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BoltIcon from "@mui/icons-material/Bolt";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SaveIcon from "@mui/icons-material/Save";
import SendIcon from "@mui/icons-material/Send";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import WebhookIcon from "@mui/icons-material/Webhook";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Select,
    Snackbar,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import GlassCard from "./glass-card";
import { useRole } from "./role-provider";
import TemplateSendDialog from "./template-send-dialog";
import TemplateTestDialog from "./template-test-dialog";

const ACCENT = "#ff7759";
const TEXT = "var(--fg)";
const TEXT_60 = "var(--fg-muted)";

const darkField = {
    "& .MuiOutlinedInput-root": {
        color: TEXT,
        borderRadius: "10px",
        background: "var(--surface-2)",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.88rem", py: 0.8 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
} as const;

const darkSelect = {
    color: TEXT,
    borderRadius: "10px",
    background: "var(--surface-2)",
    fontSize: "0.88rem",
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--border)" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "var(--border)" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: ACCENT },
    "& .MuiSelect-icon": { color: "var(--fg-faint)" },
} as const;

interface ProductOpt {
    id: string;
    name: string;
}
interface SenderOpt {
    id: string;
    email: string;
    display_name: string | null;
}
interface Tmpl {
    id: string;
    name: string;
    subject: string;
    product_id: string | null;
    oneTime: boolean;
    sender_id: string | null;
    transactional: boolean;
    variables: string[];
    footer: EmailFooter | null;
    content_html: string | null;
    bg_color: string | null;
}
interface WorkspaceOpt {
    tenantId: string;
    name: string;
    slug: string | null;
    role: string;
    active: boolean;
    kind: "personal" | "shared";
}
interface TransferResult {
    destination: { id: string; name: string; slug: string | null };
    webhookCredentials?: {
        product: { client_id: string; name: string };
        secret: string;
    };
    senderReset: boolean;
}

/** Field label used across the footer editor. */
function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Typography
            sx={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: TEXT_60,
                mb: 0.5,
                letterSpacing: "0.02em",
            }}
        >
            {children}
        </Typography>
    );
}

const FOOTER_FIELDS: { key: keyof EmailFooter; label: string; placeholder: string }[] = [
    { key: "name", label: "Brand name", placeholder: "Acme Inc." },
    { key: "logoUrl", label: "Logo URL", placeholder: "https://…/logo.png" },
    { key: "homepageUrl", label: "Homepage", placeholder: "https://acme.com" },
    { key: "supportEmail", label: "Support email", placeholder: "support@acme.com" },
    { key: "address", label: "Address", placeholder: "123 Main St, City" },
    { key: "phone", label: "Phone", placeholder: "+1 555 123 4567" },
    { key: "quote", label: "Tagline", placeholder: "Building in the open." },
];

export default function TemplateSettings({ templateId }: { templateId: string }) {
    const { canWrite } = useRole();
    const [tmpl, setTmpl] = useState<Tmpl | null>(null);
    const [products, setProducts] = useState<ProductOpt[]>([]);
    const [senders, setSenders] = useState<SenderOpt[]>([]);
    const [loading, setLoading] = useState(true);

    // Editable settings.
    const [mode, setMode] = useState<"one_time" | "webhook">("one_time");
    const [productId, setProductId] = useState("");
    const [senderId, setSenderId] = useState("");
    const [transactional, setTransactional] = useState(false);
    const [footer, setFooter] = useState<EmailFooter>({});

    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sendOpen, setSendOpen] = useState(false);
    const [testOpen, setTestOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState<WorkspaceOpt[]>([]);
    const [transferOpen, setTransferOpen] = useState(false);
    const [destinationTenantId, setDestinationTenantId] = useState("");
    const [confirmationName, setConfirmationName] = useState("");
    const [transferring, setTransferring] = useState(false);
    const [transferError, setTransferError] = useState("");
    const [transferResult, setTransferResult] = useState<TransferResult | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [tRes, pRes, sRes, meRes] = await Promise.all([
                    fetch(`/api/templates/${templateId}`),
                    fetch("/api/products"),
                    fetch("/api/senders"),
                    fetch("/api/auth/me"),
                ]);
                const tData: any = await tRes.json();
                const pData: any = await pRes.json().catch(() => ({}));
                const sData: any = await sRes.json().catch(() => ({}));
                const meData: any = await meRes.json().catch(() => ({}));
                if (!alive) return;
                if (!tRes.ok || !tData?.ok)
                    throw new Error(tData?.error || "Could not load template.");
                const t: Tmpl = tData.template;
                setTmpl(t);
                setMode(t.product_id ? "webhook" : "one_time");
                setProductId(t.product_id || "");
                setSenderId(t.sender_id || "");
                setTransactional(!!t.transactional);
                setFooter(t.footer || {});
                if (Array.isArray(pData?.products)) setProducts(pData.products);
                if (Array.isArray(sData?.senders)) setSenders(sData.senders);
                if (Array.isArray(meData?.workspaces)) setWorkspaces(meData.workspaces);
            } catch (e: any) {
                if (alive) setError(e?.message || "Could not load settings.");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [templateId]);

    const setFooterField = useCallback((key: keyof EmailFooter, value: string) => {
        setFooter((f) => ({ ...f, [key]: value || null }));
    }, []);

    async function save() {
        if (saving) return;
        if (mode === "webhook" && !productId) {
            setError("Pick a product for a webhook-based template.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const body: any = {
                productId: mode === "webhook" ? productId : null,
                senderId: senderId || null,
                transactional,
            };
            // Only one-time templates carry their own footer.
            if (mode === "one_time") body.footer = footer;
            const res = await fetch(`/api/templates/${templateId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d: any = await res.json().catch(() => ({}));
            if (!res.ok || !d?.ok) throw new Error(d?.message || d?.error || "Could not save.");
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 2500);
        } catch (e: any) {
            setError(e?.message || "Could not save.");
        } finally {
            setSaving(false);
        }
    }

    const writableDestinations = workspaces.filter(
        (workspace) =>
            !workspace.active &&
            (workspace.role === "owner" ||
                workspace.role === "admin" ||
                workspace.role === "writer"),
    );

    async function transfer() {
        if (!tmpl || transferring || confirmationName !== tmpl.name || !destinationTenantId) return;
        setTransferring(true);
        setTransferError("");
        try {
            const res = await fetch(`/api/templates/${templateId}/transfer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ destinationTenantId, confirmed: true }),
            });
            const data = (await res.json().catch(() => ({}))) as TransferResult & {
                ok?: boolean;
                message?: string;
            };
            if (!res.ok || !data.ok)
                throw new Error(data.message || "Could not transfer template.");
            setTransferResult(data);
        } catch (e) {
            setTransferError(e instanceof Error ? e.message : "Could not transfer template.");
        } finally {
            setTransferring(false);
        }
    }

    async function openTransferredTemplate() {
        if (!transferResult) return;
        const res = await fetch("/api/workspace/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId: transferResult.destination.id }),
        });
        if (res.ok) window.location.href = `/dashboard/templates/${templateId}`;
    }

    if (loading) {
        return (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 320 }}>
                <CircularProgress sx={{ color: ACCENT }} />
            </Box>
        );
    }
    if (!tmpl) {
        return (
            <Box sx={{ p: 4 }}>
                <Typography sx={{ color: "var(--danger)" }}>
                    {error || "Template not found."}
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ maxWidth: 760, mx: "auto", pb: 6 }}>
            {/* Header */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2.5, gap: 2 }}
            >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
                    <Button
                        component={Link}
                        href={`/dashboard/templates/${templateId}`}
                        startIcon={<ArrowBackIcon sx={{ fontSize: "1.1rem !important" }} />}
                        sx={{ textTransform: "none", color: TEXT_60, minWidth: 0 }}
                    >
                        Editor
                    </Button>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", color: TEXT }}>
                            Settings
                        </Typography>
                        <Typography sx={{ fontSize: "0.8rem", color: TEXT_60 }}>
                            {tmpl.name}
                        </Typography>
                    </Box>
                </Stack>
                <Button
                    onClick={save}
                    disabled={saving}
                    startIcon={
                        saving ? (
                            <CircularProgress size={15} sx={{ color: "var(--fg-muted)" }} />
                        ) : (
                            <SaveIcon sx={{ fontSize: "1.05rem !important" }} />
                        )
                    }
                    sx={PRIMARY_BTN}
                >
                    Save settings
                </Button>
            </Stack>

            {error && (
                <Box
                    sx={{
                        mb: 2,
                        px: 2,
                        py: 1,
                        borderRadius: "10px",
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "var(--danger)",
                        fontSize: "0.85rem",
                    }}
                >
                    {error}
                </Box>
            )}

            <Stack spacing={2}>
                {/* Delivery type */}
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT, mb: 0.4 }}>
                        Delivery type
                    </Typography>
                    <Typography sx={{ fontSize: "0.82rem", color: TEXT_60, mb: 1.6 }}>
                        How this template is sent.
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <TypeCard
                            active={mode === "one_time"}
                            icon={<SendIcon sx={{ fontSize: 20 }} />}
                            title="One-time"
                            body="Compose and send directly to recipients. No product, no webhook."
                            onClick={() => setMode("one_time")}
                        />
                        <TypeCard
                            active={mode === "webhook"}
                            icon={<WebhookIcon sx={{ fontSize: 20 }} />}
                            title="Webhook"
                            body="Attach to a product and trigger sends from your app via a signed webhook."
                            onClick={() => setMode("webhook")}
                        />
                    </Stack>

                    {mode === "webhook" && (
                        <Box sx={{ mt: 2 }}>
                            <FieldLabel>Product</FieldLabel>
                            <Select
                                value={products.some((p) => p.id === productId) ? productId : ""}
                                onChange={(e) => setProductId(e.target.value)}
                                fullWidth
                                size="small"
                                displayEmpty
                                sx={darkSelect}
                            >
                                <MenuItem value="" disabled>
                                    Choose a product…
                                </MenuItem>
                                {products.map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                        {p.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            <Typography sx={{ mt: 0.6, fontSize: "0.74rem", color: TEXT_60 }}>
                                The template inherits this product's footer and signing secret.
                            </Typography>
                        </Box>
                    )}
                </GlassCard>

                {/* Footer (one-time only) */}
                {mode === "one_time" && (
                    <GlassCard sx={{ p: 2.5 }}>
                        <Typography
                            sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT, mb: 0.4 }}
                        >
                            Footer
                        </Typography>
                        <Typography sx={{ fontSize: "0.82rem", color: TEXT_60, mb: 1.6 }}>
                            One-time templates carry their own footer (no product to inherit from).
                            Leave blank for just the Elixpo Mails attribution.
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1.4,
                                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            }}
                        >
                            {FOOTER_FIELDS.map((f) => (
                                <Box key={f.key}>
                                    <FieldLabel>{f.label}</FieldLabel>
                                    <TextField
                                        value={(footer[f.key] as string) || ""}
                                        onChange={(e) => setFooterField(f.key, e.target.value)}
                                        placeholder={f.placeholder}
                                        fullWidth
                                        size="small"
                                        sx={darkField}
                                    />
                                </Box>
                            ))}
                        </Box>
                    </GlassCard>
                )}

                {/* Sender + transactional */}
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT, mb: 1.6 }}>
                        Sending
                    </Typography>
                    <FieldLabel>Sender override</FieldLabel>
                    <Select
                        value={senders.some((s) => s.id === senderId) ? senderId : ""}
                        onChange={(e) => setSenderId(e.target.value)}
                        fullWidth
                        size="small"
                        displayEmpty
                        sx={darkSelect}
                    >
                        <MenuItem value="">Use the default sender</MenuItem>
                        {senders.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                                {s.display_name ? `${s.display_name} <${s.email}>` : s.email}
                            </MenuItem>
                        ))}
                    </Select>

                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 2 }}>
                        <Switch
                            checked={transactional}
                            onChange={(e) => setTransactional(e.target.checked)}
                            size="small"
                            sx={{
                                "& .Mui-checked": { color: ACCENT },
                                "& .Mui-checked + .MuiSwitch-track": {
                                    backgroundColor: `${ACCENT} !important`,
                                },
                            }}
                        />
                        <Box>
                            <Typography sx={{ fontSize: "0.85rem", color: TEXT, fontWeight: 600 }}>
                                Transactional
                            </Typography>
                            <Typography sx={{ fontSize: "0.74rem", color: TEXT_60 }}>
                                Always sends (even to unsubscribed recipients) and carries no
                                unsubscribe link.
                            </Typography>
                        </Box>
                    </Stack>
                </GlassCard>

                {/* Variables */}
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT, mb: 0.4 }}>
                        Variables
                    </Typography>
                    <Typography sx={{ fontSize: "0.82rem", color: TEXT_60, mb: 1.4 }}>
                        Declared with <code>{"{{name}}"}</code> in the subject or body. Filled in
                        per send.
                    </Typography>
                    {tmpl.variables.length ? (
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.7 }}>
                            {tmpl.variables.map((v) => (
                                <Chip
                                    key={v}
                                    label={`{{${v}}}`}
                                    size="small"
                                    sx={{
                                        height: 24,
                                        fontFamily: "var(--font-geist-mono)",
                                        fontSize: "0.74rem",
                                        color: ACCENT,
                                        bgcolor: "var(--accent-tint)",
                                        border: "1px solid var(--accent-border)",
                                    }}
                                />
                            ))}
                        </Stack>
                    ) : (
                        <Typography sx={{ fontSize: "0.82rem", color: "var(--fg-faint)" }}>
                            No variables yet.
                        </Typography>
                    )}
                </GlassCard>

                {/* Send */}
                <GlassCard sx={{ p: 2.5, border: "1px solid rgba(245,158,11,0.28)" }}>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        alignItems={{ sm: "center" }}
                        justifyContent="space-between"
                        spacing={2}
                    >
                        <Box>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.4 }}>
                                <SwapHorizIcon sx={{ color: "#f59e0b", fontSize: 20 }} />
                                <Typography
                                    sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT }}
                                >
                                    Transfer ownership
                                </Typography>
                            </Stack>
                            <Typography sx={{ fontSize: "0.82rem", color: TEXT_60, maxWidth: 520 }}>
                                Move this template, its attachments, and webhook events to another
                                workspace where you have writer access or higher.
                            </Typography>
                        </Box>
                        <Button
                            onClick={() => {
                                setTransferError("");
                                setTransferOpen(true);
                            }}
                            disabled={!canWrite || writableDestinations.length === 0}
                            startIcon={<SwapHorizIcon />}
                            sx={{ ...GHOST_BTN, whiteSpace: "nowrap" }}
                        >
                            Transfer template
                        </Button>
                    </Stack>
                    {(!canWrite || writableDestinations.length === 0) && (
                        <Typography sx={{ mt: 1.2, fontSize: "0.76rem", color: "var(--fg-faint)" }}>
                            {!canWrite
                                ? "You need writer access or higher in the current workspace to transfer this template."
                                : "No other workspace currently grants you writer, admin, or owner access."}
                        </Typography>
                    )}
                </GlassCard>

                {/* Send */}
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: TEXT, mb: 0.4 }}>
                        {mode === "webhook" ? "Send manually" : "Whom to send"}
                    </Typography>
                    <Typography sx={{ fontSize: "0.82rem", color: TEXT_60, mb: 1.6 }}>
                        {mode === "webhook"
                            ? "This template is normally triggered by your product's webhook. You can also send it manually."
                            : "Send this template to one or more recipients."}
                    </Typography>
                    <Stack direction="row" spacing={1.2}>
                        <Button
                            onClick={() => setTestOpen(true)}
                            startIcon={<BoltIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={GHOST_BTN}
                        >
                            Test send
                        </Button>
                        <Button
                            onClick={() => setSendOpen(true)}
                            startIcon={<SendIcon sx={{ fontSize: "1.05rem !important" }} />}
                            sx={PRIMARY_BTN}
                        >
                            Send now
                        </Button>
                    </Stack>
                </GlassCard>
            </Stack>

            <TemplateTestDialog
                open={testOpen}
                onClose={() => setTestOpen(false)}
                templateId={templateId}
                subject={tmpl.subject}
                variables={tmpl.variables}
                getContentHtml={async () => tmpl.content_html || ""}
                bgColor={tmpl.bg_color || undefined}
            />
            <TemplateSendDialog
                open={sendOpen}
                onClose={() => setSendOpen(false)}
                templateId={templateId}
                subject={tmpl.subject}
                variables={tmpl.variables}
                getContentHtml={async () => tmpl.content_html || ""}
                bgColor={tmpl.bg_color || undefined}
            />

            <Dialog
                open={transferOpen}
                onClose={() => !transferring && !transferResult && setTransferOpen(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{
                    sx: {
                        bgcolor: "var(--menu-surface)",
                        color: TEXT,
                        border: "1px solid var(--border)",
                        borderRadius: "14px",
                    },
                }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>
                    {transferResult ? "Template transferred" : "Transfer template"}
                </DialogTitle>
                <DialogContent>
                    {transferResult ? (
                        <Stack spacing={2}>
                            <Alert severity="success">
                                Moved to {transferResult.destination.name}. Attachments and webhook
                                endpoints were preserved.
                            </Alert>
                            {transferResult.webhookCredentials && (
                                <Alert severity="warning" icon={<WarningAmberIcon />}>
                                    <Typography sx={{ fontWeight: 800, fontSize: "0.86rem" }}>
                                        Save the new webhook secret now
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.78rem", mb: 1 }}>
                                        The destination product has new credentials. This secret is
                                        shown only once.
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                        Client ID
                                    </Typography>
                                    <Typography
                                        component="code"
                                        sx={{ display: "block", wordBreak: "break-all", mb: 1 }}
                                    >
                                        {transferResult.webhookCredentials.product.client_id}
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.72rem", fontWeight: 700 }}>
                                        Secret
                                    </Typography>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Typography
                                            component="code"
                                            sx={{ wordBreak: "break-all", flex: 1 }}
                                        >
                                            {transferResult.webhookCredentials.secret}
                                        </Typography>
                                        <Button
                                            onClick={() =>
                                                navigator.clipboard.writeText(
                                                    transferResult.webhookCredentials?.secret || "",
                                                )
                                            }
                                            startIcon={<ContentCopyIcon />}
                                            sx={GHOST_BTN}
                                        >
                                            Copy
                                        </Button>
                                    </Stack>
                                </Alert>
                            )}
                            {transferResult.senderReset && (
                                <Typography sx={{ color: TEXT_60, fontSize: "0.8rem" }}>
                                    Sender credentials were not copied. Choose a sender owned by the
                                    destination workspace before sending.
                                </Typography>
                            )}
                        </Stack>
                    ) : (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <Alert severity="warning" icon={<WarningAmberIcon />}>
                                This moves the template out of the current workspace. Historical
                                delivery logs and sender credentials remain here. Save any pending
                                settings changes first.
                            </Alert>
                            <Box>
                                <FieldLabel>Destination workspace</FieldLabel>
                                <Select
                                    value={destinationTenantId}
                                    onChange={(e) => setDestinationTenantId(e.target.value)}
                                    displayEmpty
                                    fullWidth
                                    size="small"
                                    sx={darkSelect}
                                >
                                    <MenuItem value="" disabled>
                                        Choose a workspace…
                                    </MenuItem>
                                    {writableDestinations.map((workspace) => (
                                        <MenuItem
                                            key={workspace.tenantId}
                                            value={workspace.tenantId}
                                        >
                                            {workspace.name} · {workspace.role}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>
                            <Box>
                                <FieldLabel>
                                    Type “{tmpl.name}” to confirm this ownership transfer
                                </FieldLabel>
                                <TextField
                                    value={confirmationName}
                                    onChange={(e) => setConfirmationName(e.target.value)}
                                    placeholder={tmpl.name}
                                    fullWidth
                                    size="small"
                                    sx={darkField}
                                />
                            </Box>
                            {transferError && (
                                <Typography sx={{ color: "var(--danger)", fontSize: "0.82rem" }}>
                                    {transferError}
                                </Typography>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    {transferResult ? (
                        <Button onClick={openTransferredTemplate} sx={PRIMARY_BTN}>
                            Open in {transferResult.destination.name}
                        </Button>
                    ) : (
                        <>
                            <Button onClick={() => setTransferOpen(false)} sx={GHOST_BTN}>
                                Cancel
                            </Button>
                            <Button
                                onClick={transfer}
                                disabled={
                                    transferring ||
                                    !destinationTenantId ||
                                    confirmationName !== tmpl.name
                                }
                                sx={{
                                    ...PRIMARY_BTN,
                                    background: "linear-gradient(135deg, #d97706, #f59e0b)",
                                }}
                            >
                                {transferring ? <CircularProgress size={18} /> : "Confirm transfer"}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            <Snackbar
                open={savedMsg}
                autoHideDuration={2500}
                onClose={() => setSavedMsg(false)}
                message="Settings saved"
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
}

function TypeCard({
    active,
    icon,
    title,
    body,
    onClick,
}: {
    active: boolean;
    icon: React.ReactNode;
    title: string;
    body: string;
    onClick: () => void;
}) {
    return (
        <Box
            component="button"
            type="button"
            onClick={onClick}
            sx={{
                flex: 1,
                p: 1.6,
                borderRadius: "12px",
                cursor: "pointer",
                appearance: "none",
                font: "inherit",
                textAlign: "left",
                border: `1.5px solid ${active ? ACCENT : "var(--border)"}`,
                background: active ? "var(--accent-tint)" : "var(--surface-2)",
                transition: "all 0.15s ease",
                "&:hover": { borderColor: ACCENT },
            }}
        >
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 0.6, color: active ? ACCENT : TEXT }}
            >
                {icon}
                <Typography sx={{ fontWeight: 700, fontSize: "0.92rem" }}>{title}</Typography>
            </Stack>
            <Typography sx={{ fontSize: "0.78rem", color: TEXT_60, lineHeight: 1.5 }}>
                {body}
            </Typography>
        </Box>
    );
}
