/**
 * CONTRACT (architect): theme API used by the app shell and the pages.
 * - <html data-theme="dark|light"> is the single source of truth for CSS.
 * - localStorage["kk-theme"] holds an explicit choice ("dark" | "light"); absent = follow system.
 * - index.html sets data-theme before first paint (inline script, owned by infra).
 *
 * Implemented by the design agent. Keep these exports.
 *
 *   <ThemeProvider>            wrap the app once (src/main.tsx already does)
 *   const { theme, setTheme, toggleTheme } = useTheme()
 *   <ThemeToggle className? id? />   the sun / moon switch, in the nav bar
 *
 * Also exported for the inline bootstrap script and tests: THEME_STORAGE_KEY ("kk-theme").
 */
export type { Theme } from './themeStore';
export { THEME_STORAGE_KEY, DEFAULT_THEME, readDomTheme, readStoredTheme, readSystemTheme, resolveTheme } from './themeStore';
export { ThemeProvider, useTheme, type ThemeApi } from './ThemeProvider';
export { ThemeToggle, type ThemeToggleProps } from './ThemeToggle';
