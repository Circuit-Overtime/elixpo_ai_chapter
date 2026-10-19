"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_NAME = 80;

export default function WorkspaceNameForm({ initialName }: { initialName: string }) {
    const router = useRouter();
    const [name, setName] = useState(initialName);
    const [baseline, setBaseline] = useState(initialName);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

    const trimmed = name.trim();
    const valid = trimmed.length >= 1 && trimmed.length <= MAX_NAME;
    const dirty = trimmed !== baseline.trim();

    async function save() {
        if (!dirty || !valid || saving) return;
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/tenant", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || "Could not save changes.");
            }
            setBaseline(trimmed);
            setName(trimmed);
            setMsg({ type: "ok", text: "Workspace name updated." });
            router.refresh(); // refresh any server-rendered usage of the name
        } catch (e: any) {
            setMsg({ type: "err", text: e?.message || "Could not save changes." });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Box>
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
                Workspace name
            </Typography>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.2}
                alignItems={{ sm: "center" }}
            >
                <TextField
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            save();
                        }
                    }}
                    placeholder="Acme Inc."
                    fullWidth
                    size="small"
                    inputProps={{ maxLength: MAX_NAME }}
                    sx={{
                        "& .MuiOutlinedInput-root": {
                            color: "var(--fg)",
                            borderRadius: "10px",
                            background: "var(--field-bg)",
                            "& fieldset": { borderColor: "var(--field-border)" },
                            "&:hover fieldset": { borderColor: "var(--accent-border)" },
                            "&.Mui-focused fieldset": { borderColor: "var(--accent)" },
                        },
                        "& .MuiInputBase-input": { fontSize: "0.95rem", py: 1.1 },
                        "& .MuiInputBase-input::placeholder": {
                            color: "var(--fg-faint)",
                            opacity: 1,
                        },
                    }}
                />
                <Button
                    onClick={save}
                    disabled={!dirty || !valid || saving}
                    sx={{
                        flexShrink: 0,
                        textTransform: "none",
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        color: "var(--accent-contrast)",
                        px: 2.4,
                        py: 1.05,
                        borderRadius: "10px",
                        minWidth: 96,
                        background: "var(--accent-gradient)",
                        boxShadow: "var(--accent-shadow)",
                        "&:hover": {
                            background: "var(--accent-gradient-hover)",
                        },
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
            </Stack>

            {msg && (
                <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 1.2 }}>
                    {msg.type === "ok" ? (
                        <CheckCircleIcon sx={{ fontSize: 16, color: "var(--success)" }} />
                    ) : (
                        <ErrorOutlineIcon sx={{ fontSize: 16, color: "var(--danger)" }} />
                    )}
                    <Typography
                        sx={{
                            fontSize: "0.82rem",
                            color: msg.type === "ok" ? "var(--success)" : "var(--danger)",
                        }}
                    >
                        {msg.text}
                    </Typography>
                </Stack>
            )}
        </Box>
    );
}
