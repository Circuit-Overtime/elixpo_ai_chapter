"use client";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import MapPinIcon from "@mui/icons-material/Room";
import { Box, Container, Grid, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { useThemeMode } from "@/components/theme-mode";

const EMAIL = "hello@elixpo.com";

const Footer = () => {
    const { mode } = useThemeMode();

    return (
        <Box
            component="footer"
            sx={{
                background: "var(--app-bg-2)",
                color: "var(--app-fg)",
                pt: { xs: 8, md: 10 },
                pb: { xs: 12, md: 18 }, // very tall bottom padding (148px+)
                px: { xs: 2.5, md: 6 },
                borderTop: "1px solid var(--app-border)",
                position: "relative",
                zIndex: 1,
            }}
        >
            <Container maxWidth="lg" disableGutters>
                {/* Logo Image */}
                <Box
                    component="img"
                    src="/logo.png"
                    alt="Elixpo Pay"
                    sx={{
                        height: 26,
                        width: "auto",
                        mb: 4,
                        display: "block",
                        // logo.png is a dark mark: invert to white only on the
                        // dark (dark-mode) footer; show it as-is on the light footer.
                        filter:
                            mode === "dark"
                                ? "brightness(0) invert(1)"
                                : "none",
                    }}
                />
                {/* Large Conversational Headline */}
                <Typography
                    variant="h2"
                    sx={{
                        fontSize: { xs: "28px", md: "40px" },
                        fontWeight: 500,
                        letterSpacing: "-2%",
                        color: "var(--app-fg)", // Canvas Cream
                        mb: { xs: 6, md: 8 },
                        maxWidth: "600px",
                        lineHeight: 1.2,
                        fontFamily: "var(--font-sofia-sans)",
                    }}
                >
                    We're always here when you need us.
                </Typography>

                {/* 4-Column Link Grid */}
                <Grid container spacing={{ xs: 4, md: 6 }} sx={{ mb: { xs: 6, md: 10 } }}>
                    {/* Column 1: Product */}
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography
                            sx={{
                                fontSize: "13px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)", // Muted cream
                                textTransform: "uppercase",
                                mb: 3,
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Product
                        </Typography>
                        <Stack spacing={2}>
                            <Link href="/about" style={linkStyle}>Platform</Link>
                            <Link href="/pricing" style={linkStyle}>Pricing</Link>
                            <Link href="/dashboard" style={linkStyle}>Merchant Portal</Link>
                            <a href="https://github.com/elixpo/payouts.elixpo" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                                Open Source ↗
                            </a>
                        </Stack>
                    </Grid>

                    {/* Column 2: Resources */}
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography
                            sx={{
                                fontSize: "13px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)",
                                textTransform: "uppercase",
                                mb: 3,
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Resources
                        </Typography>
                        <Stack spacing={2}>
                            <Link href="/docs" style={linkStyle}>Documentation</Link>
                            <Link href="/docs/quickstart" style={linkStyle}>API Reference</Link>
                            <a href="https://status.elixpo.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                                System Status ↗
                            </a>
                            <a href="https://blog.elixpo.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                                Elixpo Blog ↗
                            </a>
                        </Stack>
                    </Grid>

                    {/* Column 3: Legal */}
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography
                            sx={{
                                fontSize: "13px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)",
                                textTransform: "uppercase",
                                mb: 3,
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Legal
                        </Typography>
                        <Stack spacing={2}>
                            <Link href="/privacy" style={linkStyle}>Privacy Policy</Link>
                            <Link href="/terms" style={linkStyle}>Terms of Service</Link>
                            <Link href="/refunds" style={linkStyle}>Refund Policy</Link>
                            <Link href="/contact" style={linkStyle}>Contact Us</Link>
                        </Stack>
                    </Grid>

                    {/* Column 4: Need Help? with prefixed icons */}
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography
                            sx={{
                                fontSize: "13px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                color: "var(--app-fg-muted)",
                                textTransform: "uppercase",
                                mb: 3,
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Need Help?
                        </Typography>
                        <Stack spacing={2.5}>
                            <Box sx={iconLinkStyle}>
                                <ChatBubbleOutlineIcon sx={iconStyle} />
                                <a href={`mailto:${EMAIL}`} style={linkStyle}>hello@elixpo.com</a>
                            </Box>
                            <Box sx={iconLinkStyle}>
                                <CreditCardIcon sx={iconStyle} />
                                <Link href="/contact" style={linkStyle}>Billing Support</Link>
                            </Box>
                            <Box sx={iconLinkStyle}>
                                <MapPinIcon sx={iconStyle} />
                                <span style={textOnlyStyle}>Global Operations</span>
                            </Box>
                            <Box sx={iconLinkStyle}>
                                <HelpOutlineIcon sx={iconStyle} />
                                <Link href="/docs/checkout" style={linkStyle}>Integration FAQ</Link>
                            </Box>
                        </Stack>
                    </Grid>
                </Grid>

                {/* 1px White Divider */}
                <Box
                    sx={{
                        width: "100%",
                        height: "1px",
                        background: "var(--app-border)",
                        mb: 4,
                    }}
                />

                {/* Bottom Row */}
                <Stack
                    direction={{ xs: "column", md: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", md: "center" }}
                    spacing={3}
                >
                    {/* Copyright & Info */}
                    <Stack spacing={1}>
                        <Typography
                            sx={{
                                fontSize: "14px",
                                color: "var(--app-fg-muted)",
                                fontFamily: "var(--font-sofia-sans)",
                                fontWeight: 450,
                            }}
                        >
                            © {new Date().getFullYear()} Elixpo Pay. All rights reserved.
                        </Typography>
                        <Typography
                            sx={{
                                fontSize: "12px",
                                color: "var(--app-fg-muted)",
                                fontFamily: "var(--font-sofia-sans)",
                            }}
                        >
                            Elixpo Pay lets your SaaS take payments and pay out creators through one simple integration.
                        </Typography>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
};

// Styling definitions
const linkStyle: React.CSSProperties = {
    color: "var(--app-fg)",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 450,
    fontFamily: "var(--font-sofia-sans)",
    transition: "opacity 0.2s ease",
};

const textOnlyStyle: React.CSSProperties = {
    color: "var(--app-fg-muted)",
    fontSize: "14px",
    fontWeight: 450,
    fontFamily: "var(--font-sofia-sans)",
};

const iconLinkStyle = {
    display: "flex",
    alignItems: "center",
    gap: 1.5,
};

const iconStyle = {
    fontSize: 18,
    color: "var(--app-fg-muted)",
};

export default Footer;
