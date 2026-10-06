import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  applyTheme,
  chooseTheme,
  getServerTheme,
  isTheme,
  readDomTheme,
  readStoredTheme,
  resolveTheme,
  subscribeToTheme,
  syncThemeColor,
  THEME_STORAGE_KEY,
  type Theme,
} from './themeStore';

/**
 * ThemeProvider — mounts the theme behaviour. It renders no DOM of its own.
 *
 * On mount it (1) makes sure `<html data-theme>` is set (the inline script in index.html normally
 * did this before paint; this covers environments without it), (2) keeps the document following
 * the system setting while no explicit choice is stored, (3) mirrors choices made in other tabs,
 * and (4) keeps `<meta name="theme-color">` in sync.
 *
 * Hydration-safe: the server snapshot is always "dark"; React reconciles to the real attribute
 * after hydration without a mismatch warning (see useTheme).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isTheme(document.documentElement.dataset.theme)) {
      applyTheme(resolveTheme());
    } else {
      syncThemeColor();
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      if (readStoredTheme() === null) applyTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', followSystem);

    const followOtherTabs = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY) applyTheme(resolveTheme());
    };
    window.addEventListener('storage', followOtherTabs);

    return () => {
      media.removeEventListener('change', followSystem);
      window.removeEventListener('storage', followOtherTabs);
    };
  }, []);

  return <>{children}</>;
}

export interface ThemeApi {
  /** The theme the document is showing. "dark" during server rendering and hydration. */
  theme: Theme;
  /** Switches the theme and stores it as the user's explicit choice. */
  setTheme: (theme: Theme) => void;
  /** Flips between dark and light and stores the result. */
  toggleTheme: () => void;
}

/**
 * useTheme — reads the live theme from `<html data-theme>` and exposes the setters.
 * Works anywhere in the tree (it subscribes to the document, not to React context), but the
 * app must still render <ThemeProvider> once so the system/storage listeners are active.
 */
export function useTheme(): ThemeApi {
  const theme = useSyncExternalStore(subscribeToTheme, readDomTheme, getServerTheme);
  const setTheme = useCallback((next: Theme) => chooseTheme(next), []);
  const toggleTheme = useCallback(() => chooseTheme(readDomTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, setTheme, toggleTheme };
}
