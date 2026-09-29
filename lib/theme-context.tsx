'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  applyTheme, isTheme, isThemedPath, resolveTheme, THEME_STORAGE_KEY, type Theme,
} from '@/lib/theme-boot';

export type { Theme } from '@/lib/theme-boot';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

function readSaved(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemPrefersLight(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches;
}

/**
 * Tema de la app. Lo público es siempre oscuro; en el dashboard manda la
 * preferencia guardada y, sin ella, la del sistema (ver lib/theme-boot.ts).
 * El primer pintado ya lo resolvió THEME_BOOT_SCRIPT en <head>.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const [theme, setTheme] = useState<Theme>('dark');

  // Reaplica en cada navegación: pasar de la landing (oscura) al dashboard con
  // tema claro, o al revés, no recarga la página.
  useEffect(() => {
    const next = resolveTheme(pathname, readSaved(), systemPrefersLight());
    setTheme(next);
    applyTheme(next);
  }, [pathname]);

  // Sin preferencia guardada, el dashboard sigue los cambios del sistema.
  useEffect(() => {
    if (!isThemedPath(pathname) || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      if (isTheme(readSaved())) return;
      const next: Theme = mq.matches ? 'light' : 'dark';
      setTheme(next);
      applyTheme(next);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [pathname]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* modo privado */ }
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
