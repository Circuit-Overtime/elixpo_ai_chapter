"use client";

import { Box, Container, Typography } from "@mui/material";
import type React from "react";
import BackgroundAurora from "./background-aurora";
import Footer from "./footer";
import Navbar from "./navbar";

/** Shared shell for prose pages (privacy, terms). Styled with warm cream theme. */
export default function LegalShell({
    title,
    updated,
    children,
}: {
    title: string;
    updated: string;
    children: React.ReactNode;
}) {
    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                color: "var(--app-fg)", // Ink Black
                fontFamily: "var(--font-sofia-sans), sans-serif",
            }}
        >
            <BackgroundAurora variant="docs" />
            <Box sx={{ position: "relative", zIndex: 1 }}>
                <Navbar />
                {/* Clear the floating navbar */}
                <Container maxWidth="md" sx={{ pt: { xs: 12, md: 18 }, pb: 8 }}>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "2rem", md: "2.6rem" },
                            letterSpacing: "-2%",
                            color: "var(--app-fg)",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        {title}
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--app-fg-muted)", // Slate Gray
                            mt: 1,
                            mb: 5,
                            fontSize: "0.9rem",
                            fontFamily: "var(--font-sofia-sans)",
                        }}
                    >
                        Last updated {updated}
                    </Typography>
                    <Box
                        sx={{
                            fontFamily: "var(--font-sofia-sans)",
                            "& h2": {
                                fontWeight: 500,
                                fontSize: "1.4rem",
                                mt: 5,
                                mb: 2,
                                color: "var(--app-fg)",
                                letterSpacing: "-1%",
                            },
                            "& p": {
                                color: "var(--app-fg)", // Charcoal
                                lineHeight: 1.7,
                                mb: 2,
                                fontSize: "1rem",
                                fontWeight: 450,
                            },
                            "& ul": {
                                color: "var(--app-fg)",
                                lineHeight: 1.7,
                                pl: 3,
                                mb: 2,
                            },
                            "& li": { mb: 0.8 },
                            "& a": {
                                color: "#3860BE", // Link Blue
                                textDecoration: "none",
                                "&:hover": { textDecoration: "underline" },
                            },
                            "& code": {
                                fontFamily: "var(--font-geist-mono)",
                                fontSize: "0.85rem",
                                background: "var(--app-overlay)",
                                color: "#CF4500", // Signal Orange
                                px: 0.8,
                                py: 0.2,
                                borderRadius: "4px",
                            },
                        }}
                    >
                        {children}
                    </Box>
                </Container>
                <Footer />
            </Box>
        </Box>
    );
}
