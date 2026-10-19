"use client";

import AddBusinessIcon from "@mui/icons-material/AddBusiness";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Box, Button, CircularProgress, Stack, TextField, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import GlassCard from "./glass-card";

export default function CreateWorkspace() {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function create() {
        if (busy || name.trim().length < 2) return;
        setBusy(true);
        setError("");
        try {
            const res = await fetch("/api/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description }),
            });
            const data = (await res.json()) as {
                workspace?: { id: string; slug: string };
                message?: string;
            };
            if (!res.ok || !data?.workspace)
                throw new Error(data?.message || "Could not create workspace.");
            await fetch("/api/workspace/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: data.workspace.id }),
            });
            window.location.href = `/workspace/${data.workspace.slug}`;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not create workspace.");
            setBusy(false);
        }
    }

    return (
        <Box sx={{ maxWidth: 680, mx: "auto" }}>
            <Button
                component={Link}
                href="/dashboard"
                startIcon={<ArrowBackIcon />}
                sx={{ mb: 2, color: "var(--fg-muted)", textTransform: "none" }}
            >
                Dashboard
            </Button>
            <GlassCard sx={{ p: { xs: 2.5, md: 4 } }}>
                <Stack spacing={2.5}>
                    <Box>
                        <AddBusinessIcon sx={{ color: "var(--accent)", fontSize: 32, mb: 1 }} />
                        <Typography
                            sx={{ color: "var(--fg)", fontWeight: 800, fontSize: "1.55rem" }}
                        >
                            Create a shared workspace
                        </Typography>
                        <Typography sx={{ color: "var(--fg-muted)", mt: 0.6 }}>
                            Give your team a separate place for templates, products, senders, and
                            delivery history.
                        </Typography>
                    </Box>
                    <TextField
                        label="Workspace name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        fullWidth
                    />
                    <TextField
                        label="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        multiline
                        minRows={3}
                        fullWidth
                    />
                    {error && (
                        <Typography sx={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                            {error}
                        </Typography>
                    )}
                    <Button
                        onClick={create}
                        disabled={busy || name.trim().length < 2}
                        sx={{
                            alignSelf: "flex-start",
                            textTransform: "none",
                            fontWeight: 800,
                            color: "var(--accent-contrast)",
                            background: "var(--accent-gradient)",
                            px: 3,
                        }}
                    >
                        {busy ? <CircularProgress size={19} /> : "Create workspace"}
                    </Button>
                </Stack>
            </GlassCard>
        </Box>
    );
}
