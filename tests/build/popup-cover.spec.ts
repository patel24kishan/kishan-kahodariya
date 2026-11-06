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
    const before = getComputedStyle(root, '::before');
    return { pending: root.classList.contains(name), position: before.position, background: before.backgroundColor };
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
    expect(await coverState(page)).toEqual({ pending: true, position: 'fixed', background: 'rgb(0, 0, 0)' });
    release();
    await expect(page.getByTestId('welcome-popup')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => coverState(page).then((state) => state.pending), { timeout: 5_000 }).toBe(false);
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

  test.describe('on a desktop screen', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('a first-time desktop visitor never gets the cover', async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'desktop only');
      const release = await holdScripts(page);
      await page.goto('./', { waitUntil: 'commit' });
      await parsed(page);
      expect((await coverState(page)).pending).toBe(false);
      release();
      await expect(page.getByTestId('track-page')).toBeVisible();
    });
  });
});
