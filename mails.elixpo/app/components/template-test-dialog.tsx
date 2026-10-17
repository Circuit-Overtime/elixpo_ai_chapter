"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Link as MuiLink,
    Select,
    Snackbar,
    Stack,
    TextField,
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
const RED = "var(--danger)";
const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const TEXT_40 = "var(--fg-faint)";

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

function senderLabel(s: Sender): string {
    return s.display_name ? `${s.display_name} <${s.email}>` : s.email;
}

function aliasLabel(a: Alias): string {
    return a.from_name ? `${a.from_name} <${a.from_email}>` : a.from_email;
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

type SendState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ok"; text: string }
    | { phase: "err"; text: string };

export default function TemplateTestDialog({
    open,
    onClose,
    templateId,
    subject,
    variables,
    getContentHtml,
    bgColor,
}: {
    open: boolean;
    onClose: () => void;
    templateId: string;
    subject: string;
    variables: string[];
    getContentHtml: () => Promise<string>;
    bgColor?: string;
}) {
    // Recipient + senders
    const [to, setTo] = useState("");
    const [senders, setSenders] = useState<Sender[] | null>(null);
    const [sendersError, setSendersError] = useState<string | null>(null);
    const [senderId, setSenderId] = useState("");

    // Aliases for the chosen sender (lazy per-sender cache)
    const [aliasesBySender, setAliasesBySender] = useState<Record<string, Alias[]>>({});
    const [aliasId, setAliasId] = useState(""); // "" = mailbox default

    // Variable values
    const [vars, setVars] = useState<Record<string, string>>({});

    // Live snapshot of the body taken once on open (reflects unsaved editor edits).
    const contentHtmlRef = useRef<string>("");
    const subjectRef = useRef<string>(subject);

    // Preview
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [previewSubject, setPreviewSubject] = useState<string>("");
    const [previewState, setPreviewState] = useState<SendState>({ phase: "idle" });

    // Send
    const [send, setSend] = useState<SendState>({ phase: "idle" });
    const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── On open: load senders + me, snapshot live edits, then preview ──
    useEffect(() => {
        if (!open) return;
        let alive = true;

        // Reset per-open state.
        setSend({ phase: "idle" });
        setSendersError(null);
        setAliasId("");
        setPreviewSubject("");

        // Seed variable values for any new variable names; keep existing.
        setVars((prev) => {
            const next: Record<string, string> = {};
            for (const name of variables) next[name] = prev[name] ?? "";
            return next;
        });

        // Snapshot the live subject + body so preview/test reflect unsaved edits.
        subjectRef.current = subject;

        (async () => {
            try {
                contentHtmlRef.current = await getContentHtml();
            } catch {
                contentHtmlRef.current = "";
            }
            if (!alive) return;

            // Default recipient to the signed-in user's email.
            try {
                const res = await fetch("/api/auth/me");
                const d: any = await res.json().catch(() => ({}));
                if (alive && d?.authenticated && d.user?.email) {
                    setTo((cur) => cur || d.user.email);
                }
            } catch {
                /* non-fatal */
            }

            // Load senders for the Select.
            try {
                const res = await fetch("/api/senders");
                const d: any = await res.json().catch(() => ({}));
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
            } catch (e: any) {
                if (alive) {
                    setSenders([]);
                    setSendersError(e?.message || "Could not load senders.");
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

    // ── Lazy-load aliases when a sender is chosen ──
    useEffect(() => {
        if (!open || !senderId) return;
        if (aliasesBySender[senderId] != null) return;
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`/api/senders/${senderId}/aliases`);
                const d: any = await res.json().catch(() => ({}));
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
            const d: any = await res.json().catch(() => ({}));
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Could not render the preview.");
            setPreviewHtml(typeof d.html === "string" ? d.html : "");
            setPreviewSubject(typeof d.subject === "string" ? d.subject : "");
            setPreviewState({ phase: "idle" });
        } catch (e: any) {
            setPreviewState({ phase: "err", text: e?.message || "Could not render the preview." });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateId, vars]);

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

    async function sendTest() {
        if (!senderId || !to.trim()) return;
        setSend({ phase: "loading" });
        try {
            const res = await fetch(`/api/templates/${templateId}/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    senderId,
                    to: to.trim(),
                    vars,
                    aliasId: aliasId || undefined,
                    subject: subjectRef.current,
                    contentHtml: contentHtmlRef.current,
                    bgColor,
                }),
            });
            const d: any = await res.json().catch(() => ({}));
            if (!res.ok || !d?.ok) throw new Error(d?.error || "Test send failed.");
            const resp = typeof d.response === "string" && d.response ? ` — ${d.response}` : "";
            setSend({ phase: "ok", text: `Sent to ${d.to}${resp}` });
            setToast({ text: `Sent to ${d.to}${resp}`, ok: true });
        } catch (e: any) {
            const msg = e?.message || "Test send failed.";
            setSend({ phase: "err", text: msg });
            setToast({ text: `Send failed — ${msg}`, ok: false });
        }
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
    const canSend = emailValid && !!senderId && hasSenders && send.phase !== "loading";

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
            <DialogTitle sx={{ color: TEXT, fontWeight: 800, fontSize: "1.2rem", pb: 1 }}>
                Preview &amp; test send
            </DialogTitle>
            <DialogContent sx={{ pb: 1 }}>
                <Box
                    sx={{
                        display: "grid",
                        gap: 2.5,
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        mt: 0.5,
                    }}
                >
                    {/* ── Left column: recipient, sender, send-as, variables ── */}
                    <Stack spacing={2.2}>
                        <Box>
                            <FieldLabel>Recipient (required)</FieldLabel>
                            <TextField
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="you@yourdomain.com"
                                fullWidth
                                size="small"
                                type="email"
                                sx={darkField}
                            />
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
                                            Connect a sender first
                                        </MuiLink>{" "}
                                        to send a test.
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

                {/* Send result line */}
                {(send.phase === "ok" || send.phase === "err") && (
                    <Stack direction="row" spacing={0.8} alignItems="flex-start" sx={{ mt: 2 }}>
                        {send.phase === "ok" ? (
                            <CheckCircleIcon sx={{ fontSize: 16, color: GREEN, mt: 0.2 }} />
                        ) : (
                            <ErrorOutlineIcon sx={{ fontSize: 16, color: RED, mt: 0.2 }} />
                        )}
                        <Typography
                            sx={{
                                fontSize: "0.82rem",
                                color: send.phase === "ok" ? GREEN : RED,
                                lineHeight: 1.5,
                                wordBreak: "break-word",
                            }}
                        >
                            {send.text}
                        </Typography>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2.2, gap: 1 }}>
                <Button onClick={onClose} disabled={send.phase === "loading"} sx={GHOST_BTN}>
                    Close
                </Button>
                <Button
                    onClick={sendTest}
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
                    Send test
                </Button>
            </DialogActions>
            <Snackbar
                open={Boolean(toast)}
                autoHideDuration={toast?.ok ? 6000 : 12000}
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
