/**
 * The public site never links to the dashboard. The dashboard is not secret (GitHub decides
 * who can save), but a visitor has no business there and a crawler should not find it.
 */
import { expect, test } from '@playwright/test';
import { loadContent } from '../../scripts/lib/load-content';
import { createContentApi } from '../../src/content/selectors';
import { contentDir } from './support/env';

function routes(): string[] {
  const loaded = loadContent(contentDir);
  if (!loaded.ok) throw new Error('the content does not validate');
  return createContentApi(loaded.content).getAllRoutes();
}

const ADMIN_ADDRESS = /(?:^|\/)admin(?:\/|$|\?|#)/i;

test('no route of the site has a link, form or frame that points at /admin', async ({ page }) => {
  const all = routes();
  expect(all.length).toBeGreaterThan(5);
  const offenders: string[] = [];
  for (const route of all) {
    await page.goto(route === '/' ? './' : route.slice(1));
    await expect(page.getByTestId('track-page')).toBeVisible();
    const addresses = await page
      .locator('[href], [src], [action], [data-href]')
      .evaluateAll((nodes) => nodes.flatMap((node) => ['href', 'src', 'action', 'data-href'].map((name) => node.getAttribute(name) ?? '')).filter(Boolean));
    for (const address of addresses) {
      let pathname = address;
      try {
        pathname = new URL(address, page.url()).pathname;
      } catch {
        // keep the raw value
      }
      if (ADMIN_ADDRESS.test(pathname)) offenders.push(`${route}: ${address}`);
    }
    expect(await page.getByRole('link', { name: /admin|dashboard|sign in/i }).count(), `${route}: no link named after the dashboard`).toBe(0);
  }
  expect(offenders).toEqual([]);
});

test('the dashboard is not a route of the app: the app never renders at /admin/', async ({ page }) => {
  await page.route('**/*', (route) => (new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort()));
  await page.goto('admin/');
  await expect(page.getByTestId('track-page')).toHaveCount(0);
  await expect(page.locator('#root')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});
