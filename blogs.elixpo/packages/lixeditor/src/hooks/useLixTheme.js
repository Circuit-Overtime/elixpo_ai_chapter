'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const LixThemeContext = createContext(null);

/**
 * Theme provider for the LixEditor package.
 * Manages light/dark theme and applies it to the document.
 *
 * Two modes:
 *   1. **Controlled** — pass `theme` (and optionally `onThemeChange`). The
 *      consumer owns the theme state; storage / internal state are ignored.
 *      Use this when an external store (Zustand, Redux, etc.) already
 *      tracks theme — e.g. when embedding the editor inside an app whose
 *      own theme toggle should drive the editor too.
 *   2. **Uncontrolled** — pass `defaultTheme`. Initial value is read from
 *      `localStorage[storageKey]` if present, otherwise from `defaultTheme`.
 *      `toggleTheme` / `setTheme` mutate internal state and persist to
 *      storage. This was the only mode before — fully backwards-compatible.
 *
 * @param {Object} props
 * @param {'light'|'dark'} [props.theme] - Controlled theme. When set, the
 *        provider becomes controlled and ignores storage / defaultTheme.
 * @param {(t: 'light'|'dark') => void} [props.onThemeChange] - Called by
 *        `toggleTheme` / `setTheme` when controlled, so the consumer can
 *        update its own store. No-op if absent.
 * @param {'light'|'dark'} [props.defaultTheme='light'] - Initial theme for
 *        the uncontrolled mode.
 * @param {string|null} [props.storageKey='lixeditor_theme'] - localStorage
 *        key for persistence (uncontrolled only). Pass `null` to disable
 *        persistence entirely.
 * @param {React.ReactNode} props.children
 */
export function LixThemeProvider({
  children,
  theme: controlledTheme,
  onThemeChange,
  defaultTheme = 'light',
  storageKey = 'lixeditor_theme',
}) {
  const isControlled = controlledTheme !== undefined;
  const [internalTheme, setInternalTheme] = useState(defaultTheme);
  const [mounted, setMounted] = useState(false);

  // Hydrate internal state from storage on mount (uncontrolled only).
  useEffect(() => {
    if (!isControlled && storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'dark' || saved === 'light') setInternalTheme(saved);
      } catch {}
    }
    setMounted(true);
    // Intentionally only on first mount — storage is the *initial* source
    // of truth, not a live binding. Subsequent updates flow through
    // setTheme/toggleTheme/controlled-prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled prop wins; otherwise internal state.
  const theme = isControlled ? controlledTheme : internalTheme;

  // Apply theme to <html> + persist (uncontrolled). Controlled mode also
  // persists so a later switch to uncontrolled mode picks up where the
  // controlled value left off — that's a nicer consumer experience.
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    if (storageKey) {
      try { localStorage.setItem(storageKey, theme); } catch {}
    }
  }, [theme, mounted, storageKey]);

  const setTheme = (next) => {
    if (isControlled) {
      if (typeof onThemeChange === 'function') onThemeChange(next);
      return;
    }
    setInternalTheme(next);
  };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const isDark = theme === 'dark';

  return (
    <LixThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, mounted }}>
      {children}
    </LixThemeContext.Provider>
  );
}

/**
 * Hook to access the current theme.
 * Falls back to detecting data-theme attribute if no provider is present.
 */
export function useLixTheme() {
  const ctx = useContext(LixThemeContext);
  if (ctx) return ctx;

  // Fallback: detect theme from DOM
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  return { theme: isDark ? 'dark' : 'light', isDark, toggleTheme: () => {}, setTheme: () => {}, mounted: true };
}
