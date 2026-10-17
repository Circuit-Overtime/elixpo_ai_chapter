"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const AVAILABLE_EVENTS = [
    { value: "user.created", label: "User Created" },
    { value: "user.updated", label: "User Updated" },
    { value: "user.deleted", label: "User Deleted" },
    { value: "oauth.authorized", label: "OAuth Authorized" },
    { value: "oauth.revoked", label: "OAuth Revoked" },
    { value: "api_key.created", label: "API Key Created" },
    { value: "api_key.revoked", label: "API Key Revoked" },
];

interface Webhook {
    id: string;
    url: string;
    events: string[];
    is_active: boolean;
    created_at: string;
    last_delivery_at?: string;
}

const cardSx = {
    backdropFilter: "blur(20px)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
};

const dialogSx = {
    backdropFilter: "blur(20px)",
    background: "rgba(255,255,255,0.95)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
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
    "& .MuiFormHelperText-root": { color: "var(--fg-faint)" },
};

export default function WebhooksPage() {
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [creating, setCreating] = useState(false);
    const [snack, setSnack] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "error";
    }>({
        open: false,
        message: "",
        severity: "success",
    });

    const [form, setForm] = useState({
        endpoint_id: "",
        events: [] as string[],
        secret: "",
    });

    // One option per webhook endpoint across all of the caller's apps.
    // The dropdown shows "App name · endpoint URL" so it's clear which
    // app + URL each row maps to. URL resolution is server-side from the
    // endpoint row — no free-text URLs ever cross the boundary.
    interface EligibleEndpoint {
        endpoint_id: string;
        client_id: string;
        app_name: string;
        url: string;
        label: string | null;
    }
    const [eligibleEndpoints, setEligibleEndpoints] = useState<
        EligibleEndpoint[]
    >([]);
    const selectedEndpoint = eligibleEndpoints.find(
        (e) => e.endpoint_id === form.endpoint_id,
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps

    // useCallback gives a stable reference so the effect doesn't loop when
    // eslint-react-hooks puts fetchWebhooks in deps.
    const fetchWebhooks = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/auth/webhooks", {
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to fetch webhooks");
            const data: any = await res.json();
            setWebhooks(data.webhooks || []);
        } catch {
            setSnack({
                open: true,
                message: "Failed to load webhooks",
                severity: "error",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWebhooks();
    }, [fetchWebhooks]);

    const showSnack = (message: string, severity: "success" | "error") => {
        setSnack({ open: true, message, severity });
    };

    const handleEventToggle = (event: string) => {
        setForm((prev) => ({
            ...prev,
            events: prev.events.includes(event)
                ? prev.events.filter((e) => e !== event)
                : [...prev.events, event],
        }));
    };

    const handleCreate = async () => {
        if (!form.endpoint_id)
            return showSnack("Pick a webhook endpoint", "error");
        if (form.events.length === 0)
            return showSnack("Select at least one event", "error");

        setCreating(true);
        try {
            const res = await fetch("/api/auth/webhooks", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endpoint_id: form.endpoint_id,
                    events: form.events,
                    secret: form.secret || undefined,
                }),
            });
            if (!res.ok) {
                const err: any = await res.json();
                throw new Error(err.error || "Failed to create webhook");
            }
            setOpenDialog(false);
            setForm({ endpoint_id: "", events: [], secret: "" });
            await fetchWebhooks();
            showSnack("Webhook created successfully", "success");
        } catch (err: any) {
            showSnack(err.message, "error");
        } finally {
            setCreating(false);
        }
    };

    // Fan out one fetch per owned app to collect its endpoints. Apps with
    // no endpoints contribute zero rows — that's the user's cue to go set
    // some up on the OAuth app detail page first.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const appsRes = await fetch("/api/auth/oauth-apps", {
                    credentials: "include",
                });
                if (!appsRes.ok) return;
                const appsData: any = await appsRes.json();
                const apps = (appsData.apps || []) as Array<{
                    client_id: string;
                    name: string;
                }>;
                const all: EligibleEndpoint[] = [];
                for (const app of apps) {
                    try {
                        const r = await fetch(
                            `/api/auth/oauth-clients/${app.client_id}/webhooks`,
                            { credentials: "include" },
                        );
                        if (!r.ok) continue;
                        const d: any = await r.json();
                        for (const ep of d.endpoints || []) {
                            if (!ep.is_active) continue;
                            all.push({
                                endpoint_id: ep.id,
                                client_id: app.client_id,
                                app_name: app.name,
                                url: ep.url,
                                label: ep.label ?? null,
                            });
                        }
                    } catch {
                        /* skip this app on error */
                    }
                }
                if (!cancelled) setEligibleEndpoints(all);
            } catch {
                /* non-fatal — the dropdown just shows no options */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this webhook? This cannot be undone.")) return;
        try {
            const res = await fetch(`/api/auth/webhooks/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) throw new Error("Failed to delete");
            await fetchWebhooks();
            showSnack("Webhook deleted", "success");
        } catch {
            showSnack("Failed to delete webhook", "error");
        }
    };

    const handleTest = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/webhooks/${id}/test`, {
                method: "POST",
                credentials: "include",
            });
            const data: any = await res.json();
            if (data.success) {
                showSnack(
                    `Test delivered (HTTP ${data.statusCode})`,
                    "success",
                );
            } else {
                showSnack(`Test failed: ${data.message}`, "error");
            }
        } catch {
            showSnack("Failed to send test", "error");
        }
    };

    const handleToggleActive = async (webhook: Webhook) => {
        try {
            const res = await fetch(`/api/auth/webhooks/${webhook.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !webhook.is_active }),
            });
            if (!res.ok) throw new Error("Failed to update");
            setWebhooks((prev) =>
                prev.map((w) =>
                    w.id === webhook.id ? { ...w, is_active: !w.is_active } : w,
                ),
            );
        } catch {
            showSnack("Failed to update webhook", "error");
        }
    };

    return (
        <Box>
            <Box sx={{ maxWidth: "1100px", mx: "auto" }}>
                {/* Header */}
                <Box
                    sx={{
                        mb: 4,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                    }}
                >
                    <Box>
                        <Typography
                            variant="h4"
                            sx={{ fontWeight: 700, color: "var(--fg)", mb: 1 }}
                        >
                            Webhooks
                        </Typography>
                        <Typography sx={{ color: "var(--fg-faint)" }}>
                            Receive real-time HTTP notifications for platform
                            events
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setOpenDialog(true)}
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
                        Add Webhook
                    </Button>
                </Box>

                {/* Table */}
                <Box sx={cardSx}>
                    {loading ? (
                        <Box sx={{ p: 4, textAlign: "center" }}>
                            <CircularProgress sx={{ color: "#ff7759" }} />
                        </Box>
                    ) : webhooks.length === 0 ? (
                        <Box
                            sx={{
                                p: 4,
                                textAlign: "center",
                                color: "var(--fg-faint)",
                            }}
                        >
                            No webhooks configured yet. Click "Add Webhook" to
                            get started.
                        </Box>
                    ) : (
                        <TableContainer
                            component={Paper}
                            sx={{
                                background: "transparent",
                                boxShadow: "none",
                            }}
                        >
                            <Table>
                                <TableHead>
                                    <TableRow
                                        sx={{
                                            "& .MuiTableCell-head": {
                                                color: "#ff7759",
                                                fontWeight: 600,
                                                bgcolor:
                                                    "rgba(255, 119, 89,0.05)",
                                                borderColor:
                                                    "rgba(255, 119, 89,0.2)",
                                            },
                                        }}
                                    >
                                        <TableCell>URL</TableCell>
                                        <TableCell>Events</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Last Delivery</TableCell>
                                        <TableCell align="right">
                                            Actions
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {webhooks.map((webhook) => (
                                        <TableRow
                                            key={webhook.id}
                                            sx={{
                                                "& .MuiTableCell-body": {
                                                    color: "var(--fg)",
                                                    borderColor:
                                                        "var(--border)",
                                                },
                                                "&:hover": {
                                                    bgcolor: "var(--overlay)",
                                                },
                                            }}
                                        >
                                            <TableCell sx={{ maxWidth: 300 }}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontFamily: "monospace",
                                                        fontSize: "0.8rem",
                                                        wordBreak: "break-all",
                                                    }}
                                                >
                                                    {webhook.url}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        flexWrap: "wrap",
                                                        gap: 0.5,
                                                    }}
                                                >
                                                    {webhook.events.map(
                                                        (ev) => (
                                                            <Chip
                                                                key={ev}
                                                                label={ev}
                                                                size="small"
                                                                sx={{
                                                                    bgcolor:
                                                                        "rgba(255, 119, 89,0.1)",
                                                                    color: "#ff7759",
                                                                    fontSize:
                                                                        "0.7rem",
                                                                    height: 20,
                                                                }}
                                                            />
                                                        ),
                                                    )}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Switch
                                                    checked={webhook.is_active}
                                                    onChange={() =>
                                                        handleToggleActive(
                                                            webhook,
                                                        )
                                                    }
                                                    size="small"
                                                    sx={{
                                                        "& .MuiSwitch-switchBase.Mui-checked":
                                                            {
                                                                color: "#ff7759",
                                                            },
                                                        "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track":
                                                            {
                                                                bgcolor:
                                                                    "#15803d",
                                                            },
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                {webhook.last_delivery_at
                                                    ? new Date(
                                                          webhook.last_delivery_at,
                                                      ).toLocaleString()
                                                    : "Never"}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        gap: 0.5,
                                                        justifyContent:
                                                            "flex-end",
                                                    }}
                                                >
                                                    <IconButton
                                                        size="small"
                                                        title="Send test"
                                                        onClick={() =>
                                                            handleTest(
                                                                webhook.id,
                                                            )
                                                        }
                                                        sx={{
                                                            color: "#ff7759",
                                                            "&:hover": {
                                                                bgcolor:
                                                                    "rgba(255, 119, 89,0.1)",
                                                            },
                                                        }}
                                                    >
                                                        <SendIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        title="Settings"
                                                        component={Link}
                                                        href={`/dashboard/webhooks/${webhook.id}`}
                                                        sx={{
                                                            color: "var(--fg-faint)",
                                                            "&:hover": {
                                                                color: "var(--fg)",
                                                                bgcolor:
                                                                    "var(--overlay)",
                                                            },
                                                        }}
                                                    >
                                                        <SettingsIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        title="Delete"
                                                        onClick={() =>
                                                            handleDelete(
                                                                webhook.id,
                                                            )
                                                        }
                                                        sx={{
                                                            color: "#b91c1c",
                                                            "&:hover": {
                                                                bgcolor:
                                                                    "rgba(239,68,68,0.1)",
                                                            },
                                                        }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Box>

            {/* Create Dialog */}
            <Dialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: dialogSx }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    Add Webhook
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {/* Connected-app dropdown — replaces the old free-text
                        Payload URL. Per the safety policy the URL is
                        resolved from the chosen app's registered
                        webhook_url, so we never send to arbitrary hosts. */}
                    <FormControl
                        fullWidth
                        margin="dense"
                        sx={{
                            ...textFieldSx,
                            "& .MuiInputLabel-root": {
                                color: "var(--fg-muted)",
                            },
                            "& .MuiInputLabel-root.Mui-focused": {
                                color: "#ff7759",
                            },
                            "& .MuiOutlinedInput-root": {
                                color: "var(--fg)",
                                "& fieldset": {
                                    borderColor: "var(--border)",
                                },
                                "&:hover fieldset": {
                                    borderColor: "rgba(255, 119, 89,0.4)",
                                },
                                "&.Mui-focused fieldset": {
                                    borderColor: "#ff7759",
                                },
                            },
                            "& .MuiSelect-icon": {
                                color: "var(--fg-faint)",
                            },
                        }}
                    >
                        <InputLabel id="wh-endpoint-select">
                            Webhook endpoint
                        </InputLabel>
                        <Select
                            labelId="wh-endpoint-select"
                            label="Webhook endpoint"
                            value={form.endpoint_id}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    endpoint_id: e.target.value as string,
                                })
                            }
                            displayEmpty
                            renderValue={(val) => {
                                if (!val)
                                    return (
                                        <Box
                                            component="span"
                                            sx={{
                                                color: "var(--fg-faint)",
                                            }}
                                        >
                                            Choose an endpoint from one of your
                                            OAuth apps
                                        </Box>
                                    );
                                const ep = eligibleEndpoints.find(
                                    (e) => e.endpoint_id === val,
                                );
                                return ep
                                    ? `${ep.app_name} · ${ep.url}`
                                    : (val as string);
                            }}
                            MenuProps={{
                                PaperProps: {
                                    sx: {
                                        background: "rgba(255,255,255,0.95)",
                                        backdropFilter: "blur(20px)",
                                        border: "1px solid var(--border)",
                                        color: "var(--fg)",
                                    },
                                },
                            }}
                        >
                            {eligibleEndpoints.length === 0 ? (
                                <MenuItem disabled value="">
                                    No endpoints yet — go to OAuth Apps →
                                    settings and add one first
                                </MenuItem>
                            ) : (
                                eligibleEndpoints.map((ep) => (
                                    <MenuItem
                                        key={ep.endpoint_id}
                                        value={ep.endpoint_id}
                                    >
                                        <Box
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                py: 0.25,
                                            }}
                                        >
                                            <Box
                                                component="span"
                                                sx={{ fontWeight: 600 }}
                                            >
                                                {ep.app_name}
                                                {ep.label && (
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            ml: 1,
                                                            color: "rgba(255, 119, 89,0.85)",
                                                            fontSize: "0.72rem",
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {ep.label}
                                                    </Box>
                                                )}
                                            </Box>
                                            <Box
                                                component="span"
                                                sx={{
                                                    fontFamily:
                                                        "var(--font-geist-mono), monospace",
                                                    fontSize: "0.72rem",
                                                    color: "var(--fg-faint)",
                                                }}
                                            >
                                                {ep.url}
                                            </Box>
                                        </Box>
                                    </MenuItem>
                                ))
                            )}
                        </Select>
                    </FormControl>

                    {/* Read-only echo of the resolved URL, so the user can
                        see exactly what they're committing to. */}
                    {selectedEndpoint?.url && (
                        <Box
                            sx={{
                                mt: 1.5,
                                p: 1.25,
                                borderRadius: "8px",
                                background: "rgba(255, 119, 89,0.06)",
                                border: "1px solid rgba(255, 119, 89,0.2)",
                            }}
                        >
                            <Box
                                component="div"
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.7rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    mb: 0.25,
                                }}
                            >
                                Payload will be sent to
                            </Box>
                            <Box
                                component="code"
                                sx={{
                                    color: "#ff7759",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    fontSize: "0.82rem",
                                    wordBreak: "break-all",
                                }}
                            >
                                {selectedEndpoint.url}
                            </Box>
                        </Box>
                    )}
                    <TextField
                        fullWidth
                        label="Secret (optional)"
                        placeholder="Auto-generated if empty"
                        value={form.secret}
                        onChange={(e) =>
                            setForm({ ...form, secret: e.target.value })
                        }
                        margin="dense"
                        helperText="Used to sign payloads (X-Elixpo-Signature header)"
                        sx={textFieldSx}
                    />
                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            mt: 2,
                            mb: 1,
                            fontSize: "0.9rem",
                            fontWeight: 600,
                        }}
                    >
                        Events to listen for
                    </Typography>
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                        }}
                    >
                        {AVAILABLE_EVENTS.map((ev) => (
                            <FormControlLabel
                                key={ev.value}
                                control={
                                    <Checkbox
                                        checked={form.events.includes(ev.value)}
                                        onChange={() =>
                                            handleEventToggle(ev.value)
                                        }
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
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontFamily: "monospace",
                                                color: "#ff7759",
                                                marginRight: 8,
                                            }}
                                        >
                                            {ev.value}
                                        </span>
                                        {ev.label}
                                    </Typography>
                                }
                            />
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions
                    sx={{ borderTop: "1px solid var(--border)", p: 2 }}
                >
                    <Button
                        onClick={() => setOpenDialog(false)}
                        sx={{ color: "var(--fg-faint)" }}
                        disabled={creating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        disabled={creating}
                        sx={{
                            background: "rgba(255, 119, 89,0.15)",
                            color: "#ff7759",
                            border: "1px solid rgba(255, 119, 89,0.3)",
                            "&:hover": {
                                background: "rgba(255, 119, 89,0.25)",
                            },
                        }}
                    >
                        {creating ? "Creating..." : "Add Webhook"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snack.open}
                autoHideDuration={4000}
                onClose={() => setSnack({ ...snack, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert
                    severity={snack.severity}
                    onClose={() => setSnack({ ...snack, open: false })}
                    sx={{
                        bgcolor:
                            snack.severity === "success"
                                ? "rgba(255, 119, 89,0.15)"
                                : "rgba(239,68,68,0.15)",
                        color:
                            snack.severity === "success"
                                ? "#ff7759"
                                : "#b91c1c",
                        border: `1px solid ${snack.severity === "success" ? "rgba(255, 119, 89,0.3)" : "rgba(239,68,68,0.3)"}`,
                    }}
                >
                    {snack.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
