"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
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
    InputBase,
    MenuItem,
    Link as MuiLink,
    Select,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import NextLink from "next/link";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import { BORDER, SURFACE } from "./glass-card";

// ── Palette ─────────────────────────────────────────────────────────────────
const ACCENT = "var(--accent)";
const GREEN = "var(--success)";
const AMBER = "#fcd34d";
const RED = "var(--danger)";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

const MAX_RECIPIENTS = 50;

// ── Types ───────────────────────────────────────────────────────────────────
interface Sender {
    id: string;
    email: string;
    display_name: string | null;
    status: string;
}

interface Alias {
    id: string;
    from_email: string;
    from_name: string | null;
}

interface SendResult {
    to: string;
    ok: boolean;
    status: "sent" | "failed" | "suppressed";
    error: string | null;
}

interface SendSummary {
    total: number;
    sent: number;
    suppressed: number;
    failed: number;
}

function senderLabel(s: Sender): string {
    return s.display_name ? `${s.display_name} <${s.email}>` : s.email;
}

function aliasLabel(a: Alias): string {
    return a.from_name ? `${a.from_name} <${a.from_email}>` : a.from_email;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parse a raw recipients string into a deduped, lowercased list of valid emails.
function parseRecipients(raw: string): string[] {
    const seen = new Set<string>();
    for (const token of raw.split(/[\s,]+/)) {
        const e = token.trim().toLowerCase();
        if (e && EMAIL_RE.test(e)) seen.add(e);
    }
    return Array.from(seen);
}

// ── Dark inputs (mirrors the senders-manager pattern) ────────────────────────
const darkField = {
    "& .MuiOutlinedInput-root": {
        color: TEXT,
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.92rem", py: 1.05 },
    "& .MuiInputBase-input::placeholder": { color: "var(--fg-faint)", opacity: 1 },
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

const selectMenuProps = {
    slotProps: {
        paper: {
            sx: {
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                backgroundImage: "none",
                maxWidth: 360,
                "& .MuiMenuItem-root": { color: TEXT, fontSize: "0.9rem" },
                "& .MuiMenuItem-root.Mui-selected": { background: "var(--accent-tint)" },
            },
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

type PreviewState = { phase: "idle" } | { phase: "loading" } | { phase: "err"; text: string };

type SendState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ok"; summary?: SendSummary; results: SendResult[] }
    | { phase: "err"; text: string };

interface TemplateSendDialogProps {
    open: boolean;
    onClose: () => void;
    templateId: string;
    subject: string;
    variables: string[];
    getContentHtml: () => Promise<string>;
    bgColor?: string;
}

export default function TemplateSendDialog({
    open,
    onClose,
    templateId,
    subject,
    variables,
    getContentHtml,
    bgColor,
}: TemplateSendDialogProps) {
    // Recipients as chips. `chips` holds the committed emails; `recipInput` is
    // the in-progress text. Typing a comma / space / Enter commits the token.
    const [chips, setChips] = useState<string[]>([]);
    const [recipInput, setRecipInput] = useState("");

    const addTokens = (raw: string) => {
        const found: string[] = [];
        for (const tok of raw.split(/[\s,]+/)) {
            const e = tok.trim().toLowerCase();
            if (e && EMAIL_RE.test(e)) found.push(e);
        }
        if (found.length) setChips((c) => Array.from(new Set([...c, ...found])));
    };
    const onRecipInputChange = (val: string) => {
        // A separator commits everything before the last token.
        if (/[\s,]/.test(val)) {
            const parts = val.split(/[\s,]+/);
            const last = parts.pop() ?? "";
            addTokens(parts.join(","));
            setRecipInput(last);
        } else {
            setRecipInput(val);
        }
    };
    const commitRecipInput = () => {
        const e = recipInput.trim().toLowerCase();
        if (e && EMAIL_RE.test(e)) {
            addTokens(e);
            setRecipInput("");
        }
    };
    const [senders, setSenders] = useState<Sender[] | null>(null);
    const [sendersError, setSendersError] = useState<string | null>(null);
    const [senderId, setSenderId] = useState("");

    // Aliases for the chosen sender (lazy per-sender cache)
    const [aliasesBySender, setAliasesBySender] = useState<Record<string, Alias[]>>({});
    const [aliasId, setAliasId] = useState(""); // "" = mailbox default

    // Variable values
    const [vars, setVars] = useState<Record<string, string>>({});

    // Per-recipient variable values (from CSV upload)
    const [recipientVars, setRecipientVars] = useState<Record<string, Record<string, string>>>({});

    // Live snapshot of the body taken once on open (reflects unsaved editor edits).
    const contentHtmlRef = useRef<string>("");
    const subjectRef = useRef<string>(subject);

    // Preview
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [previewSubject, setPreviewSubject] = useState<string>("");
    const [previewState, setPreviewState] = useState<PreviewState>({ phase: "idle" });

    // Send
    const [send, setSend] = useState<SendState>({ phase: "idle" });
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

    const [isUploadingCsv, setIsUploadingCsv] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [csvErrors, setCsvErrors] = useState<{ row: number; error: string }[]>([]);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── On open: load senders, snapshot live edits, then preview ──
    useEffect(() => {
        if (!open) return;
        let alive = true;

        // Reset per-open state.
        setSend({ phase: "idle" });
        setSendersError(null);
        setAliasId("");
        setPreviewSubject("");

        let loadedChips: string[] | null = null;
        let loadedVars: Record<string, string> | null = null;
        try {
            const saved = localStorage.getItem(`elixpo_send_buffer_${templateId}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === "object") {
                    if (Array.isArray(parsed.chips)) loadedChips = parsed.chips;
                    if (parsed.vars && typeof parsed.vars === "object") loadedVars = parsed.vars;
                }
            }
        } catch (e) {
            console.error("Failed to load send buffer from localStorage", e);
        }

        if (loadedChips !== null) {
            setChips(loadedChips);
        } else {
            setChips([]);
        }

        setVars(() => {
            const next: Record<string, string> = {};
            const sourceVars = loadedVars || {};
            for (const name of variables) {
                next[name] = sourceVars[name] ?? "";
            }
            return next;
        });

        // Snapshot the live subject + body so preview/send reflect unsaved edits.
        subjectRef.current = subject;

        (async () => {
            try {
                contentHtmlRef.current = await getContentHtml();
            } catch {
                contentHtmlRef.current = "";
            }
            if (!alive) return;

            // Load senders for the Select.
            try {
                const res = await fetch("/api/senders");
                const d = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    senders?: Sender[];
                };
                if (!alive) return;
                if (!res.ok || !d?.ok) throw new Error(d?.error || "Could not load senders.");
                const list: Sender[] = Array.isArray(d.senders) ? d.senders : [];
                setSenders(list);
                // Default to the first active sender (or first).
                setSenderId((cur) => {
                    if (cur && list.some((s) => s.id === cur)) return cur;
                    const active = list.find((s) => s.status === "active");
                    return (active ?? list[0])?.id ?? "";
                });
            } catch (e) {
                if (alive) {
                    setSenders([]);
                    setSendersError(e instanceof Error ? e.message : "Could not load senders.");
                }
            }

            // Kick off the first preview with the freshly snapshotted body.
            if (alive) refreshPreview();
        })();

        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        try {
            const data = { chips, vars };
            localStorage.setItem(`elixpo_send_buffer_${templateId}`, JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save send buffer to localStorage", e);
        }
    }, [chips, vars, templateId, open]);

    // ── Lazy-load aliases when a sender is chosen ──
    useEffect(() => {
        if (!open || !senderId) return;
        if (aliasesBySender[senderId] != null) return;
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`/api/senders/${senderId}/aliases`);
                const d = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    aliases?: Alias[];
                };
                if (!alive) return;
                const list: Alias[] = res.ok && d?.ok && Array.isArray(d.aliases) ? d.aliases : [];
                setAliasesBySender((m) => ({ ...m, [senderId]: list }));
            } catch {
                if (alive) setAliasesBySender((m) => ({ ...m, [senderId]: [] }));
            }
        })();
        return () => {
            alive = false;
        };
    }, [open, senderId, aliasesBySender]);

    // ── Preview (POST /preview with the live snapshot + current vars) ──
    const refreshPreview = useCallback(async () => {
        setPreviewState({ phase: "loading" });
        try {
            const res = await fetch(`/api/templates/${templateId}/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vars,
                    subject: subjectRef.current,
                    contentHtml: contentHtmlRef.current,
                    bgColor,
                }),
            });
            const d = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                html?: string;
                subject?: string;
            };
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Could not render the preview.");
            setPreviewHtml(typeof d.html === "string" ? d.html : "");
            setPreviewSubject(typeof d.subject === "string" ? d.subject : "");
            setPreviewState({ phase: "idle" });
        } catch (e) {
            setPreviewState({
                phase: "err",
                text: e instanceof Error ? e.message : "Could not render the preview.",
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, vars, bgColor]);

    // ── Auto-refresh preview on variable changes (debounced ~400ms) ──
    useEffect(() => {
        if (!open) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            refreshPreview();
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vars, open]);

    const currentAliases = aliasesBySender[senderId] ?? [];
    const hasSenders = (senders?.length ?? 0) > 0;

    // Committed chips plus any valid email still in the input box.
    const parsed = parseRecipients([...chips, recipInput].join(","));
    const recipientCount = parsed.length;
    const overLimit = recipientCount > MAX_RECIPIENTS;

    async function sendNow() {
        if (!senderId || recipientCount === 0 || overLimit) return;
        setSend({ phase: "loading" });
        try {
            const res = await fetch(`/api/templates/${templateId}/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: parsed.join(", "),
                    vars,
                    recipientVars,
                    senderId,
                    aliasId: aliasId || undefined,
                    subject: subjectRef.current,
                    contentHtml: contentHtmlRef.current,
                    bgColor,
                }),
            });
            const d = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                summary?: SendSummary;
                results?: SendResult[];
                error?: string;
            };
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Send failed.");
            const results: SendResult[] = Array.isArray(d.results) ? d.results : [];
            setSend({ phase: "ok", summary: d.summary, results });
            const s = d.summary;
            const summaryText = s
                ? `Sent ${s.sent} · ${s.suppressed} suppressed · ${s.failed} failed`
                : `Sent to ${results.length} recipient${results.length === 1 ? "" : "s"}`;
            setToast({ text: summaryText, ok: (s?.failed ?? 0) === 0 });

            try {
                localStorage.removeItem(`elixpo_send_buffer_${templateId}`);
            } catch (e) {
                console.error("Failed to clear send buffer from localStorage", e);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Send failed.";
            setSend({ phase: "err", text: msg });
            setToast({ text: `Send failed — ${msg}`, ok: false });
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingCsv(true);
        setCsvErrors([]);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/csv/parse", {
                method: "POST",
                body: formData,
            });

            const d = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                validRecipients?: { email: string; vars: Record<string, string> }[];
                malformedRows?: { row: number; error: string }[];
            };
            if (!res.ok || !d?.ok) throw new Error(d?.error || "CSV parsing failed.");

            const validRecipients = d.validRecipients || [];
            if (validRecipients.length > 0) {
                const newEmails = validRecipients.map((r) => r.email);
                setChips((c) => Array.from(new Set([...c, ...newEmails])));

                // Map new recipient variables
                setRecipientVars((current) => {
                    const updated = { ...current };
                    for (const { email, vars } of validRecipients) {
                        if (Object.keys(vars).length > 0) {
                            updated[email] = { ...(updated[email] || {}), ...vars };
                        }
                    }
                    return updated;
                });
            }

            if (d.malformedRows && d.malformedRows.length > 0) {
                setCsvErrors(d.malformedRows);
                setToast({
                    text: `CSV parsed: ${validRecipients.length} valid, ${d.malformedRows.length} errors.`,
                    ok: false,
                });
            } else {
                setToast({
                    text: `CSV parsed: added ${validRecipients.length} valid emails.`,
                    ok: true,
                });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Upload failed.";
            setToast({ text: msg, ok: false });
        } finally {
            setIsUploadingCsv(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const canSend =
        recipientCount > 0 && !overLimit && !!senderId && hasSenders && send.phase !== "loading";

    return (
        <Dialog
            open={open}
            onClose={() => send.phase !== "loading" && onClose()}
            fullWidth
            maxWidth={false}
            slotProps={{
                paper: {
                    sx: {
                        background: SURFACE,
                        border: `1px solid ${BORDER}`,
                        borderRadius: "16px",
                        backgroundImage: "none",
                        width: "90vw",
                        height: "90vh",
                        maxWidth: "1400px",
                        m: 0,
                    },
                },
            }}
        >
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.2rem", pb: 0.5 }}>
                Send now
            </DialogTitle>
            <Typography sx={{ px: 3, pb: 1, fontSize: "0.82rem", color: TEXT_55, lineHeight: 1.5 }}>
                A one-time send — no webhook needed. Each send is recorded in your delivery logs.
            </Typography>
            <DialogContent sx={{ pb: 1 }}>
                <Box
                    sx={{
                        display: "grid",
                        gap: 2.5,
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        mt: 0.5,
                    }}
                >
                    {/* ── Left column: recipients, sender, send-as, variables ── */}
                    <Stack spacing={2.2}>
                        <Box>
                            <FieldLabel>Recipients (required)</FieldLabel>
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                style={{ display: "none" }}
                                onChange={handleFileUpload}
                            />
                            <Box
                                onClick={(e) => {
                                    const input = (e.currentTarget as HTMLElement).querySelector(
                                        "input",
                                    );
                                    (input as HTMLInputElement | null)?.focus();
                                }}
                                sx={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 0.6,
                                    alignItems: "center",
                                    minHeight: 80,
                                    alignContent: "flex-start",
                                    p: 1,
                                    borderRadius: "10px",
                                    border: `1px solid ${BORDER}`,
                                    background: "var(--surface-2)",
                                    cursor: "text",
                                    "&:focus-within": { borderColor: "var(--accent)" },
                                }}
                            >
                                {chips.map((email) => (
                                    <Chip
                                        key={email}
                                        label={email}
                                        size="small"
                                        onDelete={() =>
                                            setChips((c) => c.filter((x) => x !== email))
                                        }
                                        sx={{
                                            height: 24,
                                            fontSize: "0.76rem",
                                            color: "var(--fg)",
                                            bgcolor: "var(--accent-tint)",
                                            border: "1px solid var(--accent-border)",
                                            "& .MuiChip-deleteIcon": {
                                                color: "var(--fg-muted)",
                                                "&:hover": { color: "var(--danger)" },
                                            },
                                        }}
                                    />
                                ))}
                                <InputBase
                                    value={recipInput}
                                    onChange={(e) => onRecipInputChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === ",") {
                                            e.preventDefault();
                                            commitRecipInput();
                                        } else if (
                                            e.key === "Backspace" &&
                                            recipInput === "" &&
                                            chips.length
                                        ) {
                                            setChips((c) => c.slice(0, -1));
                                        }
                                    }}
                                    onBlur={commitRecipInput}
                                    onPaste={(e) => {
                                        const text = e.clipboardData.getData("text");
                                        if (/[\s,]/.test(text)) {
                                            e.preventDefault();
                                            onRecipInputChange(`${recipInput}${text} `);
                                        }
                                    }}
                                    placeholder={
                                        chips.length ? "Add another…" : "alice@example.com, bob@…"
                                    }
                                    sx={{
                                        flex: 1,
                                        minWidth: 140,
                                        px: 0.5,
                                        color: "var(--fg)",
                                        fontSize: "0.86rem",
                                        "& input::placeholder": {
                                            color: "var(--fg-faint)",
                                            opacity: 1,
                                        },
                                    }}
                                />
                            </Box>

                            <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                                sx={{ mt: 1 }}
                            >
                                <Box>
                                    <Typography
                                        sx={{ fontSize: "0.72rem", color: TEXT_40, mx: 0.2 }}
                                    >
                                        Type an email then comma or Enter to add it. Up to{" "}
                                        {MAX_RECIPIENTS}.
                                    </Typography>
                                    <Typography
                                        sx={{
                                            mt: 0.2,
                                            fontSize: "0.78rem",
                                            fontWeight: 600,
                                            color: overLimit
                                                ? RED
                                                : recipientCount > 0
                                                  ? GREEN
                                                  : TEXT_40,
                                        }}
                                    >
                                        {recipientCount === 0
                                            ? "No valid recipients yet"
                                            : `${recipientCount} valid recipient${recipientCount === 1 ? "" : "s"}${
                                                  overLimit
                                                      ? ` — over the limit of ${MAX_RECIPIENTS}`
                                                      : ""
                                              }`}
                                    </Typography>
                                </Box>

                                <Button
                                    size="small"
                                    startIcon={
                                        isUploadingCsv ? (
                                            <CircularProgress
                                                size={12}
                                                sx={{ color: "var(--fg-muted)" }}
                                            />
                                        ) : (
                                            <FileUploadIcon
                                                sx={{ fontSize: "1.1rem !important" }}
                                            />
                                        )
                                    }
                                    disabled={isUploadingCsv}
                                    onClick={() => fileInputRef.current?.click()}
                                    sx={{ ...GHOST_BTN, py: 0.5, px: 1.5 }}
                                >
                                    Upload CSV
                                </Button>
                            </Stack>
                            {csvErrors.length > 0 && (
                                <Box
                                    sx={{
                                        mt: 1,
                                        p: 1,
                                        borderRadius: "6px",
                                        background: "rgba(239,68,68,0.1)",
                                        border: "1px solid rgba(239,68,68,0.3)",
                                        maxHeight: 120,
                                        overflowY: "auto",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.72rem",
                                            color: RED,
                                            fontWeight: 700,
                                            mb: 0.5,
                                        }}
                                    >
                                        CSV Errors ({csvErrors.length})
                                    </Typography>
                                    {csvErrors.map((err, idx) => (
                                        <Typography
                                            key={idx}
                                            sx={{ fontSize: "0.7rem", color: RED, lineHeight: 1.4 }}
                                        >
                                            Row {err.row}: {err.error}
                                        </Typography>
                                    ))}
                                </Box>
                            )}
                        </Box>

                        <Box>
                            <FieldLabel>Sender (required)</FieldLabel>
                            {hasSenders ? (
                                <Select
                                    value={senderId}
                                    onChange={(e) => {
                                        setSenderId(e.target.value);
                                        setAliasId("");
                                    }}
                                    fullWidth
                                    size="small"
                                    displayEmpty
                                    sx={darkSelect}
                                    MenuProps={selectMenuProps}
                                >
                                    {(senders ?? []).map((s) => (
                                        <MenuItem key={s.id} value={s.id}>
                                            {senderLabel(s)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            ) : (
                                <Box
                                    sx={{
                                        px: 1.6,
                                        py: 1.2,
                                        borderRadius: "10px",
                                        background: "rgba(95,182,255,0.06)",
                                        border: "1px solid rgba(95,182,255,0.22)",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.82rem",
                                            color: "var(--fg-muted)",
                                            lineHeight: 1.6,
                                        }}
                                    >
                                        {sendersError ? `${sendersError} ` : ""}
                                        <MuiLink
                                            component={NextLink}
                                            href="/dashboard/senders"
                                            sx={{
                                                color: "#5fb6ff",
                                                fontWeight: 600,
                                                textDecorationColor: "rgba(95,182,255,0.4)",
                                            }}
                                        >
                                            Add a sender first
                                        </MuiLink>{" "}
                                        to send.
                                    </Typography>
                                </Box>
                            )}
                        </Box>

                        {/* Send-as (only when the chosen sender has aliases) */}
                        {currentAliases.length > 0 && (
                            <Box>
                                <FieldLabel>Send as (optional)</FieldLabel>
                                <Select
                                    value={aliasId}
                                    onChange={(e) => setAliasId(e.target.value)}
                                    fullWidth
                                    size="small"
                                    displayEmpty
                                    sx={darkSelect}
                                    MenuProps={selectMenuProps}
                                >
                                    <MenuItem value="">From: mailbox</MenuItem>
                                    {currentAliases.map((a) => (
                                        <MenuItem key={a.id} value={a.id}>
                                            {aliasLabel(a)}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </Box>
                        )}

                        {/* Variables */}
                        <Box>
                            <FieldLabel>Variables</FieldLabel>
                            {variables.length > 0 ? (
                                <Stack spacing={1.4}>
                                    {variables.map((name) => (
                                        <Box key={name}>
                                            <Typography
                                                sx={{
                                                    fontFamily: "var(--font-geist-mono)",
                                                    fontSize: "0.76rem",
                                                    color: "var(--accent)",
                                                    mb: 0.5,
                                                }}
                                            >
                                                {`{{${name}}}`}
                                            </Typography>
                                            <TextField
                                                value={vars[name] ?? ""}
                                                onChange={(e) =>
                                                    setVars((m) => ({
                                                        ...m,
                                                        [name]: e.target.value,
                                                    }))
                                                }
                                                placeholder={`Value for ${name}`}
                                                fullWidth
                                                size="small"
                                                sx={darkField}
                                            />
                                        </Box>
                                    ))}
                                </Stack>
                            ) : (
                                <Typography sx={{ color: TEXT_55, fontSize: "0.84rem" }}>
                                    This template has no variables.
                                </Typography>
                            )}
                        </Box>
                    </Stack>

                    {/* ── Right column: preview ── */}
                    <Stack spacing={1.2}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <FieldLabel>Preview</FieldLabel>
                            <Button
                                onClick={refreshPreview}
                                disabled={previewState.phase === "loading"}
                                startIcon={
                                    previewState.phase === "loading" ? (
                                        <CircularProgress size={14} sx={{ color: TEXT_55 }} />
                                    ) : (
                                        <RefreshIcon sx={{ fontSize: "1rem !important" }} />
                                    )
                                }
                                sx={{
                                    textTransform: "none",
                                    color: TEXT_55,
                                    fontWeight: 600,
                                    fontSize: "0.8rem",
                                    px: 1,
                                    minWidth: 0,
                                    "&:hover": {
                                        background: "var(--accent-tint)",
                                        color: TEXT,
                                    },
                                    "&.Mui-disabled": { color: TEXT_40 },
                                }}
                            >
                                Refresh preview
                            </Button>
                        </Stack>

                        {previewState.phase === "err" ? (
                            <Box
                                sx={{
                                    px: 1.6,
                                    py: 1.4,
                                    borderRadius: "10px",
                                    background: "rgba(239,68,68,0.1)",
                                    border: "1px solid rgba(239,68,68,0.3)",
                                }}
                            >
                                <Typography
                                    sx={{ fontSize: "0.82rem", color: RED, lineHeight: 1.5 }}
                                >
                                    {previewState.text}
                                </Typography>
                            </Box>
                        ) : (
                            <Box
                                sx={{
                                    position: "relative",
                                    borderRadius: "10px",
                                    overflow: "hidden",
                                    border: `1px solid ${BORDER}`,
                                    display: "flex",
                                    flexDirection: "column",
                                    background: "var(--surface)",
                                }}
                            >
                                <Box
                                    sx={{
                                        px: 2,
                                        py: 1.5,
                                        borderBottom: `1px solid ${BORDER}`,
                                        background: "var(--overlay)",
                                        display: "flex",
                                        gap: 1,
                                        alignItems: "baseline",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.8rem",
                                            fontWeight: 700,
                                            color: TEXT_40,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            flexShrink: 0,
                                        }}
                                    >
                                        Subject:
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "0.92rem",
                                            fontWeight: 600,
                                            color: TEXT,
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {previewSubject || "(no subject)"}
                                    </Typography>
                                </Box>
                                <Box sx={{ position: "relative" }}>
                                    <iframe
                                        title="Email preview"
                                        sandbox=""
                                        srcDoc={previewHtml}
                                        style={{
                                            display: "block",
                                            width: "100%",
                                            height: "70vh",
                                            border: "none",
                                            background: "#fff",
                                        }}
                                    />
                                    {previewState.phase === "loading" && (
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                inset: 0,
                                                display: "grid",
                                                placeItems: "center",
                                                background: "rgba(19,22,29,0.4)",
                                            }}
                                        >
                                            <CircularProgress size={22} sx={{ color: ACCENT }} />
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Stack>
                </Box>

                {/* Top-level send error (validation / parse / transport) */}
                {send.phase === "err" && (
                    <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ mt: 2 }}>
                        <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                        <Typography
                            sx={{
                                fontSize: "0.82rem",
                                color: RED,
                                lineHeight: 1.5,
                                wordBreak: "break-word",
                            }}
                        >
                            {send.text}
                        </Typography>
                    </Stack>
                )}

                {/* Per-recipient results */}
                {send.phase === "ok" && (
                    <Box sx={{ mt: 2.2 }}>
                        {send.summary && (
                            <Typography
                                sx={{
                                    fontSize: "0.86rem",
                                    fontWeight: 700,
                                    color: TEXT,
                                    mb: 1,
                                }}
                            >
                                {`Sent ${send.summary.sent} · ${send.summary.suppressed} suppressed · ${send.summary.failed} failed`}
                            </Typography>
                        )}
                        <Stack
                            spacing={0.6}
                            sx={{
                                maxHeight: 220,
                                overflowY: "auto",
                                borderRadius: "10px",
                                border: `1px solid ${BORDER}`,
                                p: 1.2,
                                background: "var(--overlay)",
                            }}
                        >
                            {send.results.length === 0 ? (
                                <Typography sx={{ fontSize: "0.82rem", color: TEXT_55 }}>
                                    No per-recipient results were returned.
                                </Typography>
                            ) : (
                                send.results.map((r, i) => (
                                    <Stack
                                        key={`${r.to}-${i}`}
                                        direction="row"
                                        spacing={0.8}
                                        alignItems="flex-start"
                                    >
                                        {r.status === "sent" ? (
                                            <CheckCircleIcon
                                                sx={{ fontSize: 16, color: GREEN, mt: 0.2 }}
                                            />
                                        ) : r.status === "suppressed" ? (
                                            <Tooltip title="Recipient is unsubscribed">
                                                <WarningAmberIcon
                                                    sx={{ fontSize: 16, color: AMBER, mt: 0.2 }}
                                                />
                                            </Tooltip>
                                        ) : (
                                            <ErrorOutlineIcon
                                                sx={{ fontSize: 16, color: RED, mt: 0.2 }}
                                            />
                                        )}
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography
                                                sx={{
                                                    fontSize: "0.82rem",
                                                    color:
                                                        r.status === "sent"
                                                            ? GREEN
                                                            : r.status === "suppressed"
                                                              ? AMBER
                                                              : RED,
                                                    lineHeight: 1.45,
                                                    wordBreak: "break-word",
                                                }}
                                            >
                                                {r.to}
                                            </Typography>
                                            {r.status === "failed" && r.error && (
                                                <Typography
                                                    sx={{
                                                        fontSize: "0.76rem",
                                                        color: TEXT_55,
                                                        lineHeight: 1.4,
                                                        wordBreak: "break-word",
                                                    }}
                                                >
                                                    {r.error}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Stack>
                                ))
                            )}
                        </Stack>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={send.phase === "loading"} sx={GHOST_BTN}>
                    Close
                </Button>
                <Button
                    onClick={sendNow}
                    disabled={!canSend}
                    startIcon={
                        send.phase === "loading" ? (
                            <CircularProgress size={16} sx={{ color: "var(--fg-muted)" }} />
                        ) : (
                            <SendIcon sx={{ fontSize: "1.05rem !important" }} />
                        )
                    }
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
                    {send.phase === "loading" ? "Sending…" : "Send now"}
                </Button>
            </DialogActions>
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={toast?.ok ? 11000 : 14000}
                onClose={(_e, reason) => reason !== "clickaway" && setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, maxWidth: 460 }}>
                        <Box
                            sx={{
                                mt: "3px",
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                flexShrink: 0,
                                background: toast?.ok ? "#34d399" : "#f87171",
                            }}
                        />
                        <Box
                            sx={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                fontSize: "0.84rem",
                                lineHeight: 1.5,
                                color: toast?.ok ? "#bbf7d0" : "#fecaca",
                            }}
                        >
                            {toast?.text}
                        </Box>
                    </Box>
                }
                slotProps={{ content: { sx: { maxWidth: 520, alignItems: "flex-start" } } }}
            />
        </Dialog>
    );
}
