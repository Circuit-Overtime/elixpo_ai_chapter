"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

/** Light/dark theme toggle. Cream/coral aware via CSS vars. */
export default function ThemeToggle({ size = 18 }: { size?: number }) {
    const { theme, toggle } = useTheme();
    const isDark = theme === "dark";
    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={
                isDark ? "Switch to light theme" : "Switch to dark theme"
            }
            title={isDark ? "Switch to light" : "Switch to dark"}
            className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border transition-all"
            style={{
                color: "var(--fg-muted)",
                borderColor: "var(--border)",
                background: "transparent",
            }}
        >
            {isDark ? <Sun size={size} /> : <Moon size={size} />}
        </button>
    );
}
