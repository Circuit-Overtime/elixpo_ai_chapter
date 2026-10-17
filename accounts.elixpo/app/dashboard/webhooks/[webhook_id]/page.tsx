"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import SendIcon from "@mui/icons-material/Send";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Divider,
    FormControlLabel,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const AVAILABLE_EVENTS = [
    "user.created",
    "user.updated",
    "user.deleted",
    "oauth.authorized",
    "oauth.revoked",
    "api_key.created",
    "api_key.revoked",
];

const cardSx = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    p: 3,
    mb: 3,
};

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: "#ff7759" },
    },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#ff7759" },
};

export default function WebhookDetailPage() {
    const params = useParams();
    const router = useRouter();
    const webhookId = params.webhook_id as string;

    const [_webhook, setWebhook] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{
        text: string;
        type: "success" | "error";
    } | null>(null);

    const [form, setForm] = useState({
        url: "",
        events: [] as string[],
        is_active: true,
    });

    useEffect(() => {
        const fetchWebhook = async () => {
            try {
                const res = await fetch(`/api/auth/webhooks/${webhookId}`, {
                    credentials: "include",
                });
                if (!res.ok) throw new Error("Not found");
                const data: any = await res.json();
                setWebhook(data);
                setForm({
                    url: data.url,
                    events: data.events,
                    is_active: data.is_active,
                });
            } catch {
                router.push("/dashboard/webhooks");
            } finally {
                setLoading(false);
            }
        };
        fetchWebhook();
    }, [webhookId, router]);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/auth/webhooks/${webhookId}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const err: any = await res.json();
                throw new Error(err.error || "Failed to save");
            }
            const updated: any = await res.json();
            setWebhook(updated);
            setMessage({
                text: "Webhook updated successfully",
                type: "success",
            });
        } catch (err: any) {
            setMessage({ text: err.message, type: "error" });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/auth/webhooks/${webhookId}/test`, {
                method: "POST",
                credentials: "include",
            });
            const data: any = await res.json();
            setMessage({
                text: data.success
                    ? `Test delivered (HTTP ${data.statusCode})`
                    : `Test failed: ${data.message}`,
                type: data.success ? "success" : "error",
            });
        } catch {
            setMessage({ text: "Failed to send test", type: "error" });
        } finally {
            setTesting(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this webhook? This cannot be undone.")) return;
        try {
            await fetch(`/api/auth/webhooks/${webhookId}`, {
                method: "DELETE",
                credentials: "include",
            });
            router.push("/dashboard/webhooks");
        } catch {
            setMessage({ text: "Failed to delete", type: "error" });
        }
    };

    const handleEventToggle = (event: string) => {
        setForm((prev) => ({
            ...prev,
            events: prev.events.includes(event)
                ? prev.events.filter((e) => e !== event)
                : [...prev.events, event],
        }));
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 10,
                }}
            >
                <CircularProgress sx={{ color: "#ff7759" }} />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ maxWidth: "800px", mx: "auto" }}>
                {/* Back + Header */}
                <Box sx={{ mb: 4 }}>
                    <Button
                        startIcon={<ArrowBackIcon />}
                        onClick={() => router.push("/dashboard/webhooks")}
                        sx={{
                            color: "var(--fg-faint)",
                            mb: 2,
                            textTransform: "none",
                            "&:hover": { color: "var(--fg)" },
                        }}
                    >
                        Back to Webhooks
                    </Button>
                    <Typography
                        variant="h5"
                        sx={{ fontWeight: 700, color: "var(--fg)", mb: 0.5 }}
                    >
                        Webhook Settings
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.85rem",
                            fontFamily: "monospace",
                        }}
                    >
                        {webhookId}
                    </Typography>
                </Box>

                {message && (
                    <Alert
                        severity={message.type}
                        sx={{
                            mb: 3,
                            bgcolor:
                                message.type === "success"
                                    ? "rgba(255, 119, 89,0.1)"
                                    : "rgba(239,68,68,0.1)",
                            color:
                                message.type === "success"
                                    ? "#ff7759"
                                    : "#b91c1c",
                            border: `1px solid ${message.type === "success" ? "rgba(255, 119, 89,0.3)" : "rgba(239,68,68,0.3)"}`,
                            "& .MuiAlert-icon": {
                                color:
                                    message.type === "success"
                                        ? "#ff7759"
                                        : "#b91c1c",
                            },
                        }}
                        onClose={() => setMessage(null)}
                    >
                        {message.text}
                    </Alert>
                )}

                {/* Status toggle */}
                <Box sx={cardSx}>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <Box>
                            <Typography
                                sx={{ color: "var(--fg)", fontWeight: 600 }}
                            >
                                Active
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ color: "var(--fg-faint)" }}
                            >
                                Pause delivery without deleting the webhook
                            </Typography>
                        </Box>
                        <Switch
                            checked={form.is_active}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    is_active: e.target.checked,
                                })
                            }
                            sx={{
                                "& .MuiSwitch-switchBase.Mui-checked": {
                                    color: "#ff7759",
                                },
                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                                    { bgcolor: "#15803d" },
                            }}
                        />
                    </Box>
                </Box>

                {/* URL + Events */}
                <Box sx={cardSx}>
                    <Typography
                        sx={{
                            color: "var(--fg)",
                            fontWeight: 600,
                            mb: 2,
                            fontSize: "1rem",
                        }}
                    >
                        Configuration
                    </Typography>
                    <TextField
                        fullWidth
                        label="Payload URL"
                        value={form.url}
                        onChange={(e) =>
                            setForm({ ...form, url: e.target.value })
                        }
                        sx={{ ...textFieldSx, mb: 3 }}
                    />

                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            mb: 1,
                            fontSize: "0.9rem",
                            fontWeight: 600,
                        }}
                    >
                        Events
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            mb: 3,
                        }}
                    >
                        {AVAILABLE_EVENTS.map((ev) => (
                            <FormControlLabel
                                key={ev}
                                control={
                                    <Checkbox
                                        checked={form.events.includes(ev)}
                                        onChange={() => handleEventToggle(ev)}
                                        size="small"
                                        sx={{
                                            color: "var(--fg-faint)",
                                            "&.Mui-checked": {
                                                color: "#ff7759",
                                            },
                                        }}
                                    />
                                }
                                label={
                                    <Typography
                                        sx={{
                                            color: "var(--fg)",
                                            fontFamily: "monospace",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        {ev}
                                    </Typography>
                                }
                            />
                        ))}
                    </Box>

                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSave}
                        disabled={saving}
                        sx={{
                            background: "rgba(255, 119, 89,0.15)",
                            color: "#ff7759",
                            border: "1px solid rgba(255, 119, 89,0.3)",
                            fontWeight: 600,
                            textTransform: "none",
                            "&:hover": {
                                background: "rgba(255, 119, 89,0.25)",
                            },
                        }}
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </Box>

                {/* Test */}
                <Box sx={cardSx}>
                    <Typography
                        sx={{ color: "var(--fg)", fontWeight: 600, mb: 1 }}
                    >
                        Send Test Payload
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: "var(--fg-faint)", mb: 2 }}
                    >
                        Sends a <code style={{ color: "#ff7759" }}>ping</code>{" "}
                        event to verify your endpoint is reachable.
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<SendIcon />}
                        onClick={handleTest}
                        disabled={testing}
                        sx={{
                            borderColor: "rgba(255, 119, 89,0.3)",
                            color: "#ff7759",
                            textTransform: "none",
                            "&:hover": {
                                borderColor: "#ff7759",
                                bgcolor: "rgba(255, 119, 89,0.05)",
                            },
                        }}
                    >
                        {testing ? "Sending..." : "Send Test"}
                    </Button>
                </Box>

                {/* Danger Zone */}
                <Box
                    sx={{ ...cardSx, border: "1px solid rgba(239,68,68,0.35)" }}
                >
                    <Typography
                        sx={{ color: "#b91c1c", fontWeight: 600, mb: 1 }}
                    >
                        Danger Zone
                    </Typography>
                    <Divider
                        sx={{ borderColor: "rgba(239,68,68,0.2)", mb: 2 }}
                    />
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <Box>
                            <Typography
                                sx={{ color: "var(--fg)", fontWeight: 500 }}
                            >
                                Delete webhook
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ color: "var(--fg-faint)" }}
                            >
                                Permanently remove this webhook and stop all
                                deliveries
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            startIcon={<DeleteIcon />}
                            onClick={handleDelete}
                            sx={{
                                borderColor: "rgba(239,68,68,0.4)",
                                color: "#b91c1c",
                                textTransform: "none",
                                "&:hover": {
                                    bgcolor: "rgba(239,68,68,0.1)",
                                    borderColor: "#ef4444",
                                },
                            }}
                        >
                            Delete
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
