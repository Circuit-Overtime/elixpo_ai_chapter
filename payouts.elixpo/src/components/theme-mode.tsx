"use client";

import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import { IconButton, Tooltip } from "@mui/material";
import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";

export type ThemeMode = "light" | "dark";
const STORAGE_KEY = "elixpo-theme";

interface ThemeModeCtx {
    mode: ThemeMode;
    toggle: () => void;
    setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeModeCtx>({
    mode: "light",
    toggle: () => {},
    setMode: () => {},
});

export function useThemeMode(): ThemeModeCtx {
    return useContext(Ctx);
}

function apply(mode: ThemeMode) {
    if (typeof document !== "undefined") {
        document.documentElement.dataset.theme = mode;
    }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    // Start from whatever the no-FOUC script already set on <html> (falls back
    // to dark). Reading it avoids a flip on hydration.
    const [mode, setModeState] = useState<ThemeMode>(() => {
        if (typeof document !== "undefined") {
            const t = document.documentElement.dataset.theme;
            if (t === "light" || t === "dark") return t;
        }
        return "light";
    });

    const setMode = (m: ThemeMode) => {
        setModeState(m);
        apply(m);
        try {
            localStorage.setItem(STORAGE_KEY, m);
        } catch {
            // ignore
        }
    };

    // Keep <html> in sync (and pick up a stored value on first mount).
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
            if (stored === "light" || stored === "dark") {
                setModeState(stored);
                apply(stored);
                return;
            }
        } catch {
            // ignore
        }
        apply(mode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Ctx.Provider
            value={{ mode, setMode, toggle: () => setMode(mode === "dark" ? "light" : "dark") }}
        >
            {children}
        </Ctx.Provider>
    );
}

/**
 * Inline script for the document <head> — sets data-theme BEFORE first paint so
 * there's no flash of the wrong theme. Defaults to dark.
 */
export function ThemeModeScript() {
    const js =
        "(function(){try{var t=localStorage.getItem('" +
        STORAGE_KEY +
        "');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'light';}catch(e){document.documentElement.dataset.theme='light';}})();";
    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline string
    return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/** Sun/moon toggle button — drops into any navbar. */
export function ThemeToggle({ size = 38 }: { size?: number }) {
    const { mode, toggle } = useThemeMode();
    return (
        <Tooltip title={mode === "dark" ? "Switch to light" : "Switch to dark"} arrow>
            <IconButton
                onClick={toggle}
                aria-label="Toggle light/dark theme"
                sx={{
                    width: size,
                    height: size,
                    color: "var(--app-fg-muted)",
                    border: "1px solid var(--app-border)",
                    borderRadius: "10px",
                    "&:hover": {
                        color: "var(--app-fg)",
                        background: "var(--app-overlay)",
                        borderColor: "var(--app-accent)",
                    },
                }}
            >
                {mode === "dark" ? (
                    <LightModeIcon sx={{ fontSize: 19 }} />
                ) : (
                    <DarkModeIcon sx={{ fontSize: 19 }} />
                )}
            </IconButton>
        </Tooltip>
    );
}
