/**
 * Theme store — a thin layer over the real source of truth, `<html data-theme>`.
 *
 * Rules (ARCHITECTURE.md §5):
 * - `<html data-theme="dark" | "light">` drives every token. Dark when the attribute is missing.
 * - `localStorage["kk-theme"]` holds an explicit user choice. Absent = follow the system setting,
 *   live, until the user chooses.
 * - `<meta name="theme-color">` always matches the current canvas colour.
 * - index.html (infra) sets the attribute before first paint with the same key and rules.
 *
 * Nothing here touches `window` or `document` at module load, so the module is SSR-safe.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'kk-theme';
export const DEFAULT_THEME: Theme = 'dark';

/** Canvas colours mirrored from tokens.css, used for theme-color when styles are not computable. */
const CANVAS_FALLBACK: Record<Theme, string> = { dark: '#0a0a0a', light: '#f7f7f5' };

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** The explicit choice in localStorage, or null when the user has not chosen (or storage is blocked). */
export function readStoredTheme(): Theme | null {
  if (!hasDom()) return null;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** The operating-system preference. */
export function readSystemTheme(): Theme {
  if (!hasDom() || typeof window.matchMedia !== 'function') return DEFAULT_THEME;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The theme the document is showing right now (the attribute on <html>). */
export function readDomTheme(): Theme {
  if (!hasDom()) return DEFAULT_THEME;
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function getServerTheme(): Theme {
  return DEFAULT_THEME;
}

/** Keeps `<meta name="theme-color">` equal to the computed canvas colour. Creates the tag if missing. */
export function syncThemeColor(theme: Theme = readDomTheme()): void {
  if (!hasDom()) return;
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  const computed = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim();
  meta.content = computed || CANVAS_FALLBACK[theme];
}

/** Applies a theme to the document without recording a choice. */
export function applyTheme(theme: Theme): void {
  if (!hasDom()) return;
  if (document.documentElement.dataset.theme !== theme) {
    document.documentElement.dataset.theme = theme;
  }
  syncThemeColor(theme);
}

/** Applies a theme AND records it as the user's explicit choice. */
export function chooseTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / storage blocked: the choice simply does not persist */
  }
}

/** The theme that should be showing: the stored choice, else the system preference. */
export function resolveTheme(): Theme {
  return readStoredTheme() ?? readSystemTheme();
}

/**
 * Subscribes to changes of `<html data-theme>` (for useSyncExternalStore). Any writer — this
 * module, the inline bootstrap script, devtools — triggers the callback.
 */
export function subscribeToTheme(callback: () => void): () => void {
  if (!hasDom() || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
