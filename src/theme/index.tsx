import type { ReactNode } from 'react';

/**
 * CONTRACT (architect): theme API used by the app shell and the pages.
 * - <html data-theme="dark|light"> is the single source of truth for CSS.
 * - localStorage["kk-theme"] holds an explicit choice ("dark" | "light"); absent = follow system.
 * - index.html sets data-theme before first paint (inline script, owned by infra).
 *
 * Placeholder bodies — the design agent (phase 1) implements them. Keep these exports.
 */
export type Theme = 'dark' | 'light';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void } {
  return { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };
}

/** The sun / moon pill switch. Rendered in the nav and in the footer. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button type="button" role="switch" aria-checked={false} aria-label="Switch to light mode" className={className}>
      Theme
    </button>
  );
}
