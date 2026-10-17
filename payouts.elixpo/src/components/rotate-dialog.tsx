"use client";

import AutorenewIcon from "@mui/icons-material/Autorenew";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    Stack,
    Typography,
} from "@mui/material";
import { type ReactNode, useState } from "react";

export type GraceKey = "immediate" | "5m" | "10m" | "1h";

const OPTIONS: { key: GraceKey; label: string; hint: string }[] = [
    {
        key: "immediate",
        label: "Rotate immediately",
        hint: "Old value stops working at once",
    },
    {
        key: "5m",
        label: "Keep old valid 5 min",
        hint: "Time for a quick redeploy",
    },
    { key: "10m", label: "Keep old valid 10 min", hint: "A bit more headroom" },
    {
        key: "1h",
        label: "Keep old valid 1 hour",
        hint: "For slower CI pipelines",
    },
];

/**
 * Rotate-with-grace dialog. Lets the user pick how long the OLD credential keeps
 * working before the new one fully takes over.
 */
export default function RotateDialog({
    open,
    title,
    message,
    confirmLabel = "Rotate",
    busy = false,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    busy?: boolean;
    onConfirm: (grace: GraceKey) => void;
    onClose: () => void;
}) {
    const [grace, setGrace] = useState<GraceKey>("5m");

    return (
        <Dialog
            open={open}
            onClose={busy ? undefined : onClose}
            fullWidth
            maxWidth="xs"
            PaperProps={{
                sx: {
                    bgcolor: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: "16px",
                    color: "var(--app-fg)",
                    backgroundImage: "none",
                },
            }}
        >
            <DialogContent sx={{ pt: 3 }}>
                <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="flex-start"
                    sx={{ mb: 2 }}
                >
                    <Box
                        sx={{
                            flexShrink: 0,
                            width: 40,
                            height: 40,
                            borderRadius: "10px",
                            display: "grid",
                            placeItems: "center",
                            color: "#c4b5fd",
                            background: "rgba(155,123,247,0.1)",
                            border: "1px solid rgba(155,123,247,0.25)",
                        }}
                    >
                        <AutorenewIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography
                            sx={{
                                fontWeight: 700,
                                fontSize: "1.1rem",
                                mb: 0.5,
                            }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--app-fg-muted)",
                                fontSize: "0.9rem",
                                lineHeight: 1.6,
                            }}
                        >
                            {message}
                        </Typography>
                    </Box>
                </Stack>

                <Stack spacing={1}>
                    {OPTIONS.map((o) => {
                        const on = grace === o.key;
                        const danger = o.key === "immediate";
                        return (
                            <Box
                                key={o.key}
                                onClick={() => !busy && setGrace(o.key)}
                                sx={{
                                    cursor: busy ? "default" : "pointer",
                                    p: 1.3,
                                    borderRadius: "12px",
                                    border: `1px solid ${on ? (danger ? "rgba(248,113,113,0.6)" : "rgba(155,123,247,0.6)") : "var(--app-border)"}`,
                                    background: on
                                        ? danger
                                            ? "rgba(248,113,113,0.08)"
                                            : "rgba(155,123,247,0.08)"
                                        : "var(--app-overlay)",
                                    transition:
                                        "border-color .15s, background .15s",
                                }}
                            >
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={1.2}
                                >
                                    <Box
                                        sx={{
                                            width: 16,
                                            height: 16,
                                            borderRadius: "50%",
                                            flexShrink: 0,
                                            border: `2px solid ${on ? (danger ? "#f87171" : "#9b7bf7") : "var(--app-border)"}`,
                                            display: "grid",
                                            placeItems: "center",
                                        }}
                                    >
                                        {on && (
                                            <Box
                                                sx={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: "50%",
                                                    background: danger
                                                        ? "#f87171"
                                                        : "#9b7bf7",
                                                }}
                                            />
                                        )}
                                    </Box>
                                    <Box>
                                        <Typography
                                            sx={{
                                                fontSize: "0.88rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {o.label}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                fontSize: "0.76rem",
                                                color: "var(--app-fg-muted)",
                                            }}
                                        >
                                            {o.hint}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button
                    onClick={onClose}
                    disabled={busy}
                    sx={{
                        textTransform: "none",
                        color: "var(--app-fg-muted)",
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={() => onConfirm(grace)}
                    disabled={busy}
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: "#fff",
                        px: 2.4,
                        borderRadius: "10px",
                        background:
                            "linear-gradient(135deg, #9b7bf7 0%, #7c5cff 100%)",
                        "&:hover": {
                            background:
                                "linear-gradient(135deg, #b094ff 0%, #8a6dff 100%)",
                        },
                        "&.Mui-disabled": { opacity: 0.5, color: "#fff" },
                    }}
                >
                    {busy ? "Rotating…" : confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
