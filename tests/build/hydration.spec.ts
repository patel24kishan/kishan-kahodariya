import { expect, test, type Page } from '@playwright/test';
import {
  cameFromServer,
  expectPathname,
  expectView,
  markServerMarkup,
  pathnameOf,
  settle,
  TRACK_PAGE,
  waitForReact,
  watchForProblems,
} from '../infra/support/page';
import { expectedView, relative, siteMap, titleMatcher, withBase } from '../infra/support/site-map';
import { installThemeProbe, readThemeProbe } from '../infra/support/theme-probe';

/**
 * The production build in a real browser: every route's server-rendered markup is adopted by
 * React (hydrated, not thrown away and re-created), nothing is logged to the console, every
 * request stays inside the base path and succeeds, and a hard reload of a deep link stays on
 * that page.
 */

function expectNoProblems(problems: ReturnType<typeof watchForProblems>, sameOriginPaths: string[]): void {
  expect(problems.messages, 'console errors, warnings and uncaught exceptions').toEqual([]);
  expect(problems.failedRequests, 'failed same-origin requests').toEqual([]);
  expect(sameOriginPaths.length).toBeGreaterThan(0);
  for (const pathname of sameOriginPaths) {
    expect(pathname.startsWith(siteMap.base), `${pathname} is outside ${siteMap.base}`).toBe(true);
  }
}

/** Paths of every same-origin request the page makes. */
function recordSameOriginPaths(page: Page, baseURL: string | undefined): string[] {
  const origin = new URL(baseURL ?? '').origin;
  const paths: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === origin) paths.push(url.pathname);
  });
  return paths;
}

test.describe('hydration', () => {
  for (const route of siteMap.routes) {
    test(`${route} hydrates cleanly and survives a hard reload`, async ({ page, baseURL }) => {
      const expected = expectedView(route);
      const problems = watchForProblems(page, baseURL);
      const requested = recordSameOriginPaths(page, baseURL);
      await page.addInitScript(markServerMarkup, TRACK_PAGE);

      const response = await page.goto(relative(route));
      expect(response?.status()).toBe(200);
      await waitForReact(page);
      await settle(page);

      await expectView(page, expected);
      expect.soft(await cameFromServer(page), 'React adopted the server markup').toBe(true);
      expect(pathnameOf(page)).toBe(withBase(route));
      await expect(page).toHaveTitle(titleMatcher(expected.track));
      await expect(page.locator('head title')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', expected.canonicalUrl);

      const reloaded = await page.reload();
      expect(reloaded?.status()).toBe(200);
      await waitForReact(page);
      await settle(page);
      await expectView(page, expected);
      expect(await cameFromServer(page)).toBe(true);
      expect(pathnameOf(page)).toBe(withBase(route));

      expectNoProblems(problems, requested);
    });
  }

  for (const route of siteMap.routes.filter((candidate) => candidate !== '/')) {
    test(`${route}/ (trailing slash) hydrates and the address loses the slash`, async ({ page, baseURL }) => {
      const expected = expectedView(route);
      const problems = watchForProblems(page, baseURL);
      const requested = recordSameOriginPaths(page, baseURL);
      await page.addInitScript(markServerMarkup, TRACK_PAGE);

      const response = await page.goto(relative(`${route}/`));
      expect(response?.status()).toBe(200);
      await waitForReact(page);
      await expectPathname(page, withBase(route));
      await settle(page);

      await expectView(page, expected);
      expect(await cameFromServer(page)).toBe(true);

      // The repaired address is itself a real page.
      const reloaded = await page.reload();
      expect(reloaded?.status()).toBe(200);
      await waitForReact(page);
      await settle(page);
      await expectView(page, expected);
      expect(pathnameOf(page)).toBe(withBase(route));

      expectNoProblems(problems, requested);
    });
  }
});

/** The theme switch as src/theme/ThemeToggle.tsx renders it. aria-checked is true in light mode. */
const THEME_SWITCH = 'button[role="switch"][data-theme-toggle]';

test.describe('theme on a prerendered page', () => {
  for (const route of siteMap.routes) {
    test(`${route}: a stored light theme is applied before paint and hydrates cleanly`, async ({ page, baseURL }) => {
      const problems = watchForProblems(page, baseURL);
      const requested = recordSameOriginPaths(page, baseURL);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.addInitScript(() => window.localStorage.setItem('kk-theme', 'light'));
      await page.addInitScript(installThemeProbe);
      await page.addInitScript(markServerMarkup, TRACK_PAGE);

      await page.goto(relative(route));
      const probe = await readThemeProbe(page);
      expect(probe.atBody, 'data-theme when <body> first existed').toBe('light');
      expect(probe.atRender, 'data-theme when React attached').toBe('light');
      expect(probe.themeColorAtBody).toBe('#f7f7f5');

      await settle(page);
      await expectView(page, expectedView(route));
      expect(await cameFromServer(page)).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      // The server rendered the page without knowing the theme: this must not be a mismatch…
      expectNoProblems(problems, requested);
      // …and no theme switch may be left showing the server's guess. (Production React does
      // not report attribute-only mismatches, so the end state is checked directly. A page
      // without a switch passes trivially; tests/infra/hydration.spec.ts covers the switch
      // itself with the development build, which does report them.)
      const switches = page.locator(THEME_SWITCH);
      for (let index = 0; index < (await switches.count()); index += 1) {
        await expect(switches.nth(index), 'theme switch shows the light state').toHaveAttribute('aria-checked', 'true');
      }
    });
  }

  test('with nothing stored the system setting decides', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => window.localStorage.removeItem('kk-theme'));
    await page.addInitScript(installThemeProbe);
    await page.goto('./');
    const probe = await readThemeProbe(page);
    expect(probe.atBody).toBe('light');
    expect(probe.atRender).toBe('light');
  });
});
