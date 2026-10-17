"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    Stack,
    Typography,
} from "@mui/material";
import type { ReactNode } from "react";

/** Reusable confirmation dialog. Destructive variant warns in red. */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    busy = false,
    onConfirm,
    onClose,
}: {
    open: boolean;
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const accent = destructive ? "#f87171" : "#9b7bf7";
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
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box
                        sx={{
                            flexShrink: 0,
                            width: 40,
                            height: 40,
                            borderRadius: "10px",
                            display: "grid",
                            placeItems: "center",
                            color: accent,
                            background: `${accent}1a`,
                            border: `1px solid ${accent}40`,
                        }}
                    >
                        <WarningAmberIcon sx={{ fontSize: 22 }} />
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
                    {cancelLabel}
                </Button>
                <Button
                    onClick={onConfirm}
                    disabled={busy}
                    sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        color: "#fff",
                        px: 2.4,
                        borderRadius: "10px",
                        background: destructive
                            ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                            : "linear-gradient(135deg, #9b7bf7 0%, #7c5cff 100%)",
                        "&:hover": {
                            background: destructive
                                ? "linear-gradient(135deg, #f87171 0%, #ef4444 100%)"
                                : "linear-gradient(135deg, #b094ff 0%, #8a6dff 100%)",
                        },
                        "&.Mui-disabled": { opacity: 0.5, color: "#fff" },
                    }}
                >
                    {busy ? "Working…" : confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
