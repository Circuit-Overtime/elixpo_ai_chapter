"use client";

import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton, Tooltip } from "@mui/material";
import { useTheme } from "./theme-provider";

/** Light/dark theme toggle. Sits in the topbar / navbar. */
export default function ThemeToggle({ size = 20 }: { size?: number }) {
    const { theme, toggle } = useTheme();
    const isDark = theme === "dark";
    return (
        <Tooltip title={isDark ? "Switch to light" : "Switch to dark"} arrow>
            <IconButton
                onClick={toggle}
                aria-label="Toggle color theme"
                sx={{
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    width: 38,
                    height: 38,
                    transition: "all 0.15s ease",
                    "&:hover": {
                        color: "var(--accent)",
                        borderColor: "var(--accent-border)",
                        background: "var(--accent-tint)",
                    },
                }}
            >
                {isDark ? (
                    <LightModeIcon sx={{ fontSize: size }} />
                ) : (
                    <DarkModeIcon sx={{ fontSize: size }} />
                )}
            </IconButton>
        </Tooltip>
    );
}
