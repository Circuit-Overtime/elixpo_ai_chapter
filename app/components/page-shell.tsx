"use client";

import { Box } from "@mui/material";
import type React from "react";
import { useEffect } from "react";
import Lenis from "lenis";
import BackgroundAurora from "./background-aurora";
import Footer from "./footer";
import Navbar from "./navbar";

/** Standard marketing/content shell: warm cream theme, floating navbar, footer, Lenis scroll. */
export default function PageShell({
    children,
    variant = "default",
}: {
    children: React.ReactNode;
    variant?: "default" | "auth" | "warm" | "docs";
}) {
    // Initialize Lenis scroll smoothly
    useEffect(() => {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
            touchMultiplier: 2,
        });

        function raf(time: number) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }

        requestAnimationFrame(raf);

        return () => {
            lenis.destroy();
        };
    }, []);

    return (
        <Box
            sx={{
                position: "relative",
                minHeight: "100vh",
                color: "var(--app-fg)", // Ink Black text
                fontFamily: "var(--font-sofia-sans), sans-serif",
            }}
        >
            <BackgroundAurora variant={variant} />
            <Box sx={{ position: "relative", zIndex: 1 }}>
                <Navbar />
                {/* Clear the floating navbar */}
                <Box component="main" sx={{ pt: { xs: 10, md: 16 } }}>
                    {children}
                </Box>
                <Footer />
            </Box>
        </Box>
    );
}
