import type { Page } from '@playwright/test';

/**
 * The design kit, served by the Vite dev server from the design agent's own entry
 * (src/dev/kit.html) so these specs do not depend on the /__kit route owned by infra.
 * Relative to the Playwright baseURL (http://localhost:<PW_PORT>/My-Portfolio/).
 */
export const KIT_PATH = 'src/dev/kit.html';

export type Theme = 'dark' | 'light';
export type Track = 'game' | 'softdev';

export const THEMES: Theme[] = ['dark', 'light'];
export const TRACKS: Track[] = ['game', 'softdev'];

/**
 * Stores an explicit theme choice before any page script runs (same key as the app).
 * Init scripts run on every navigation, so a sessionStorage flag limits the preset to the
 * first load — later reloads must see whatever the page itself stored.
 */
export async function presetTheme(page: Page, theme: Theme | null): Promise<void> {
  await page.addInitScript((value) => {
    if (window.sessionStorage.getItem('kk-test-preset')) return;
    window.sessionStorage.setItem('kk-test-preset', '1');
    if (value) window.localStorage.setItem('kk-theme', value);
    else window.localStorage.removeItem('kk-theme');
  }, theme);
}

export async function openKit(page: Page, track: Track = 'game'): Promise<void> {
  await page.goto(`${KIT_PATH}?track=${track}`);
  await page.locator(`main[data-testid="kit"][data-track="${track}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The theme toggle in the kit header (the first of several on the page). */
export function headerToggle(page: Page) {
  return page.locator('#kit-theme-toggle');
}
