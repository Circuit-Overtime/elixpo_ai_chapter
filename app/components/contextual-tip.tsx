"use client";

import CloseIcon from "@mui/icons-material/Close";
import EastIcon from "@mui/icons-material/East";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { Box, Button, IconButton, Paper, Snackbar, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const TIPS: Array<{
    match: RegExp;
    key: string;
    title: string;
    body: string;
    href: string;
    action: string;
}> = [
    {
        match: /^\/dashboard\/products(?:\/|$)/,
        key: "products",
        title: "Products group your sending setup",
        body: "Connect templates, sender defaults, webhook credentials, and brand details for one app or service.",
        href: "/docs/quickstart",
        action: "See the setup flow",
    },
    {
        match: /^\/dashboard\/webhooks(?:\/|$)/,
        key: "webhooks",
        title: "Webhooks trigger transactional mail",
        body: "Use a signed product webhook to send a selected template safely from your application.",
        href: "/docs/triggering",
        action: "Read webhook docs",
    },
    {
        match: /^\/dashboard\/senders(?:\/|$)/,
        key: "senders",
        title: "Senders are verified delivery identities",
        body: "Add the mailbox and SMTP credentials that Elixpo Mails should use to deliver messages.",
        href: "/docs/deliverability",
        action: "Check deliverability",
    },
    {
        match: /^\/dashboard\/logs(?:\/|$)/,
        key: "logs",
        title: "Logs explain every delivery",
        body: "Track queued, sent, and failed messages here, including the latest provider response.",
        href: "/docs/logs",
        action: "Understand statuses",
    },
    {
        match: /^\/dashboard\/templates\/[^/]+\/settings(?:\/|$)/,
        key: "template-settings",
        title: "Choose how this template is delivered",
        body: "One-time templates carry their own footer; webhook templates inherit product delivery and brand settings.",
        href: "/docs/templates",
        action: "Template guide",
    },
    {
        match: /^\/dashboard\/templates(?:\/|$)/,
        key: "templates",
        title: "Templates can belong to you or a workspace",
        body: "Their context badge shows where they live. Switch context before editing a template from another workspace.",
        href: "/docs/templates",
        action: "Template guide",
    },
    {
        match: /^\/dashboard$/,
        key: "welcome",
        title: "Pick up where you left off",
        body: "Create a template, connect a sender, then attach both to a product when you are ready to send.",
        href: "/docs/quickstart",
        action: "Open quickstart",
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
            autoHideDuration={12000}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            sx={{ maxWidth: 420, left: { xs: 16, sm: "auto" }, right: { xs: 16, sm: 24 } }}
        >
            <Paper
                component="output"
                aria-live="polite"
                sx={{
                    width: "100%",
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    borderRadius: "18px",
                    background: "var(--menu-surface)",
                    color: "var(--fg)",
                    boxShadow: "0 22px 65px rgba(20,32,24,.18)",
                }}
            >
                <Box
                    sx={{ height: 4, background: "linear-gradient(90deg,#3a65c7,#e76043,#f0b526)" }}
                />
                <Box sx={{ p: 2.2 }}>
                    <Stack direction="row" alignItems="flex-start" spacing={1.4}>
                        <Box
                            sx={{
                                width: 36,
                                height: 36,
                                flexShrink: 0,
                                display: "grid",
                                placeItems: "center",
                                borderRadius: "50%",
                                bgcolor: "var(--accent-tint)",
                                color: "var(--accent)",
                            }}
                        >
                            <LightbulbOutlinedIcon sx={{ fontSize: 19 }} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                                sx={{
                                    color: "var(--accent)",
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "0.62rem",
                                    fontWeight: 700,
                                    letterSpacing: ".14em",
                                    textTransform: "uppercase",
                                    mb: 0.45,
                                }}
                            >
                                Quick guide
                            </Typography>
                            <Typography
                                sx={{ fontWeight: 750, fontSize: "0.94rem", lineHeight: 1.25 }}
                            >
                                {tip.title}
                            </Typography>
                            <Typography
                                sx={{
                                    mt: 0.7,
                                    color: "var(--fg-muted)",
                                    fontSize: "0.8rem",
                                    lineHeight: 1.55,
                                }}
                            >
                                {tip.body}
                            </Typography>
                        </Box>
                        <IconButton
                            size="small"
                            aria-label="Close tip"
                            onClick={() => setOpen(false)}
                            sx={{ color: "var(--fg-faint)", mt: -0.5, mr: -0.5 }}
                        >
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ mt: 1.8, pl: 6.2 }}
                    >
                        <Button
                            component={Link}
                            href={tip.href}
                            onClick={() => setOpen(false)}
                            endIcon={<EastIcon sx={{ fontSize: "14px !important" }} />}
                            sx={{
                                p: 0,
                                color: "var(--action-fg)",
                                textTransform: "none",
                                fontWeight: 700,
                                fontSize: "0.76rem",
                            }}
                        >
                            {tip.action}
                        </Button>
                        <Button
                            onClick={() => {
                                localStorage.setItem(`mail-tip-dismissed:${tip.key}`, "1");
                                setOpen(false);
                            }}
                            sx={{
                                color: "var(--fg-faint)",
                                textTransform: "none",
                                fontSize: "0.7rem",
                            }}
                        >
                            Hide this tip
                        </Button>
                    </Stack>
                </Box>
            </Paper>
        </Snackbar>
    );
}
