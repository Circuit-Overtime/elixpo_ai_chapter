"use client";

import CloseIcon from "@mui/icons-material/Close";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { Alert, Box, Button, IconButton, Snackbar, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const TIPS: Array<{ match: RegExp; key: string; title: string; body: string }> = [
    {
        match: /^\/dashboard\/products(?:\/|$)/,
        key: "products",
        title: "Products group your sending setup",
        body: "Connect templates, sender defaults, webhook credentials, and brand details for one app or service.",
    },
    {
        match: /^\/dashboard\/webhooks(?:\/|$)/,
        key: "webhooks",
        title: "Webhooks trigger transactional mail",
        body: "Use a signed product webhook to send a selected template safely from your application.",
    },
    {
        match: /^\/dashboard\/senders(?:\/|$)/,
        key: "senders",
        title: "Senders are verified delivery identities",
        body: "Add the mailbox and SMTP credentials that Elixpo Mails should use to deliver messages.",
    },
    {
        match: /^\/dashboard\/logs(?:\/|$)/,
        key: "logs",
        title: "Logs explain every delivery",
        body: "Track queued, sent, and failed messages here, including the latest provider response.",
    },
    {
        match: /^\/dashboard\/templates\/[^/]+\/settings(?:\/|$)/,
        key: "template-settings",
        title: "Choose how this template is delivered",
        body: "One-time templates carry their own footer; webhook templates inherit product delivery and brand settings.",
    },
    {
        match: /^\/dashboard\/templates(?:\/|$)/,
        key: "templates",
        title: "Templates can belong to you or a workspace",
        body: "Their context badge shows where they live. Switch context before editing a template from another workspace.",
    },
    {
        match: /^\/dashboard$/,
        key: "welcome",
        title: "Pick up where you left off",
        body: "Create a template, connect a sender, then attach both to a product when you are ready to send.",
    },
];

export default function ContextualTip() {
    const pathname = usePathname();
    const tip = useMemo(() => TIPS.find((item) => item.match.test(pathname)), [pathname]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!tip) return;
        const dismissed = localStorage.getItem(`mail-tip-dismissed:${tip.key}`) === "1";
        const shown = sessionStorage.getItem(`mail-tip-shown:${tip.key}`) === "1";
        if (!dismissed && !shown) {
            const timer = window.setTimeout(() => {
                sessionStorage.setItem(`mail-tip-shown:${tip.key}`, "1");
                setOpen(true);
            }, 650);
            return () => window.clearTimeout(timer);
        }
        setOpen(false);
    }, [tip]);

    if (!tip) return null;

    return (
        <Snackbar
            open={open}
            onClose={() => setOpen(false)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            sx={{ maxWidth: 430 }}
        >
            <Alert
                icon={<LightbulbOutlinedIcon />}
                severity="info"
                action={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                                localStorage.setItem(`mail-tip-dismissed:${tip.key}`, "1");
                                setOpen(false);
                            }}
                            sx={{ textTransform: "none", whiteSpace: "nowrap" }}
                        >
                            Don&apos;t show again
                        </Button>
                        <IconButton size="small" color="inherit" onClick={() => setOpen(false)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                }
                sx={{
                    border: "1px solid var(--accent-border)",
                    boxShadow: "0 16px 50px rgba(0,0,0,.28)",
                }}
            >
                <Typography sx={{ fontWeight: 800, fontSize: "0.88rem" }}>{tip.title}</Typography>
                <Typography sx={{ fontSize: "0.8rem", opacity: 0.88 }}>{tip.body}</Typography>
            </Alert>
        </Snackbar>
    );
}
