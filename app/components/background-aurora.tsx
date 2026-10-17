"use client";

import { Box } from "@mui/material";

type Variant = "default" | "auth" | "warm" | "docs";

// Overlapping light brand tones used as extremely soft background glowing blobs
const PALETTES: Record<Variant, [string, string, string]> = {
    default: ["rgba(243, 115, 56, 0.07)", "rgba(247, 158, 27, 0.05)", "rgba(235, 0, 27, 0.03)"],
    auth: ["rgba(243, 115, 56, 0.08)", "rgba(247, 158, 27, 0.06)", "rgba(235, 0, 27, 0.04)"],
    warm: ["rgba(243, 115, 56, 0.1)", "rgba(247, 158, 27, 0.07)", "rgba(155, 123, 247, 0.04)"],
    docs: ["rgba(243, 115, 56, 0.06)", "rgba(247, 158, 27, 0.04)", "rgba(235, 0, 27, 0.02)"],
};

interface Props {
    variant?: Variant;
}

const BackgroundAurora = ({ variant = "default" }: Props) => {
    const [a, b, c] = PALETTES[variant];

    return (
        <Box
            aria-hidden
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                overflow: "hidden",
                background: "var(--app-bg)", // Warm Canvas Cream
                "&::before, &::after": {
                    content: '""',
                    position: "absolute",
                    width: "60vmax",
                    height: "60vmax",
                    borderRadius: "50%",
                    filter: "blur(120px)",
                    willChange: "transform",
                },
                "&::before": {
                    top: "-25vmax",
                    left: "-15vmax",
                    background: `radial-gradient(circle, ${a} 0%, transparent 70%)`,
                    animation: "auroraDriftA 30s ease-in-out infinite",
                },
                "&::after": {
                    bottom: "-25vmax",
                    right: "-20vmax",
                    background: `radial-gradient(circle, ${b} 0%, transparent 70%)`,
                    animation: "auroraDriftB 35s ease-in-out infinite",
                },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    top: "35%",
                    left: "50%",
                    width: "45vmax",
                    height: "45vmax",
                    borderRadius: "50%",
                    filter: "blur(130px)",
                    background: `radial-gradient(circle, ${c} 0%, transparent 70%)`,
                    animation: "auroraDriftC 45s ease-in-out infinite",
                    willChange: "transform",
                }}
            />
        </Box>
    );
};

export default BackgroundAurora;
