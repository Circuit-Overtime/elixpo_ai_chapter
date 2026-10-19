"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { Box, Button, Snackbar, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

const ACCENT = "var(--accent)";
const EMAIL = "hello@elixpo.com";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
    {
        heading: "Product",
        links: [
            { label: "Pricing", href: "/pricing" },
            { label: "Sign in", href: "/login" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "Docs", href: "/docs" },
        ],
    },
    {
        heading: "Company",
        links: [
            { label: "Elixpo", href: "https://elixpo.com" },
            { label: "GitHub", href: "https://github.com/elixpo/mail.elixpo" },
            { label: "Contact", href: "mailto:hello@elixpo.com" },
        ],
    },
    {
        heading: "Legal",
        links: [
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
            { label: "Content Policy", href: "/content-policy" },
        ],
    },
];

const Footer = () => {
    const [copied, setCopied] = useState(false);

    const copyEmail = async () => {
        try {
            await navigator.clipboard.writeText(EMAIL);
            setCopied(true);
        } catch {
            window.location.href = `mailto:${EMAIL}`;
        }
    };

    return (
        <Box
            component="footer"
            sx={{
                position: "relative",
                zIndex: 1,
                mt: { xs: 8, md: 12 },
                borderTop: "1px solid #292933",
                background: "#17171c", // Near-Black Primary
                color: "#ffffff",
                pt: { xs: 7, md: 9 },
                pb: { xs: 5, md: 6 },
            }}
        >
            <Box sx={{ maxWidth: "1200px", mx: "auto", px: { xs: 2.5, md: 4 } }}>
                <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={{ xs: 6, lg: 8 }}
                    justifyContent="space-between"
                    sx={{ mb: { xs: 6, md: 8 } }}
                >
                    {/* Newsletter Block on Left */}
                    <Box sx={{ maxWidth: 440, width: "100%" }}>
                        <Typography
                            sx={{
                                color: "#ff7759", // Coral accent
                                fontSize: "12px",
                                fontWeight: 500,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                mb: 1,
                                fontFamily: "var(--font-mono)",
                            }}
                        >
                            AI moves fast
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                color: "#ffffff",
                                fontWeight: 400,
                                fontSize: "1.75rem",
                                letterSpacing: "-0.02em",
                                lineHeight: 1.2,
                                mb: 2,
                                fontFamily: "var(--font-display)",
                            }}
                        >
                            Stay updated on modern transactional email tech.
                        </Typography>

                        {/* Single-line Email Input — coming soon */}
                        <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{
                                position: "relative",
                                maxWidth: 360,
                                borderBottom: "1.5px solid #292933",
                                pb: 0.5,
                                opacity: 0.55,
                            }}
                        >
                            <Box
                                component="input"
                                type="email"
                                disabled
                                placeholder="Subscribe to updates"
                                sx={{
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    color: "#ffffff",
                                    fontSize: "0.95rem",
                                    outline: "none",
                                    py: 1,
                                    cursor: "not-allowed",
                                    "&::placeholder": {
                                        color: "rgba(255,255,255,0.3)",
                                    },
                                }}
                            />
                            <Box
                                component="span"
                                sx={{
                                    flexShrink: 0,
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    color: "#ffad9b",
                                    border: "1px solid rgba(255,119,89,0.3)",
                                    background: "rgba(255,119,89,0.1)",
                                    borderRadius: "20px",
                                    px: 1,
                                    py: 0.3,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Coming soon
                            </Box>
                        </Stack>
                        <Typography
                            sx={{ color: "#93939f", fontSize: "11px", mt: 1.5, lineHeight: 1.4 }}
                        >
                            Product updates and changelog — subscriptions open soon.
                        </Typography>
                    </Box>

                    {/* Columns on Right */}
                    <Stack spacing={{ xs: 3, sm: 0 }}>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            spacing={{ xs: 0, sm: 6, md: 8 }}
                        >
                            {COLUMNS.map((col) => (
                                <Box key={col.heading} sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography
                                        sx={{
                                            color: "#ffffff", // White section labels
                                            fontSize: "12px",
                                            fontWeight: 500,
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            mb: 2,
                                            fontFamily: "var(--font-mono)",
                                        }}
                                    >
                                        {col.heading}
                                    </Typography>
                                    <Stack spacing={1.2}>
                                        {col.links.map((l) => (
                                            <Link
                                                key={l.label}
                                                href={l.href}
                                                style={{
                                                    color: "#93939f", // Muted slate links
                                                    textDecoration: "none",
                                                    fontSize: "0.88rem",
                                                    fontFamily: "var(--font-sans)",
                                                    transition: "color 0.2s ease",
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.color = "#ffffff";
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.color = "#93939f";
                                                }}
                                            >
                                                {l.label}
                                            </Link>
                                        ))}
                                    </Stack>
                                </Box>
                            ))}
                        </Stack>

                        <Box>
                            <Typography
                                sx={{
                                    color: "#ffffff",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    mb: 2,
                                    fontFamily: "var(--font-mono)",
                                }}
                            >
                                Contact
                            </Typography>
                            <Tooltip title={copied ? "Copied!" : "Click to copy"} arrow>
                                <Button
                                    onClick={copyEmail}
                                    sx={{
                                        textTransform: "none",
                                        color: "#93939f",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.85rem",
                                        border: "1px solid #292933",
                                        borderRadius: "32px", // Pill outline
                                        px: 2,
                                        py: 0.7,
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            color: "#ffffff",
                                            borderColor: "#ff7759",
                                            background: "rgba(255, 119, 89, 0.05)",
                                        },
                                    }}
                                >
                                    {EMAIL}
                                </Button>
                            </Tooltip>
                        </Box>
                    </Stack>
                </Stack>

                <Box
                    sx={{
                        pt: 3,
                        borderTop: "1px solid #292933",
                        display: "flex",
                        flexDirection: { xs: "column", sm: "row" },
                        justifyContent: "space-between",
                        alignItems: { xs: "flex-start", sm: "center" },
                        gap: 1.5,
                        color: "#93939f", // Muted slate
                        fontSize: "0.8rem",
                    }}
                >
                    <Typography sx={{ fontSize: "inherit" }}>
                        © {new Date().getFullYear()} Elixpo · Event-based transactional email
                    </Typography>
                    <Typography sx={{ fontSize: "inherit" }}>
                        Transactional email infrastructure for the Elixpo ecosystem
                    </Typography>
                </Box>
            </Box>

            <Snackbar
                open={copied}
                autoHideDuration={2000}
                onClose={() => setCopied(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                message={`Copied ${EMAIL}`}
            />
        </Box>
    );
};

export default Footer;
