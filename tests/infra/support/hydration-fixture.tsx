/**
 * A tiny tree with the real theme pieces, for the hydration test (tests/infra/hydration.spec.ts):
 * the ThemeProvider and two ThemeToggle switches, the way the page uses them (one in the nav,
 * one inside the accent-coloured footer band).
 *
 * The server renders it without knowing the visitor's theme; the browser may be in light
 * mode. Hydrating it must produce no warning and leave both switches showing the real theme.
 * Test-only: nothing in src/ imports this file.
 */
import { StrictMode } from 'react';
import { ThemeProvider, ThemeToggle } from '@/theme';

export function Fixture() {
  return (
    <StrictMode>
      <ThemeProvider>
        <main data-testid="hydration-fixture">
          <ThemeToggle id="fixture-toggle-nav" />
          <div data-on-accent="">
            <ThemeToggle id="fixture-toggle-footer" />
          </div>
        </main>
      </ThemeProvider>
    </StrictMode>
  );
}
