import { expect, test } from '@playwright/test';
import { expectPathname, expectView, NOT_FOUND, pathnameOf, trackPage, waitForReact } from './support/page';
import { expectedView, relative, siteMap, trackById, withBase } from './support/site-map';

/**
 * The route table (ARCHITECTURE.md section 3) on the dev server.
 * One test per route in getAllRoutes(), then the repairs and redirects around them.
 */
test.describe('every public route', () => {
  for (const route of siteMap.routes) {
    test(`${route} shows its page and tab`, async ({ page }) => {
      const expected = expectedView(route);
      const response = await page.goto(relative(route));

      expect(response?.status()).toBe(200);
      await expectView(page, expected);
      // A valid address is never rewritten: the address reflects the open tab.
      await waitForReact(page);
      expect(pathnameOf(page)).toBe(withBase(route));
    });
  }

  test('the route list covers "/", both pages and every tab of both pages', () => {
    const expectedRoutes = ['/'];
    for (const track of siteMap.tracks) {
      expectedRoutes.push(`/${track.route}`);
      for (const tab of siteMap.tabs) expectedRoutes.push(`/${track.route}/${tab.id}`);
    }
    expect([...siteMap.routes].sort()).toEqual(expectedRoutes.sort());
    expect(siteMap.tracks.map((track) => track.route).sort()).toEqual(['gamedev', 'softdev']);
    expect(siteMap.tabs.map((tab) => tab.id)).toContain('all');
  });

  test('"/" and "/gamedev" show the game page with its default tab', async ({ page }) => {
    const game = trackById('game');
    for (const address of ['./', './gamedev']) {
      await page.goto(address);
      await expectView(page, { track: game, tab: game.defaultTab });
    }
  });
});

test.describe('unknown tab', () => {
  for (const track of siteMap.tracks) {
    test(`/${track.route}/<unknown> shows the default tab and repairs the address`, async ({ page }) => {
      // A known page first, so "back" has somewhere to go.
      const other = siteMap.tracks.find((candidate) => candidate.id !== track.id) ?? track;
      await page.goto(relative(`/${other.route}/all`));
      await expectView(page, { track: other, tab: 'all' });

      await page.goto(relative(`/${track.route}/no-such-tab`));
      await expectView(page, { track, tab: track.defaultTab });
      await expectPathname(page, withBase(`/${track.route}`));

      // The repair replaced the bad address: going back skips it entirely.
      await page.goBack();
      await expectPathname(page, withBase(`/${other.route}/all`));
      await expectView(page, { track: other, tab: 'all' });
    });
  }

  test('query string and hash survive the repair', async ({ page }) => {
    const softdev = trackById('softdev');
    await page.goto(`${relative(`/${softdev.route}/no-such-tab`)}?ref=test#projects`);
    await expectView(page, { track: softdev, tab: softdev.defaultTab });
    await expectPathname(page, withBase(`/${softdev.route}`));
    const url = new URL(page.url());
    expect(url.search).toBe('?ref=test');
    expect(url.hash).toBe('#projects');
  });
});

test.describe('address repair', () => {
  test('a trailing slash is removed without changing the page', async ({ page }) => {
    const softdev = trackById('softdev');
    await page.goto(relative(`/${softdev.route}/all/`));
    await expectView(page, { track: softdev, tab: 'all' });
    await expectPathname(page, withBase(`/${softdev.route}/all`));
  });

  test('letter case in the page segment is corrected', async ({ page }) => {
    const game = trackById('game');
    await page.goto(relative(`/${game.route.toUpperCase()}/all`));
    await expectView(page, { track: game, tab: 'all' });
    await expectPathname(page, withBase(`/${game.route}/all`));
  });
});

test.describe('/game (old address)', () => {
  const game = trackById('game');

  test('/game redirects to the game page', async ({ page }) => {
    await page.goto('./softdev');
    await page.goto('./game');
    await expectPathname(page, withBase(`/${game.route}`));
    await expectView(page, { track: game, tab: game.defaultTab });

    // A redirect, not a visit: "back" returns to where we were before /game.
    await page.goBack();
    await expectPathname(page, withBase('/softdev'));
  });

  test('/game/<tab> keeps the tab', async ({ page }) => {
    await page.goto('./game/all');
    await expectPathname(page, withBase(`/${game.route}/all`));
    await expectView(page, { track: game, tab: 'all' });
  });

  test('/game/<unknown tab> ends on the game page', async ({ page }) => {
    await page.goto('./game/no-such-tab?x=1');
    await expectPathname(page, withBase(`/${game.route}`));
    await expectView(page, { track: game, tab: game.defaultTab });
    expect(new URL(page.url()).search).toBe('?x=1');
  });
});

test.describe('everything else', () => {
  test('an unknown address shows the not-found page with a link home', async ({ page }) => {
    await page.goto('./no/such/page');
    const notFound = page.locator(NOT_FOUND);
    await expect(notFound).toBeVisible();
    await expect(trackPage(page)).toHaveCount(0);
    await expect(notFound.getByRole('heading', { level: 1 })).toBeVisible();

    await notFound.getByRole('link', { name: 'Back to Home' }).click();
    await expectPathname(page, siteMap.base);
    const game = trackById('game');
    await expectView(page, { track: game, tab: game.defaultTab });
  });

  test('a page route with extra segments is not found', async ({ page }) => {
    await page.goto('./gamedev/unity/extra');
    await expect(page.locator(NOT_FOUND)).toBeVisible();
  });

  test('/__kit serves the component kit in dev', async ({ page }) => {
    const kitModule = page.waitForResponse((response) => /\/src\/dev\/Kit\.tsx(\?|$)/.test(response.url()));
    await page.goto('./__kit');
    expect((await kitModule).ok()).toBe(true);

    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator(NOT_FOUND)).toHaveCount(0);
    await expect(trackPage(page)).toHaveCount(0);
    expect(pathnameOf(page)).toBe(withBase('/__kit'));
  });
});
