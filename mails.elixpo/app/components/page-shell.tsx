"use client";

import { Box } from "@mui/material";
import { usePathname } from "next/navigation";
import type React from "react";
import Footer from "./footer";
import Navbar from "./navbar";

/** Standard marketing/content shell: navbar + footer over the global aurora
    (the dark aurora background is rendered once in the root layout). The
    `variant` prop is retained for call-site compatibility but no longer drives
    a per-page background. */
export default function PageShell({
    children,
    variant: _variant = "default",
}: {
    children: React.ReactNode;
    variant?: "default" | "auth" | "warm" | "docs";
}) {
    const pathname = usePathname() || "";
    const isDashboard = pathname.startsWith("/dashboard");

    return (
        <Box sx={{ position: "relative", minHeight: "100vh", color: "var(--fg)" }}>
            <Box sx={{ position: "sticky", top: { xs: 8, md: 14 }, zIndex: 1000, px: 2 }}>
                <Navbar />
            </Box>
            <Box component="main">{children}</Box>
            <Footer />
        </Box>
    );
}
