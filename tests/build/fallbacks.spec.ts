import { expect, test } from '@playwright/test';
import { expectPathname, expectView, NOT_FOUND, pathnameOf, trackPage, waitForReact, watchForProblems } from '../infra/support/page';
import { relative, siteMap, trackById, withBase } from '../infra/support/site-map';
import { attribute, links, meta, tags, tagWith, titles } from './support/html';

/**
 * Everything that is NOT a prerendered route, on the production build served the way GitHub
 * Pages serves it: the 404 page, the repairs it performs, and the old /game address.
 */
const game = trackById('game');
const softdev = trackById('softdev');

test.describe('unknown address', () => {
  test('answers 404 with a real not-found page', async ({ request }) => {
    const response = await request.get('./no/such/page', { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
    const html = await response.text();

    expect(tagWith(html, 'data-testid', 'not-found'), 'not-found markup is in the raw HTML').not.toBeNull();
    expect(titles(html)).toHaveLength(1);
    expect(titles(html)[0]).toContain(siteMap.siteName);
    expect(meta(html, 'robots')).toEqual(['noindex']);
    expect(links(html, 'canonical')).toEqual([]);
    // A link home, written with the base path.
    expect(tags(html, 'a').map((tag) => attribute(tag, 'href'))).toContain(siteMap.base);
    // It is styled by the site's stylesheet but does not boot the app.
    expect(links(html, 'stylesheet').length).toBeGreaterThan(0);
    expect(tags(html, 'script').some((tag) => attribute(tag, 'type') === 'module')).toBe(false);
    expect(html).not.toContain('<!--kk:');
  });

  test('shows the not-found page and its home link works', async ({ page, baseURL }) => {
    const problems = watchForProblems(page, baseURL);
    const response = await page.goto('./no/such/page');
    expect(response?.status()).toBe(404);

    const notFound = page.locator(NOT_FOUND);
    await expect(notFound).toBeVisible();
    await expect(notFound.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(trackPage(page)).toHaveCount(0);
    expect(pathnameOf(page)).toBe(withBase('/no/such/page'));
    // Only the 404 status of the document itself may be reported.
    expect(problems.messages.filter((message) => !message.includes('404'))).toEqual([]);
    expect(problems.failedRequests.filter((entry) => !entry.includes('/no/such/page'))).toEqual([]);

    await notFound.getByRole('link', { name: 'Back to Home' }).click();
    await expectPathname(page, siteMap.base);
    await expectView(page, { track: game, tab: game.defaultTab });
  });

  test('deep unknown addresses and unknown files are 404 too', async ({ request }) => {
    for (const address of ['./nope', './gamedev/unity/extra', './assets/missing.js', './images/missing.png', './index.htm']) {
      const response = await request.get(address, { maxRedirects: 0 });
      expect(response.status(), address).toBe(404);
    }
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the not-found page is readable and links home', async ({ page }) => {
      const response = await page.goto('./no/such/page');
      expect(response?.status()).toBe(404);
      await expect(page.locator(NOT_FOUND)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', siteMap.base);
    });
  });
});

test.describe('unknown tab under a known page', () => {
  for (const track of siteMap.tracks) {
    test(`/${track.route}/<unknown> is a 404 that lands on /${track.route}`, async ({ page, request }) => {
      const address = relative(`/${track.route}/no-such-tab`);
      expect((await request.get(address, { maxRedirects: 0 })).status()).toBe(404);

      const other = siteMap.tracks.find((candidate) => candidate.id !== track.id) ?? track;
      await page.goto(relative(`/${other.route}/all`));
      await page.goto(address);
      await expectPathname(page, withBase(`/${track.route}`));
      await waitForReact(page);
      await expectView(page, { track, tab: track.defaultTab });

      // Replaced, not pushed: "back" skips the bad address.
      await page.goBack();
      await expectPathname(page, withBase(`/${other.route}/all`));
    });
  }

  test('query string and hash survive', async ({ page }) => {
    await page.goto(`${relative(`/${softdev.route}/no-such-tab`)}?ref=test#projects`);
    await expectPathname(page, withBase(`/${softdev.route}`));
    const url = new URL(page.url());
    expect(url.search).toBe('?ref=test');
    expect(url.hash).toBe('#projects');
  });

  test('wrong letter case lands on the properly spelled route', async ({ page }) => {
    await page.goto(relative(`/${game.route.toUpperCase()}/ALL`));
    await expectPathname(page, withBase(`/${game.route}/all`));
    await waitForReact(page);
    await expectView(page, { track: game, tab: 'all' });
  });
});

test.describe('/game (old address)', () => {
  for (const address of ['/game', '/game/']) {
    test(`GET ${address} is a 200 redirect page to the game page`, async ({ request }) => {
      const response = await request.get(relative(address), { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      const html = await response.text();
      const target = withBase(`/${game.route}`);

      const refresh = tags(html, 'meta').find((tag) => attribute(tag, 'http-equiv') === 'refresh');
      expect(attribute(refresh ?? '', 'content')).toBe(`0; url=${target}`);
      expect(tags(html, 'a').map((tag) => attribute(tag, 'href'))).toContain(target);
      // It points search engines at the page it stands in for.
      expect(links(html, 'canonical')).toEqual([`${siteMap.origin}${siteMap.base}`]);
    });

    test(`${address} lands on the game page`, async ({ page }) => {
      await page.goto('./softdev');
      await page.goto(relative(address));
      await expectPathname(page, withBase(`/${game.route}`));
      await waitForReact(page);
      await expectView(page, { track: game, tab: game.defaultTab });

      await page.goBack();
      await expectPathname(page, withBase('/softdev'));
    });
  }

  test('/game keeps the query string and hash', async ({ page }) => {
    await page.goto('./game?ref=old#projects');
    await expectPathname(page, withBase(`/${game.route}`));
    const url = new URL(page.url());
    expect(url.search).toBe('?ref=old');
    expect(url.hash).toBe('#projects');
  });

  test('/game/<tab> lands on that tab of the game page', async ({ page }) => {
    await page.goto('./game/all');
    await expectPathname(page, withBase(`/${game.route}/all`));
    await waitForReact(page);
    await expectView(page, { track: game, tab: 'all' });
  });

  test('/game/<unknown tab> lands on the game page', async ({ page }) => {
    await page.goto('./game/no-such-tab');
    await expectPathname(page, withBase(`/${game.route}`));
    await waitForReact(page);
    await expectView(page, { track: game, tab: game.defaultTab });
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('/game still lands on the game page', async ({ page }) => {
      await page.goto('./game');
      await expectPathname(page, withBase(`/${game.route}`));
      await expectView(page, { track: game, tab: game.defaultTab });
    });
  });
});

test.describe('dev-only routes', () => {
  test('/__kit does not exist in the production build', async ({ page, request }) => {
    for (const address of ['./__kit', './__kit/']) {
      expect((await request.get(address, { maxRedirects: 0 })).status(), address).toBe(404);
    }
    await page.goto('./__kit');
    await expect(page.locator(NOT_FOUND)).toBeVisible();
    expect(pathnameOf(page)).toBe(withBase('/__kit'));
  });
});
