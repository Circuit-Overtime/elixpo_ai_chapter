"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
    theme: ThemeMode;
    setTheme: (t: ThemeMode) => void;
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: "light",
    setTheme: () => {},
    toggle: () => {},
});

function persist(theme: ThemeMode) {
    try {
        localStorage.setItem("elixpo_theme", theme);
    } catch {
        /* storage disabled */
    }
    document.cookie = `elixpo_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>("light");

    useEffect(() => {
        const current = document.documentElement.getAttribute("data-theme");
        if (current === "dark" || current === "light") setThemeState(current);
    }, []);

    const setTheme = useCallback((t: ThemeMode) => {
        setThemeState(t);
        document.documentElement.setAttribute("data-theme", t);
        persist(t);
    }, []);

    const toggle = useCallback(() => {
        setThemeState((prev) => {
            const next: ThemeMode = prev === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            persist(next);
            return next;
        });
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    return useContext(ThemeContext);
}

/** Inline script — sets data-theme before first paint (no flash). Defaults to light (cream). */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('elixpo_theme');if(!t){var m=document.cookie.match(/(?:^|; )elixpo_theme=([^;]+)/);t=m&&m[1];}document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
