import { expect, test } from '@playwright/test';
import { expectView } from '../infra/support/page';
import { expectedView, relative, siteMap, titleMatcher, titleMatches } from '../infra/support/site-map';
import { attribute, links, meta, rootMarkup, tags, tagWith, titles } from './support/html';

/**
 * The production build, as a crawler or a visitor without JavaScript receives it:
 * for EVERY route in getAllRoutes(), a direct request answers 200 with the finished page
 * and the right head already in the HTML — with and without a trailing slash.
 */
function spellings(route: string): string[] {
  return route === '/' ? ['/'] : [route, `${route}/`];
}

test.describe('direct requests', () => {
  for (const route of siteMap.routes) {
    for (const address of spellings(route)) {
      test(`GET ${address} is a 200 with the page and its head in the HTML`, async ({ request }) => {
        const expected = expectedView(route);
        // maxRedirects: 0 — the address itself must answer, not a redirect target.
        const response = await request.get(relative(address), { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('text/html');
        const html = await response.text();

        // Page markup, straight from the server.
        const pageTag = tagWith(rootMarkup(html), 'data-testid', 'track-page');
        expect(pageTag, 'the page root is inside #root in the raw HTML').not.toBeNull();
        expect(attribute(pageTag ?? '', 'data-track')).toBe(expected.track.id);
        expect(attribute(pageTag ?? '', 'data-tab')).toBe(expected.tab);

        // Head.
        expect(attribute(tags(html, 'html')[0] ?? '', 'lang')).toBe('en');
        const pageTitles = titles(html);
        expect(pageTitles).toHaveLength(1);
        expect(titleMatches(expected.track, pageTitles[0] ?? ''), `title "${pageTitles[0]}"`).toBe(true);
        expect(links(html, 'canonical')).toEqual([expected.canonicalUrl]);
        expect(meta(html, 'og:url')).toEqual([expected.canonicalUrl]);
        expect(meta(html, 'og:type')).toEqual(['website']);
        expect(meta(html, 'og:title')).toHaveLength(1);
        expect(meta(html, 'robots')).toEqual([]);
        expect(meta(html, 'theme-color')).toHaveLength(1);
        expect(meta(html, 'color-scheme')).toHaveLength(1);
        expect(meta(html, 'viewport')[0]).not.toMatch(/user-scalable|maximum-scale/i);

        const descriptions = meta(html, 'description');
        expect(descriptions.length).toBeLessThanOrEqual(1);
        const explicit = expected.track.metaDescription.replace(/\s+/g, ' ').trim();
        if (explicit) expect(descriptions).toEqual([explicit]);
        // An image for link previews must be an absolute URL.
        for (const image of meta(html, 'og:image')) expect(image).toMatch(/^https?:\/\//);
        // ...and never the profile photo: the software page shows a still of its hero video, the
        // game page the logo.
        expect(meta(html, 'og:image'), 'one preview image').toHaveLength(1);
        const softdev = expected.track.id === 'softdev';
        expect(meta(html, 'og:image')[0]).toMatch(softdev ? /\/share\/softdev\.jpg$/ : /\/icon-512\.png$/);
        expect(meta(html, 'og:image')[0]).not.toContain('profile');
        expect(meta(html, 'og:image:width')).toEqual([softdev ? '1200' : '512']);
        expect(meta(html, 'og:image:height')).toEqual([softdev ? '630' : '512']);
        expect(meta(html, 'twitter:card')).toEqual([softdev ? 'summary_large_image' : 'summary']);

        // The markers the prerenderer fills in must be gone.
        expect(html).not.toContain('<!--kk:');
        expect(html).not.toContain('<!--/kk:');
      });
    }
  }

  test('both spellings of a route are the same document', async ({ request }) => {
    for (const route of siteMap.routes.filter((candidate) => candidate !== '/')) {
      const [plain, slashed] = await Promise.all([
        request.get(relative(route), { maxRedirects: 0 }),
        request.get(relative(`${route}/`), { maxRedirects: 0 }),
      ]);
      expect(await slashed.text(), route).toBe(await plain.text());
    }
  });

  test('the base path without its trailing slash redirects to the base', async ({ request, baseURL }) => {
    const withoutSlash = new URL(siteMap.base.replace(/\/$/, ''), baseURL).href;
    const response = await request.get(withoutSlash, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(siteMap.base);
  });

  test('index.html is also reachable by its file name', async ({ request }) => {
    const response = await request.get('./index.html', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const route of siteMap.routes) {
    test(`${route} shows its page and tab`, async ({ page }) => {
      const expected = expectedView(route);
      const response = await page.goto(relative(route));
      expect(response?.status()).toBe(200);

      await expectView(page, expected);
      await expect(page).toHaveTitle(titleMatcher(expected.track));
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', expected.canonicalUrl);
      // With scripts off the theme script cannot run: the page falls back to the default theme.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
  }
});
