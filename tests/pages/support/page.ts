/**
 * Browser helpers for tests/pages. Every test blocks requests to other origins by default:
 * the content hot-links images (and the viewer embeds YouTube) from hosts a test must not
 * depend on, and a dead host could stall a page's load event for a long time. Blocked images
 * fail at once, which is also how the fallbacks get exercised.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { waitForReact } from '../../infra/support/page';
import { relative } from './content';

export type Theme = 'dark' | 'light';
export const THEMES: readonly Theme[] = ['dark', 'light'];

export const TRACK_PAGE = '[data-testid="track-page"]';
export const VIEWER = '[data-testid="media-viewer"]';

/** A 1 × 1 transparent PNG, for tests that want an image to load. */
export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const LOCAL = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i;

/** Block every request that leaves the dev server. */
export async function blockOtherOrigins(page: Page): Promise<void> {
  await page.route((url) => !LOCAL.test(url.href), (route) => route.abort('blockedbyclient'));
}

/** Answer requests for `urls` with a tiny PNG, so those images load. Call before blockOtherOrigins(). */
export async function serveTinyImages(page: Page, urls: readonly string[]): Promise<void> {
  const wanted = new Set(urls);
  await page.route((url) => wanted.has(url.href), (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }));
}

/**
 * Store an explicit theme choice before any page script runs (same key as the app). Only the
 * first load of the test is preset; later reloads see whatever the page itself stored.
 */
export async function presetTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((value) => {
    if (window.sessionStorage.getItem('kk-pages-preset')) return;
    window.sessionStorage.setItem('kk-pages-preset', '1');
    window.localStorage.setItem('kk-theme', value);
  }, theme);
}

export interface OpenOptions {
  theme?: Theme;
  /** Default true. */
  blockOtherOrigins?: boolean;
  /** Image URLs that must load (answered with a tiny PNG) although other origins are blocked. */
  serveImages?: readonly string[];
  /** Query string and hash to append, for example "?view=scarfall&item=1". */
  suffix?: string;
}

/** Open a page view by its router path ("/", "/gamedev/unity") and wait until React has rendered it. */
export async function openRoute(page: Page, routePath: string, options: OpenOptions = {}): Promise<void> {
  if (options.theme) await presetTheme(page, options.theme);
  if (options.blockOtherOrigins !== false) await blockOtherOrigins(page);
  // Registered after the block, so it is matched first.
  if (options.serveImages && options.serveImages.length > 0) await serveTinyImages(page, options.serveImages);
  await page.goto(`${relative(routePath)}${options.suffix ?? ''}`);
  await waitForReact(page, TRACK_PAGE);
  await waitForFonts(page);
}

/**
 * Wait until Inter Variable is really loaded. `document.fonts.ready` resolves as soon as no
 * font request is pending, which on a fresh page can be before the request has started; the
 * swap that follows reflows the text (the hero loses ~70px) and would look like a layout shift
 * to a test that measured across it.
 */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('400 1em "Inter Variable"'), document.fonts.load('700 1em "Inter Variable"')]);
    await document.fonts.ready;
  });
}

export function trackPage(page: Page): Locator {
  return page.locator(TRACK_PAGE);
}

export function viewer(page: Page): Locator {
  return page.locator(VIEWER);
}

/** The section links' nav. A CSS locator on purpose: it is display:none behind the phone menu. */
export function sectionsNav(page: Page): Locator {
  return page.locator('nav[aria-label="Sections"]');
}

export function tabsNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Project categories' });
}

export function cards(page: Page): Locator {
  return page.locator('[data-testid="project-grid"] [data-project]');
}

export function card(page: Page, slug: string): Locator {
  return page.locator(`[data-testid="project-grid"] [data-project="${slug}"]`);
}

export function mediaButton(cardLocator: Locator): Locator {
  return cardLocator.locator('[data-media-overlay]');
}

export function pathnameOf(page: Page): string {
  return new URL(page.url()).pathname;
}

export function searchOf(page: Page): string {
  return new URL(page.url()).search;
}

export function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** Wait until a (smooth) scroll has come to rest. */
export async function waitForScrollToSettle(page: Page): Promise<void> {
  let last = await scrollY(page);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(150);
    const current = await scrollY(page);
    if (current === last) return;
    last = current;
  }
}

/** Wait until an element's box has stopped changing (late font swaps, reveal animations). */
export async function waitForBoxToSettle(locator: Locator): Promise<void> {
  let last = JSON.stringify(await locator.boundingBox());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await locator.page().waitForTimeout(250);
    const current = JSON.stringify(await locator.boundingBox());
    if (current === last) return;
    last = current;
  }
}

export async function scrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' }), top);
  await expect.poll(() => scrollY(page)).toBe(top);
}

/** Computed value of a CSS custom property on an element. */
export function cssVar(locator: Locator, name: string): Promise<string> {
  return locator.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property).trim(), name);
}

/** "#rrggbb" → "rgb(r, g, b)", how getComputedStyle reports colours. */
export function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const channel = (offset: number) => parseInt(value.slice(offset, offset + 2), 16);
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

/** true when the focused element is inside `container`. */
export function focusIsInside(page: Page, container: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    return root !== null && document.activeElement !== null && root.contains(document.activeElement);
  }, container);
}

/** Open the viewer by clicking a card's media button and wait for it. */
export async function openViewerFromCard(page: Page, slug: string): Promise<Locator> {
  const button = mediaButton(card(page, slug));
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const dialog = viewer(page);
  await expect(dialog).toBeVisible();
  return dialog;
}
