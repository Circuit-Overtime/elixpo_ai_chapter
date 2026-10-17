"use client";

import { Box } from "@mui/material";

type Variant = "default" | "auth" | "warm" | "docs";

const PALETTES: Record<Variant, [string, string, string]> = {
    default: ["#9b7bf7", "#5fb6ff", "#7c5cff"],
    auth: ["#9b7bf7", "#ff7cc9", "#5fb6ff"],
    warm: ["#ff8a5b", "#ff5b9a", "#9b7bf7"],
    docs: ["#6366f1", "#a855f7", "#3b82f6"],
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
                background:
                    "linear-gradient(180deg, #0b0d12 0%, #11151c 50%, #0b0d12 100%)",
                "&::before, &::after": {
                    content: '""',
                    position: "absolute",
                    width: "55vmax",
                    height: "55vmax",
                    borderRadius: "50%",
                    filter: "blur(110px)",
                    opacity: 0.32,
                    willChange: "transform",
                },
                "&::before": {
                    top: "-20vmax",
                    left: "-15vmax",
                    background: `radial-gradient(circle, ${a} 0%, transparent 65%)`,
                    animation: "auroraDriftA 28s ease-in-out infinite",
                },
                "&::after": {
                    bottom: "-25vmax",
                    right: "-20vmax",
                    background: `radial-gradient(circle, ${b} 0%, transparent 65%)`,
                    animation: "auroraDriftB 34s ease-in-out infinite",
                },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    top: "40%",
                    left: "55%",
                    width: "40vmax",
                    height: "40vmax",
                    borderRadius: "50%",
                    filter: "blur(120px)",
                    opacity: 0.18,
                    background: `radial-gradient(circle, ${c} 0%, transparent 65%)`,
                    animation: "auroraDriftC 40s ease-in-out infinite",
                    willChange: "transform",
                }}
            />
        </Box>
    );
};

export default BackgroundAurora;
