'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

// Theme colours matched to globals.css tokens and the Safari tint source.
const THEME_COLORS = { dark: '#131922', light: '#ffffff' };

function ensureThemeColorMeta() {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  return meta;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('lixblogs_theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
    setMounted(true);
  }, []);

  // Apply theme and update all status-bar colour hooks.
  useEffect(() => {
    if (!mounted) return;

    const color = THEME_COLORS[theme];

    // Keep explicit background colors on the elements Safari observes.
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    localStorage.setItem('lixblogs_theme', theme);

    // Updating the meta tag covers older iOS. Nudging its value also prompts
    // newer Safari versions to re-sample the live root/body color.
    const meta = ensureThemeColorMeta();
    meta.setAttribute('content', color);
    let nudgeFrame;
    let restoreFrame;
    nudgeFrame = requestAnimationFrame(() => {
      meta.setAttribute('content', `${color}fe`);
      restoreFrame = requestAnimationFrame(() => {
        meta.setAttribute('content', color);
      });
    });

    return () => {
      cancelAnimationFrame(nudgeFrame);
      if (restoreFrame) cancelAnimationFrame(restoreFrame);
    };
  }, [theme, mounted]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
