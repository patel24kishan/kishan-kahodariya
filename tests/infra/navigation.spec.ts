import { expect, test, type Page } from '@playwright/test';
import { expectPathname, expectView, TRACK_PAGE, trackPage } from './support/page';
import { expectedView, relative, siteMap, titleMatcher, titleMatches, trackById, withBase } from './support/site-map';

/**
 * Client-side navigation on the dev server: scroll rules (src/lib/scroll.ts), hash links and
 * the document head after a navigation.
 *
 * Navigations are made through window.__kkNavigate, a dev-only hook that calls the router's
 * navigate() — the same history push a <Link> click performs. (The placeholder page has no
 * tab links yet; once the real page exists its own tests click the real links.)
 */
const game = trackById('game');
const softdev = trackById('softdev');
const otherGameTab = siteMap.tabs.map((tab) => tab.id).find((id) => id !== game.defaultTab && id !== 'all') ?? 'all';

async function open(page: Page, route: string): Promise<void> {
  await page.goto(relative(route));
  await page.waitForFunction(() => typeof window.__kkNavigate === 'function');
  // Make the document tall enough to scroll, whatever the page currently renders.
  await page.addStyleTag({ content: 'body::after { content: ""; display: block; height: 4000px; }' });
}

async function navigate(page: Page, to: string): Promise<void> {
  await page.evaluate((target) => window.__kkNavigate?.(target), to);
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), top);
  await expect.poll(() => scrollY(page)).toBe(top);
}

function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Mark the page root's DOM node, to tell later whether it is still the same node. */
async function markPageRoot(page: Page): Promise<void> {
  await page.locator(TRACK_PAGE).evaluate((element) => Reflect.set(element, '__kkMarked', true));
}

function pageRootIsMarked(page: Page): Promise<boolean> {
  return page.locator(TRACK_PAGE).evaluate((element) => Reflect.get(element, '__kkMarked') === true);
}

/** A target far down the page plus a plain in-page link to it, outside the React root. */
async function addHashTarget(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.createElement('div');
    target.id = 'kk-probe';
    target.textContent = 'probe';
    target.style.cssText = 'position:absolute;left:0;top:2400px;height:40px;';
    const link = document.createElement('a');
    link.id = 'kk-probe-link';
    link.href = '#kk-probe';
    link.textContent = 'Go to probe';
    link.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;padding:12px;background:#fff;color:#000;';
    document.body.append(target, link);
  });
}

/** Distance from the top of the viewport to the hash target. */
function probeTop(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(document.getElementById('kk-probe')?.getBoundingClientRect().top ?? Number.NaN));
}

async function expectProbeInView(page: Page): Promise<void> {
  // At the top of the viewport, below at most a sticky nav's worth of scroll-margin.
  await expect.poll(() => probeTop(page), { message: 'hash target should scroll to the top of the viewport' }).toBeLessThan(200);
  expect(await probeTop(page)).toBeGreaterThanOrEqual(0);
  expect(await scrollY(page)).toBeGreaterThan(2000);
}

test.describe('scroll position', () => {
  test('tab to tab on the same page keeps the scroll position and the mounted page', async ({ page }) => {
    await open(page, `/${game.route}/${game.defaultTab}`);
    await markPageRoot(page);
    await scrollTo(page, 700);

    await navigate(page, `/${game.route}/${otherGameTab}`);
    await expectView(page, { track: game, tab: otherGameTab });
    await expectPathname(page, withBase(`/${game.route}/${otherGameTab}`));
    expect(await scrollY(page)).toBe(700);
    expect(await pageRootIsMarked(page), 'the page must not be re-mounted by a tab change').toBe(true);

    await navigate(page, `/${game.route}/all`);
    await expectView(page, { track: game, tab: 'all' });
    expect(await scrollY(page)).toBe(700);
    expect(await pageRootIsMarked(page)).toBe(true);
  });

  test('from "/" to a tab route keeps the scroll position and the mounted page', async ({ page }) => {
    await open(page, '/');
    await markPageRoot(page);
    await scrollTo(page, 500);

    await navigate(page, `/${game.route}/${otherGameTab}`);
    await expectView(page, { track: game, tab: otherGameTab });
    expect(await scrollY(page)).toBe(500);
    expect(await pageRootIsMarked(page)).toBe(true);

    // …and through the bare page route as well.
    await navigate(page, `/${game.route}`);
    await expectView(page, { track: game, tab: game.defaultTab });
    expect(await scrollY(page)).toBe(500);
    expect(await pageRootIsMarked(page)).toBe(true);
  });

  test('going to the other page jumps to the top and starts a fresh page', async ({ page }) => {
    await open(page, `/${game.route}/all`);
    await markPageRoot(page);
    await scrollTo(page, 900);

    await navigate(page, `/${softdev.route}`);
    await expectView(page, { track: softdev, tab: softdev.defaultTab });
    await expect.poll(() => scrollY(page)).toBe(0);
    expect(await pageRootIsMarked(page), 'a different page is a new mount').toBe(false);

    // Tabs of the new page keep the position again.
    await scrollTo(page, 300);
    await navigate(page, `/${softdev.route}/all`);
    await expectView(page, { track: softdev, tab: 'all' });
    expect(await scrollY(page)).toBe(300);
  });

  test('back and forward return to the right page and tab', async ({ page }) => {
    await open(page, `/${game.route}/all`);
    await navigate(page, `/${softdev.route}/all`);
    await expectView(page, { track: softdev, tab: 'all' });

    await page.goBack();
    await expectView(page, { track: game, tab: 'all' });
    await expectPathname(page, withBase(`/${game.route}/all`));

    await page.goForward();
    await expectView(page, { track: softdev, tab: 'all' });
    await expectPathname(page, withBase(`/${softdev.route}/all`));
  });
});

