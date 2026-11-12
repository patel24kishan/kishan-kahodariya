import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * The welcome popup must be the first thing a first-time phone visitor sees: the prerendered
 * page is covered (html.kk-popup-pending, a black ::before) from before the first paint until the
 * popup is open, and the cover is lifted for everyone who gets no popup. The cover only exists
 * in the production build (the marker comes from the prerender), so this lives in the build suite.
 */
const COVER = 'kk-popup-pending';

/** Hold the app's scripts back, as a slow phone connection would, until release() is called. */
async function holdScripts(page: import('@playwright/test').Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\.js(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** The document is fully parsed (so the inline scripts have run) while the held module scripts have not. */
async function parsed(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => document.readyState !== 'loading');
}

function coverState(page: import('@playwright/test').Page) {
  return page.evaluate((name) => {
    const root = document.documentElement;
    const screen = document.getElementById('kk-load');
    const style = screen ? getComputedStyle(screen) : null;
    return {
      pending: root.classList.contains(name),
      display: style?.display ?? 'missing',
      position: style?.position ?? 'missing',
      background: style?.backgroundColor ?? 'missing',
      count: Number(screen?.getAttribute('aria-valuenow') ?? '-1'),
    };
  }, COVER);
}

test.describe('first-time phone visitor', () => {
  test.use({ storageState: { cookies: [], origins: [] }, deviceScaleFactor: 1 });

  test('the page is covered while the app is still loading, then the popup takes over', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phones only');
    const release = await holdScripts(page);
    await page.goto('./', { waitUntil: 'commit' });
    await parsed(page);
    // The prerendered page is there, but covered: nothing of it can be seen before the popup.
    await expect(page.getByTestId('track-page')).toBeAttached();
    expect(await coverState(page)).toMatchObject({ pending: true, display: 'flex', position: 'fixed', background: 'rgb(0, 0, 0)' });
    // The load screen counts up on its own while the app is still loading, and never reaches 100 by itself.
    await expect.poll(() => coverState(page).then((state) => state.count), { timeout: 5_000 }).toBeGreaterThan(20);
    expect((await coverState(page)).count).toBeLessThan(93);
    release();
    // The popup is ready: the count runs to 100, the load screen fades away and the popup is shown.
    await expect(page.getByTestId('welcome-popup')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => coverState(page).then((state) => state.display), { timeout: 8_000 }).toBe('none');
    await expect(page.getByTestId('welcome-popup')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('welcome-popup')).toHaveAttribute('data-popup-stage', 'pack');
  });

  test('?popup=1 covers the page too for a returning visitor', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phones only');
    await page.addInitScript(() => window.localStorage.setItem('kk-welcome-seen', '1'));
    const release = await holdScripts(page);
    await page.goto('./?popup=1', { waitUntil: 'commit' });
    await parsed(page);
    expect((await coverState(page)).pending).toBe(true);
    release();
    await expect(page.getByTestId('welcome-popup')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('nobody else is covered', () => {
  test('a returning phone visitor never gets the cover', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phones only');
    const release = await holdScripts(page);
    await page.goto('./', { waitUntil: 'commit' });
    await parsed(page);
    expect((await coverState(page)).pending).toBe(false);
    release();
    await expect(page.getByTestId('track-page')).toBeVisible();
    await expect(page.getByTestId('welcome-popup')).toHaveCount(0);
  });
});

test.describe('on a desktop screen', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a first-time desktop visitor gets the load screen too, then the popup', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    const release = await holdScripts(page);
    await page.goto('./', { waitUntil: 'commit' });
    await parsed(page);
    expect(await coverState(page)).toMatchObject({ pending: true, display: 'flex' });
    release();
    await expect(page.getByTestId('welcome-popup')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => coverState(page).then((state) => state.display), { timeout: 8_000 }).toBe('none');
  });
});

test.describe('the dashboard switches reach the page before any script runs', () => {
  const popup = JSON.parse(readFileSync('content/popup.json', 'utf8')) as Record<string, boolean>;
  const screens = (onPage: boolean) =>
    popup.enabled && onPage ? [popup.onPhones && 'phone', popup.onDesktops && 'desktop'].filter(Boolean).join(' ') : '';

  for (const [path, onPage] of [
    ['./', popup.onGamePage],
    ['./gamedev', popup.onGamePage],
    ['./softdev', popup.onSoftwarePage],
  ] as const) {
    test(`${path} carries the screens the popup shows on`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      const marker = /<meta name="kk-popup" content="([^"]*)"/.exec(html)?.[1] ?? '';
      expect(marker).toBe(screens(onPage !== false));
    });
  }
});
