"use client";

import DescriptionIcon from "@mui/icons-material/Description";
import GitHubIcon from "@mui/icons-material/GitHub";
import EmailIcon from "@mui/icons-material/MailOutline";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import PageShell from "../components/page-shell";

const EMAIL = "hello@elixpo.com";

export default function ContactPage() {
    return (
        <PageShell variant="default">
            <Container
                maxWidth="sm"
                sx={{ pb: { xs: 8, md: 12 } }}
            >
                {/* Header */}
                <Stack
                    alignItems="center"
                    textAlign="center"
                    spacing={1.5}
                    sx={{ mb: 6 }}
                >
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: "#CF4500" }} />
                        <Typography
                            sx={{
                                fontSize: "14px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)",
                                textTransform: "uppercase",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            CONTACT
                        </Typography>
                    </Stack>
                    <Typography
                        variant="h2"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "32px", md: "42px" },
                            letterSpacing: "-2%",
                            color: "var(--app-fg)",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Get in touch
                    </Typography>
                    <Typography
                        sx={{
                            maxWidth: 480,
                            color: "var(--app-fg)",
                            fontSize: "16px",
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        Elixpo Pay is managed by Elixpo. Questions about a charge, pricing, or adding payments to your app? We're here to help.
                    </Typography>
                </Stack>

                {/* Contact Card Box */}
                <Box
                    sx={{
                        p: { xs: 4, md: 5 },
                        borderRadius: "24px",
                        background: "var(--app-bg-2)", // Lifted Cream
                        border: "1.5px solid var(--app-overlay)",
                        boxShadow: "rgba(0, 0, 0, 0.04) 0px 4px 24px 0px",
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: "11px",
                            color: "var(--app-fg-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 700,
                            mb: 1,
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Support Email
                    </Typography>
                    <Typography
                        variant="h3"
                        sx={{
                            fontWeight: 500,
                            fontSize: "24px",
                            color: "var(--app-fg)",
                            letterSpacing: "-1px",
                            mb: 1,
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        {EMAIL}
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)",
                            fontSize: "14px",
                            mb: 4,
                            fontFamily: "var(--font-sofia-sans)",
                            fontWeight: 450,
                        }}
                    >
                        For transaction issues or billing requests, we respond within two business days.
                    </Typography>

                    {/* Action buttons */}
                    <Stack
                        direction="column"
                        spacing={2}
                    >
                        {/* Primary Button — Ink Pill */}
                        <Button
                            component="a"
                            href={`mailto:${EMAIL}`}
                            variant="contained"
                            disableElevation
                            startIcon={<EmailIcon />}
                            sx={{
                                textTransform: "none",
                                fontWeight: 500,
                                fontSize: "16px",
                                color: "var(--app-on-ink)", // Light text on ink
                                background: "var(--app-ink)", // Ink Black background
                                border: "1.5px solid var(--app-ink)",
                                borderRadius: "20px", // Signature button radius
                                py: 1.4,
                                fontFamily: "var(--font-sofia-sans)",
                                letterSpacing: "-0.32px",
                                "&:hover": {
                                    background: "var(--app-ink)",
                                    borderColor: "var(--app-ink)",
                                },
                            }}
                        >
                            Email Support Team
                        </Button>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            {/* Secondary Buttons — Outlined Pills */}
                            <Button
                                component="a"
                                href="https://github.com/elixpo/payouts.elixpo"
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="outlined"
                                disableElevation
                                startIcon={<GitHubIcon />}
                                sx={outlinedButtonStyle}
                            >
                                GitHub
                            </Button>
                            <Button
                                component={Link}
                                href="/docs"
                                variant="outlined"
                                disableElevation
                                startIcon={<DescriptionIcon />}
                                sx={outlinedButtonStyle}
                            >
                                API Docs
                            </Button>
                        </Stack>
                    </Stack>
                </Box>

                {/* Policies Link */}
                <Typography
                    sx={{
                        textAlign: "center",
                        color: "var(--app-fg-muted)",
                        fontSize: "14px",
                        mt: 4,
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    For merchant refund or cancel requests, please view our{" "}
                    <Box
                        component={Link}
                        href="/refunds"
                        sx={{ color: "#3860BE", textDecoration: "none", fontWeight: 500, "&:hover": { textDecoration: "underline" } }}
                    >
                        Refund Policy
                    </Box>
                    .
                </Typography>
            </Container>
        </PageShell>
    );
}

const outlinedButtonStyle = {
    flex: 1,
    textTransform: "none",
    fontWeight: 500,
    fontSize: "15px",
    color: "var(--app-fg)",
    background: "var(--app-surface)",
    border: "1.5px solid var(--app-fg)",
    borderRadius: "20px",
    py: 1.2,
    fontFamily: "var(--font-sofia-sans)",
    "&:hover": {
        background: "var(--app-overlay)",
        borderColor: "var(--app-fg)",
    },
};
