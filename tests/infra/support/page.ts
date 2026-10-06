/**
 * Shared page helpers for the infra and build suites.
 *
 * THE PAGE HOOK (contract with the pages agent)
 * The public page marks its root element with three attributes on ONE element:
 *     data-testid="track-page"   data-track="game|softdev"   data-tab="<tab id>"
 * (ARCHITECTURE.md section 5 already asks for data-track on the page root.) Every routing
 * test reads the open page and tab from that element and nothing else, so the markup inside
 * it can change freely. If the hook ever has to move, this file is the only place to edit.
 *
 * The not-found page is marked with data-testid="not-found" (src/lib/not-found/NotFound.tsx).
 */
import { expect, type ConsoleMessage, type Locator, type Page } from '@playwright/test';

export const TRACK_PAGE = '[data-testid="track-page"]';
export const NOT_FOUND = '[data-testid="not-found"]';

export function trackPage(page: Page): Locator {
  return page.locator(TRACK_PAGE);
}

/** Assert which page and which tab are on screen. */
export async function expectView(page: Page, view: { track: { id: string }; tab: string }): Promise<void> {
  const root = trackPage(page);
  await expect(root).toHaveCount(1);
  await expect(root).toHaveAttribute('data-track', view.track.id);
  await expect(root).toHaveAttribute('data-tab', view.tab);
}

export function pathnameOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/** Wait until the address bar shows exactly this URL path. */
export async function expectPathname(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => pathnameOf(page), { message: `address should become ${pathname}` }).toBe(pathname);
}

/**
 * Wait until React has attached to the page root. On a prerendered page that moment is the
 * end of hydration; on the dev server the element only exists once React has rendered it.
 * (React stores its fiber on the DOM node under a "__reactFiber$…" key.)
 */
export async function waitForReact(page: Page, selector: string = TRACK_PAGE): Promise<void> {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target);
    return element !== null && Object.keys(element).some((key) => key.startsWith('__reactFiber$'));
  }, selector);
}

export interface Problems {
  /** console.error / console.warn output and uncaught errors, same-origin only. */
  readonly messages: string[];
  /** Same-origin requests that failed or answered with status >= 400. */
  readonly failedRequests: string[];
}

/**
 * Record everything that should never happen on a healthy page: console errors and warnings
 * (React reports hydration mismatches there), uncaught exceptions and failed requests.
 * Cross-origin noise is left out: content hot-links images from other sites, and whether
 * those hosts answer is not something a build can guarantee.
 * Call it BEFORE page.goto(). `baseURL` is the Playwright baseURL fixture (the site's origin).
 */
export function watchForProblems(page: Page, baseURL: string | undefined): Problems {
  if (!baseURL) throw new Error('watchForProblems() needs the baseURL fixture.');
  const siteOrigin = new URL(baseURL).origin;
  const messages: string[] = [];
  const failedRequests: string[] = [];

  const sameOrigin = (url: string): boolean => {
    if (url === '') return true;
    try {
      return new URL(url).origin === siteOrigin;
    } catch {
      return true;
    }
  };

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (!sameOrigin(message.location().url)) return;
    messages.push(`[console.${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    messages.push(`[uncaught] ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    if (sameOrigin(request.url())) failedRequests.push(`${request.url()} — ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && sameOrigin(response.url())) failedRequests.push(`${response.url()} — HTTP ${response.status()}`);
  });

  return { messages, failedRequests };
}

/**
 * Init script (page.addInitScript(markServerMarkup, selector)) — runs before any page script
 * and remembers the element that came out of the HTML parser. If React hydrates, that very
 * node is still in place afterwards; if React throws the markup away and renders from
 * scratch (a hydration failure, or createRoot by mistake) it is a different node.
 */
export function markServerMarkup(selector: string): void {
  const observer = new MutationObserver(() => {
    const element = document.querySelector(selector);
    if (!element) return;
    observer.disconnect();
    const createdByReact = Object.keys(element).some((key) => key.startsWith('__reactFiber$'));
    if (!createdByReact) Reflect.set(element, '__kkFromServer', true);
  });
  observer.observe(document, { childList: true, subtree: true });
}

/** true when the element matching `selector` is the node the server sent (see markServerMarkup). */
export function cameFromServer(page: Page, selector: string = TRACK_PAGE): Promise<boolean> {
  return page.locator(selector).evaluate((element) => Reflect.get(element, '__kkFromServer') === true);
}

/** Let anything React or the page still wants to log reach the console. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}
