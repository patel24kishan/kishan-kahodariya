import { expect, test, type Page } from '@playwright/test';
import { cameFromServer, expectView, markServerMarkup, settle, TRACK_PAGE, waitForReact, watchForProblems } from './support/page';
import { expectedView, relative, siteMap, withBase } from './support/site-map';
import { devSsr } from './support/ssr';

/**
 * Hydration, checked with React's DEVELOPMENT build.
 *
 * Production React only reports a hydration mismatch when text or structure differs; a
 * differing attribute (aria-checked, class, href…) is silently left as the server wrote it.
 * The development build compares everything and logs each difference. So here the dev
 * server's HTML is given the server-rendered markup of the route (rendered through the same
 * Vite pipeline, see support/print-ssr.ts) and the dev client hydrates it; any warning fails
 * the test. Each route runs with a dark and with a light visitor, because the server cannot
 * know the theme — that is exactly where mismatches come from.
 *
 * tests/build/hydration.spec.ts repeats the check against the real production build.
 */
const APP_MARKER = '<!--kk:app-->';
/** Root of support/hydration-fixture.tsx. (Not imported: that file pulls in components and CSS.) */
const FIXTURE = '[data-testid="hydration-fixture"]';
type Theme = 'dark' | 'light';

/**
 * The page is delivered through request interception (that is how the markup gets into it),
 * and Chromium does not let such a document open a WebSocket to localhost. Vite's hot-reload
 * client therefore fails to connect and says so in the console. That is an artefact of the
 * test set-up, unrelated to hydration: those messages — and only those — are left out.
 */
const HOT_RELOAD_NOISE = [
  /WebSocket connection to 'wss?:[^']*' failed/,
  /\[vite\] failed to connect to websocket/,
  /Failed to send error to Vite server/,
];

function realProblems(messages: string[]): string[] {
  return messages.filter((message) => !HOT_RELOAD_NOISE.some((pattern) => pattern.test(message)));
}

/** Serve `address` as the dev server would, with `markup` already inside #root. */
async function serveWithMarkup(
  page: Page,
  address: string,
  markup: string,
  rewrite: (html: string) => string = (html) => html,
): Promise<void> {
  await page.route(
    (url) => url.pathname === address,
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      const html = await response.text();
      if (!html.includes(APP_MARKER)) throw new Error(`The dev server's HTML for ${address} has no ${APP_MARKER} marker.`);
      await route.fulfill({ response, body: rewrite(html).replace(APP_MARKER, () => markup) });
    },
  );
}

async function visitAs(page: Page, theme: Theme): Promise<void> {
  // Stored choice and system setting disagree, so the stored choice is what is being tested.
  await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
  await page.addInitScript((value) => window.localStorage.setItem('kk-theme', value), theme);
}

test('the server render logs no errors', () => {
  expect(devSsr.serverErrors).toEqual([]);
  expect(Object.keys(devSsr.pages).sort()).toEqual([...siteMap.routes].sort());
});

test.describe('every route hydrates without a warning (development React)', () => {
  for (const route of siteMap.routes) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${route} as a ${theme}-theme visitor`, async ({ page, baseURL }) => {
        const expected = expectedView(route);
        const problems = watchForProblems(page, baseURL);
        await visitAs(page, theme);
        await page.addInitScript(markServerMarkup, TRACK_PAGE);
        await serveWithMarkup(page, withBase(route), devSsr.pages[route] ?? '');

        await page.goto(relative(route));
        await waitForReact(page);
        await settle(page);

        expect(realProblems(problems.messages), 'React warnings, console errors and uncaught exceptions').toEqual([]);
        expect(problems.failedRequests).toEqual([]);
        expect(await cameFromServer(page), 'React adopted the server markup').toBe(true);
        await expectView(page, expected);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      });
    }
  }
});

test.describe('the theme switch hydrates without a warning (development React)', () => {
  const address = withBase('/__hydration-fixture');
  const clientEntry = withBase('/tests/infra/support/hydration-fixture.client.tsx');

  /** Point the page's module script at the fixture's entry instead of the app's. */
  function useFixtureEntry(html: string): string {
    const swapped = html.replace(/src="[^"]*\/src\/main\.tsx[^"]*"/, `src="${clientEntry}"`);
    if (swapped === html) throw new Error('The dev HTML does not load src/main.tsx: cannot swap in the fixture entry.');
    return swapped;
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`ThemeProvider + ThemeToggle as a ${theme}-theme visitor`, async ({ page, baseURL }) => {
      const problems = watchForProblems(page, baseURL);
      await visitAs(page, theme);
      await page.addInitScript(markServerMarkup, FIXTURE);
      await serveWithMarkup(page, address, devSsr.fixture, useFixtureEntry);

      await page.goto(relative('/__hydration-fixture'));
      await waitForReact(page, FIXTURE);
      await settle(page);

      expect(realProblems(problems.messages), 'React warnings, console errors and uncaught exceptions').toEqual([]);
      expect(problems.failedRequests).toEqual([]);
      expect(await cameFromServer(page, FIXTURE), 'React adopted the server markup').toBe(true);

      // The server always renders the dark state; after hydration both switches must show
      // the visitor's real theme (aria-checked is true in light mode).
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const switches = page.getByRole('switch');
      await expect(switches).toHaveCount(2);
      for (const index of [0, 1]) {
        await expect(switches.nth(index)).toHaveAttribute('aria-checked', String(theme === 'light'));
      }

      // And the switch works after hydration: one click flips the document and both switches.
      await switches.first().click();
      const flipped: Theme = theme === 'light' ? 'dark' : 'light';
      await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
      for (const index of [0, 1]) {
        await expect(switches.nth(index)).toHaveAttribute('aria-checked', String(flipped === 'light'));
      }
      expect(realProblems(problems.messages)).toEqual([]);
    });
  }
});
