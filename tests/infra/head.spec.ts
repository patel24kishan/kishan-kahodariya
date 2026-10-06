import { expect, test } from '@playwright/test';
import { expectView, waitForReact } from './support/page';
import { expectedView, relative, siteMap, titleMatcher } from './support/site-map';

/**
 * The document head on the dev server: the static part from index.html and the per-route
 * part the app writes after it renders (src/lib/head.ts). The prerendered version of the
 * same head is checked in tests/build.
 */
test.describe('static head', () => {
  test('language, viewport, colour scheme and theme colour are declared', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
    // Zooming must stay possible.
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(viewport).not.toMatch(/maximum-scale/i);

    const colorScheme = await page.locator('meta[name="color-scheme"]').getAttribute('content');
    expect(colorScheme?.split(/\s+/).sort()).toEqual(['dark', 'light']);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('meta[charset]')).toHaveAttribute('charset', /utf-8/i);
  });

  test('icon and manifest links point inside the base path and load', async ({ page, request, baseURL }) => {
    await page.goto('./');
    for (const rel of ['icon', 'manifest']) {
      const href = await page.locator(`link[rel="${rel}"]`).getAttribute('href');
      expect(href, rel).toMatch(new RegExp(`^${siteMap.base}`));
      const response = await request.get(new URL(href ?? '', baseURL).href);
      expect(response.status(), `${rel} → ${href}`).toBe(200);
    }
  });

  test('the manifest names the site and stays inside the base path', async ({ request, baseURL }) => {
    const response = await request.get(new URL('manifest.json', baseURL).href);
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.name).toContain(siteMap.siteName);
    expect(manifest.short_name.length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.name).not.toMatch(/react/i);
    // Relative to the manifest, so it follows the base path.
    expect(manifest.start_url).toBe('.');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    for (const icon of manifest.icons) {
      expect(icon.src).not.toMatch(/^\//);
      const iconResponse = await request.get(new URL(icon.src, new URL('manifest.json', baseURL)).href);
      expect(iconResponse.status(), icon.src).toBe(200);
    }
  });
});

test.describe('head per route', () => {
  for (const route of siteMap.routes) {
    test(`${route} has its title, one canonical link and Open Graph tags`, async ({ page }) => {
      const expected = expectedView(route);
      await page.goto(relative(route));
      await expectView(page, expected);
      await waitForReact(page);

      await expect(page).toHaveTitle(titleMatcher(expected.track));
      await expect(page.locator('head title')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', expected.canonicalUrl);
      await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute('content', expected.canonicalUrl);
      await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute('content', 'website');
      await expect(page.locator('head meta[property="og:title"]')).toHaveCount(1);
      await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);

      // At most one description, and when the content sets one it is used word for word.
      const descriptions = page.locator('head meta[name="description"]');
      expect(await descriptions.count()).toBeLessThanOrEqual(1);
      const explicit = expected.track.metaDescription.replace(/\s+/g, ' ').trim();
      if (explicit) await expect(descriptions).toHaveAttribute('content', explicit);
    });
  }

  test('the aliases of a default view share one canonical URL', () => {
    for (const track of siteMap.tracks) {
      const aliases = [`/${track.route}`, `/${track.route}/${track.defaultTab}`];
      if (track.id === 'game') aliases.push('/');
      const canonicals = new Set(aliases.map((alias) => expectedView(alias).canonicalUrl));
      expect([...canonicals], `aliases of ${track.id}`).toHaveLength(1);
    }
    // …and no two different views claim the same canonical URL.
    const byCanonical = new Map<string, string>();
    for (const route of siteMap.routes) {
      const view = expectedView(route);
      const key = `${view.track.id}/${view.tab}`;
      const owner = byCanonical.get(view.canonicalUrl);
      if (owner !== undefined) expect(owner, `${route} shares ${view.canonicalUrl}`).toBe(key);
      byCanonical.set(view.canonicalUrl, key);
    }
  });
});