test.describe('hash links', () => {
  test('a router navigation to a #hash scrolls the target into view', async ({ page }) => {
    await open(page, `/${game.route}/all`);
    await addHashTarget(page);

    await navigate(page, '#kk-probe');
    await expectProbeInView(page);
    expect(new URL(page.url()).hash).toBe('#kk-probe');
    await expectView(page, { track: game, tab: 'all' });

    // The same link again, after scrolling away, works a second time.
    await scrollTo(page, 0);
    await navigate(page, '#kk-probe');
    await expectProbeInView(page);
  });

  test('a router navigation to another tab plus #hash scrolls to the target', async ({ page }) => {
    await open(page, `/${game.route}/all`);
    await addHashTarget(page);

    await navigate(page, `/${game.route}/${otherGameTab}#kk-probe`);
    await expectView(page, { track: game, tab: otherGameTab });
    await expectProbeInView(page);
  });

  test('a plain <a href="#id"> click scrolls and leaves the page and tab alone', async ({ page }) => {
    await open(page, `/${softdev.route}/all`);
    await addHashTarget(page);
    await markPageRoot(page);

    await page.locator('#kk-probe-link').click();
    await expectProbeInView(page);
    expect(new URL(page.url()).hash).toBe('#kk-probe');
    expect(new URL(page.url()).pathname).toBe(withBase(`/${softdev.route}/all`));
    await expectView(page, { track: softdev, tab: 'all' });
    expect(await pageRootIsMarked(page)).toBe(true);
  });

  test('a #hash in the address is honoured on load', async ({ page }) => {
    // The target has to exist before the app renders: add it as soon as <body> exists.
    // (An init script runs before <html> exists, so the observer watches the document.)
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        observer.disconnect();
        const style = document.createElement('style');
        style.textContent = 'body::after { content: ""; display: block; height: 4000px; }';
        const target = document.createElement('div');
        target.id = 'kk-probe';
        target.style.cssText = 'position:absolute;left:0;top:2400px;height:40px;';
        document.body.append(style, target);
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto(`${relative(`/${game.route}/all`)}#kk-probe`);
    await expectView(page, { track: game, tab: 'all' });
    await expectProbeInView(page);
  });
});

test.describe('document head after a client navigation', () => {
  async function head(page: Page) {
    return page.evaluate(() => ({
      title: document.title,
      titles: document.head.querySelectorAll('title').length,
      canonicals: Array.from(document.head.querySelectorAll('link[rel="canonical"]'), (link) => link.getAttribute('href')),
      ogUrls: Array.from(document.head.querySelectorAll('meta[property="og:url"]'), (meta) => meta.getAttribute('content')),
      ogTitles: Array.from(document.head.querySelectorAll('meta[property="og:title"]'), (meta) => meta.getAttribute('content')),
      descriptions: document.head.querySelectorAll('meta[name="description"]').length,
      robots: Array.from(document.head.querySelectorAll('meta[name="robots"]'), (meta) => meta.getAttribute('content')),
    }));
  }

  test('title, canonical and Open Graph follow the page and the tab', async ({ page }) => {
    await open(page, '/');
    const home = expectedView('/');
    await expect(page).toHaveTitle(titleMatcher(home.track));
    expect((await head(page)).canonicals).toEqual([home.canonicalUrl]);

    const softdevAll = expectedView(`/${softdev.route}/all`);
    await navigate(page, softdevAll.route);
    await expectView(page, softdevAll);
    await expect(page).toHaveTitle(titleMatcher(softdevAll.track));
    await expect.poll(async () => (await head(page)).canonicals).toEqual([softdevAll.canonicalUrl]);
    const afterFirst = await head(page);
    expect(afterFirst.titles).toBe(1);
    expect(afterFirst.ogUrls).toEqual([softdevAll.canonicalUrl]);
    expect(afterFirst.ogTitles).toHaveLength(1);
    expect(titleMatches(softdevAll.track, afterFirst.ogTitles[0] ?? '')).toBe(true);
    expect(afterFirst.descriptions).toBeLessThanOrEqual(1);
    expect(afterFirst.robots).toEqual([]);

    // The default tab's canonical is the bare page route.
    const softdevDefault = expectedView(`/${softdev.route}/${softdev.defaultTab}`);
    await navigate(page, softdevDefault.route);
    await expectView(page, softdevDefault);
    await expect.poll(async () => (await head(page)).canonicals).toEqual([softdevDefault.canonicalUrl]);
    expect(softdevDefault.canonicalUrl).toBe(`${siteMap.origin}${withBase(`/${softdev.route}`)}`);
  });

  test('the not-found page is marked noindex and has no canonical', async ({ page }) => {
    await open(page, '/');
    await navigate(page, '/no/such/page');
    await expect(trackPage(page)).toHaveCount(0);
    await expect.poll(async () => (await head(page)).robots).toEqual(['noindex']);
    const state = await head(page);
    expect(state.canonicals).toEqual([]);
    expect(state.title).toContain(siteMap.siteName);
  });
});
