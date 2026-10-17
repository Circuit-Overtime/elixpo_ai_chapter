'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getActiveSeasonalTheme } from './index';

const SeasonalThemeContext = createContext({ activeTheme: null });
const PALETTE_PROPERTIES = {
  primary: '--seasonal-primary',
  primaryHover: '--seasonal-primary-hover',
  secondary: '--seasonal-secondary',
  focus: '--seasonal-focus',
};

function clearPalette(root) {
  Object.values(PALETTE_PROPERTIES).forEach((property) => root.style.removeProperty(property));
}

export function SeasonalThemeProvider({ children }) {
  const [activeTheme, setActiveTheme] = useState(() => getActiveSeasonalTheme());

  useEffect(() => {
    const refresh = () => setActiveTheme(getActiveSeasonalTheme());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const faviconId = 'lixblogs-seasonal-favicon';
    document.getElementById(faviconId)?.remove();

    if (!activeTheme) {
      root.removeAttribute('data-seasonal-theme');
      clearPalette(root);
      return undefined;
    }

    root.setAttribute('data-seasonal-theme', activeTheme.id);
    Object.entries(PALETTE_PROPERTIES).forEach(([key, property]) => {
      if (activeTheme.palette?.[key]) root.style.setProperty(property, activeTheme.palette[key]);
    });
    if (activeTheme.icon) {
      const favicon = document.createElement('link');
      favicon.id = faviconId;
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      favicon.href = activeTheme.icon;
      document.head.appendChild(favicon);
    }

    return () => {
      root.removeAttribute('data-seasonal-theme');
      clearPalette(root);
      document.getElementById(faviconId)?.remove();
    };
  }, [activeTheme]);

  return (
    <SeasonalThemeContext.Provider value={{ activeTheme }}>
      {children}
    </SeasonalThemeContext.Provider>
  );
}

export function useSeasonalTheme() {
  return useContext(SeasonalThemeContext);
}
