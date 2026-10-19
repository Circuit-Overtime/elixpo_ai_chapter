"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloudIcon from "@mui/icons-material/Cloud";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { GlassCard } from "./glass-card";
import { useRole } from "./role-provider";

const TEXT = "var(--fg)";
const TEXT_55 = "var(--fg-muted)";
const ACCENT = "var(--accent)";

interface Status {
    configured: boolean;
    connected: boolean;
    email: string | null;
}

const NOTICES: Record<string, { sev: "success" | "error" | "info" | "warning"; msg: string }> = {
    connected: { sev: "success", msg: "Google Drive connected." },
    error: { sev: "error", msg: "Couldn't connect Google Drive. Please try again." },
    denied: { sev: "info", msg: "Drive connection was cancelled." },
    not_configured: { sev: "warning", msg: "Google Drive isn't set up on this workspace yet." },
};

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

export default function DriveConnectionCard() {
    const { canWrite } = useRole();
    const [status, setStatus] = useState<Status | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{
        sev: "success" | "error" | "info" | "warning";
        msg: string;
    } | null>(null);

    async function load() {
        try {
            const d: any = await fetch("/api/drive/status").then((r) => r.json());
            if (d?.ok)
                setStatus({ configured: d.configured, connected: d.connected, email: d.email });
            else setStatus({ configured: false, connected: false, email: null });
        } catch {
            setStatus({ configured: false, connected: false, email: null });
        }
    }

    useEffect(() => {
        load();
        // Surface the ?drive= result from the OAuth round-trip, then clean the URL.
        const sp = new URLSearchParams(window.location.search);
        const key = sp.get("drive");
        if (key && NOTICES[key]) {
            setNotice(NOTICES[key]);
            const url = new URL(window.location.href);
            url.searchParams.delete("drive");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

    async function disconnect() {
        if (busy) return;
        setBusy(true);
        try {
            await fetch("/api/drive/disconnect", { method: "POST" });
            await load();
            setNotice({ sev: "info", msg: "Google Drive disconnected." });
        } finally {
            setBusy(false);
        }
    }

    return (
        <GlassCard>
            <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 0.4 }}>
                <Typography sx={{ fontWeight: 700, fontSize: "1.05rem", color: TEXT }}>
                    Connections
                </Typography>
                <Chip
                    label="Google Drive"
                    size="small"
                    sx={{
                        height: 20,
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        color: TEXT_55,
                        bgcolor: "var(--overlay)",
                        border: "1px solid var(--border)",
                    }}
                />
            </Stack>
            <Typography sx={{ color: TEXT_55, fontSize: "0.88rem", mb: 2.2 }}>
                Connect your workspace&rsquo;s Google Drive to attach files to emails. We only
                access files you pick — nothing else in your Drive.
            </Typography>

            {notice && (
                <Alert
                    severity={notice.sev}
                    sx={{ mb: 2, fontSize: "0.85rem" }}
                    onClose={() => setNotice(null)}
                >
                    {notice.msg}
                </Alert>
            )}

            {status === null ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <CircularProgress size={22} sx={{ color: ACCENT }} />
                </Box>
            ) : status.connected ? (
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    spacing={1.5}
                    sx={{
                        p: 1.6,
                        borderRadius: "12px",
                        border: "1px solid rgba(52,211,153,0.25)",
                        background: "rgba(52,211,153,0.06)",
                    }}
                >
                    <Stack direction="row" alignItems="center" spacing={1.2}>
                        <CheckCircleIcon sx={{ color: "var(--success)", fontSize: 22 }} />
                        <Box>
                            <Typography sx={{ color: TEXT, fontWeight: 600, fontSize: "0.92rem" }}>
                                Connected
                            </Typography>
                            <Typography sx={{ color: TEXT_55, fontSize: "0.82rem" }}>
                                {status.email || "Google Drive"}
                            </Typography>
                        </Box>
                    </Stack>
                    {canWrite && (
                        <Button
                            onClick={disconnect}
                            disabled={busy}
                            sx={{
                                textTransform: "none",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                                color: "var(--danger)",
                                borderRadius: "10px",
                                border: "1px solid rgba(248,113,113,0.3)",
                                px: 2,
                                "&:hover": { background: "rgba(248,113,113,0.08)" },
                            }}
                        >
                            {busy ? "Disconnecting…" : "Disconnect"}
                        </Button>
                    )}
                </Stack>
            ) : (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ flexWrap: "wrap", gap: 1 }}
                >
                    {!canWrite && <ReadOnlyChip />}
                    {canWrite && (
                        <Button
                            component="a"
                            href="/api/drive/connect"
                            startIcon={<CloudIcon />}
                            disabled={!status.configured}
                            sx={{
                                textTransform: "none",
                                fontWeight: 700,
                                fontSize: "0.9rem",
                                color: "var(--accent-contrast)",
                                px: 2.6,
                                py: 1,
                                borderRadius: "11px",
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
                            Connect Google Drive
                        </Button>
                    )}
                    {!status.configured && (
                        <Typography sx={{ color: "var(--fg-faint)", fontSize: "0.8rem" }}>
                            Drive isn&rsquo;t configured on this deployment yet.
                        </Typography>
                    )}
                </Stack>
            )}
        </GlassCard>
    );
}
