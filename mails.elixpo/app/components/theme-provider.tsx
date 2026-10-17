"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

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

/** Persist the choice to both localStorage (client) and a cookie (so the
 *  no-flash boot script can read it on the next SSR load). */
function persist(theme: ThemeMode) {
    try {
        localStorage.setItem("mail_theme", theme);
    } catch {
        /* private mode / storage disabled */
    }
    document.cookie = `mail_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    // Start from whatever the boot script already put on <html> to avoid a flash.
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

/** Inline script that sets data-theme before first paint (no flash of wrong
 *  theme). Defaults to light (the oreo palette). Rendered in <body> head. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('mail_theme');if(!t){var m=document.cookie.match(/(?:^|; )mail_theme=([^;]+)/);t=m&&m[1];}document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
