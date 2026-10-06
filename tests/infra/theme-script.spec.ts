import { expect, test, type Page } from '@playwright/test';
import { expectView, trackPage } from './support/page';
import { trackById } from './support/site-map';
import { installThemeProbe, readThemeAtBody, readThemeProbe } from './support/theme-probe';

/**
 * The no-flash theme script in index.html (contract: ARCHITECTURE.md section 5).
 *   localStorage["kk-theme"] = "dark" | "light"  wins;
 *   otherwise the system setting decides;
 *   <html data-theme> is set before <body> exists, i.e. before anything is painted and
 *   before the app renders.
 */
const CANVAS = { dark: '#0a0a0a', light: '#f7f7f5' } as const;

type Theme = 'dark' | 'light';

interface Case {
  name: string;
  stored: string | null;
  system: Theme;
  expected: Theme;
}

const cases: Case[] = [
  { name: 'stored "light" beats a dark system', stored: 'light', system: 'dark', expected: 'light' },
  { name: 'stored "dark" beats a light system', stored: 'dark', system: 'light', expected: 'dark' },
  { name: 'nothing stored, light system', stored: null, system: 'light', expected: 'light' },
  { name: 'nothing stored, dark system', stored: null, system: 'dark', expected: 'dark' },
  { name: 'an invalid stored value is ignored (light system)', stored: 'sepia', system: 'light', expected: 'light' },
  { name: 'an invalid stored value is ignored (dark system)', stored: 'LIGHT', system: 'dark', expected: 'dark' },
];

async function prepare(page: Page, stored: string | null, system: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: system });
  await page.addInitScript((value) => {
    if (value === null) window.localStorage.removeItem('kk-theme');
    else window.localStorage.setItem('kk-theme', value);
  }, stored);
  await page.addInitScript(installThemeProbe);
}

test.describe('theme script', () => {
  for (const { name, stored, system, expected } of cases) {
    test(name, async ({ page }) => {
      await prepare(page, stored, system);
      await page.goto('./');

      const probe = await readThemeProbe(page);
      expect(probe.atBody, 'data-theme when <body> first existed').toBe(expected);
      expect(probe.atRender, 'data-theme when the app rendered').toBe(expected);
      expect(probe.themeColorAtBody, 'theme-color when <body> first existed').toBe(CANVAS[expected]);

      // The app (ThemeProvider) agrees with the script: the attribute does not flip afterwards.
      await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
    });
  }

  test('works on a deep link too', async ({ page }) => {
    await prepare(page, 'light', 'dark');
    await page.goto('./softdev/all');
    const probe = await readThemeProbe(page);
    expect(probe.atBody).toBe('light');
    expect(probe.atRender).toBe('light');
  });

  test('blocked storage falls back to the system setting and the app still renders', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      // What a browser does when site data is blocked: touching localStorage throws.
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await page.addInitScript(installThemeProbe);
    await page.goto('./');

    const atBody = await readThemeAtBody(page);
    expect(atBody.atBody).toBe('light');
    expect(atBody.themeColorAtBody).toBe(CANVAS.light);

    const game = trackById('game');
    await expectView(page, { track: game, tab: game.defaultTab });
    await expect(trackPage(page)).toBeVisible();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`theme-color matches --color-canvas of the ${theme} theme`, async ({ page }) => {
      await prepare(page, theme, theme === 'dark' ? 'light' : 'dark');
      await page.goto('./');
      await readThemeProbe(page);
      const state = await page.evaluate(() => ({
        canvas: getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim().toLowerCase(),
        themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content')?.toLowerCase() ?? null,
      }));
      // The colours are written twice (index.html and src/styles/tokens.css): keep them equal.
      expect(state.canvas, '--color-canvas is defined').not.toBe('');
      expect(state.themeColor).toBe(state.canvas);
    });
  }

  test('a first visit stores nothing: no stored value means "follow the system"', async ({ page }) => {
    await prepare(page, null, 'light');
    await page.goto('./');
    await readThemeProbe(page);
    expect(await page.evaluate(() => window.localStorage.getItem('kk-theme'))).toBeNull();
  });
});
