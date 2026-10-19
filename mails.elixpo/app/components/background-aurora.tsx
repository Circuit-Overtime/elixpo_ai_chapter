"use client";

import { Box } from "@mui/material";

/** Single themed backdrop. In light (oreo) the glows fade out via
 *  --aurora-opacity (=0); in dark they bloom over the near-black base. */
const BackgroundAurora = () => {
    return (
        <Box
            aria-hidden
            sx={{
                position: "fixed",
                inset: 0,
                zIndex: 0,
                pointerEvents: "none",
                overflow: "hidden",
                background: "var(--bg)",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    top: "-10vmax",
                    left: "20%",
                    width: "60vmax",
                    height: "40vmax",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(0, 60, 51, 0.28) 0%, transparent 70%)",
                    filter: "blur(80px)",
                    opacity: "var(--aurora-opacity)",
                    transition: "opacity 0.3s ease",
                },
                "&::after": {
                    content: '""',
                    position: "absolute",
                    bottom: "-15vmax",
                    right: "10%",
                    width: "50vmax",
                    height: "50vmax",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(7, 24, 41, 0.25) 0%, transparent 70%)",
                    filter: "blur(90px)",
                    opacity: "var(--aurora-opacity)",
                    transition: "opacity 0.3s ease",
                },
            }}
        />
    );
};

export default BackgroundAurora;
