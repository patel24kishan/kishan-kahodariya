import { expect, test } from '@playwright/test';
import { expectedView, relative, siteMap } from '../infra/support/site-map';
import { assetHref, content } from '../pages/support/content';
import { attribute, decodeEntities, rootMarkup, tags } from './support/html';

/**
 * Three things every prerendered page must already carry in its HTML, before any script runs:
 * the resume and the summary of the tab that page shows (getResume(track, tab) and
 * getSummary(track, tab)) and the logo in the nav bar.
 * Read from the raw response, the way a crawler or a visitor without JavaScript gets it.
 */
const site = content.getSite();

/** Text inside the first element whose opening tag is `openingTag` (up to its closing tag). */
function textOf(html: string, openingTag: string, name: string): string {
  const start = html.indexOf(openingTag);
  if (start < 0) return '';
  const from = start + openingTag.length;
  const end = html.indexOf(`</${name}>`, from);
  return decodeEntities(html.slice(from, end < 0 ? undefined : end).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

for (const route of siteMap.routes) {
  test(`GET ${route}: the HTML carries the resume and the summary of its tab and the nav logo`, async ({ request }) => {
    const view = expectedView(route);
    const response = await request.get(relative(route), { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const markup = rootMarkup(await response.text());

    // ---- Resume: the open tab's, or no button when that tab has no resume at all ----------
    const resume = content.getResume(view.track.id, view.tab);
    const resumeTags = tags(markup, 'a').filter((tag) => attribute(tag, 'data-hero-resume') !== null);
    const url = resume.url.trim();
    if (url) {
      expect(resumeTags, 'one resume button').toHaveLength(1);
      expect(attribute(resumeTags[0]!, 'href')).toBe(url);
      const label = resume.label.trim() || 'Resume';
      expect(textOf(markup, resumeTags[0]!, 'a').startsWith(label), `button text starts with "${label}"`).toBe(true);
    } else {
      expect(resumeTags, 'no resume button').toHaveLength(0);
    }

    // ---- Summary: the open tab's own text, or the page's; no block when there is none -------
    const summary = content.getSummary(view.track.id, view.tab).replace(/\s+/g, ' ').trim();
    const summaryTags = tags(markup, 'div').filter((tag) => attribute(tag, 'data-hero-summary') !== null);
    if (summary) {
      expect(summaryTags, 'one summary block').toHaveLength(1);
      expect(textOf(markup, summaryTags[0]!, 'div')).toBe(summary);
      // Inside the hero, before the buttons.
      const at = markup.indexOf(summaryTags[0]!);
      expect(at).toBeGreaterThan(markup.indexOf('id="about"'));
      if (resumeTags[0]) expect(at).toBeLessThan(markup.indexOf(resumeTags[0]));
    } else {
      expect(summaryTags, 'no summary block').toHaveLength(0);
    }

    // ---- Logo: the picture when one is set (with the base path), else the monogram text ----
    const brandTags = tags(markup, 'a').filter((tag) => attribute(tag, 'data-nav-brand') !== null);
    expect(brandTags, 'one logo link').toHaveLength(1);
    expect(attribute(brandTags[0]!, 'href')).toBe('#top');
    expect(attribute(brandTags[0]!, 'aria-label')).toBe(`${site.name} — top of page`);
    const logoTags = tags(markup, 'img').filter((tag) => attribute(tag, 'data-nav-logo') !== null);
    if (site.logo) {
      expect(attribute(brandTags[0]!, 'data-nav-brand')).toBe('logo');
      expect(logoTags).toHaveLength(1);
      expect(attribute(logoTags[0]!, 'src')).toBe(assetHref(site.logo));
      expect(attribute(logoTags[0]!, 'alt')).toBe(site.logoAlt);
      expect(attribute(logoTags[0]!, 'width')).toMatch(/^\d+$/);
      expect(attribute(logoTags[0]!, 'height')).toMatch(/^\d+$/);
      expect(attribute(logoTags[0]!, 'loading')).toBe('eager');
    } else {
      expect(attribute(brandTags[0]!, 'data-nav-brand')).toBe('monogram');
      expect(logoTags).toHaveLength(0);
      expect(textOf(markup, brandTags[0]!, 'a')).toBe(site.monogram);
    }
  });
}

test('the logo file is in the build and is an image', async ({ request }) => {
  test.skip(!site.logo || /^(?:https?:)?\/\//i.test(site.logo), 'no logo, or one on another site');
  // Site-root path: assetHref() already carries the base ("/kishan-kahodariya/images/…").
  const response = await request.get(assetHref(site.logo), { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\//);
});

test('the logo is on screen after hydration, with no background behind it, and nothing in the bar moved', async ({ page }) => {
  test.skip(!site.logo, 'no logo');
  await page.addInitScript(() => {
    const moved: string[] = [];
    (window as unknown as { __navShifts: string[] }).__navShifts = moved;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const sources = (entry as unknown as { sources?: { node: Node | null }[] }).sources ?? [];
        for (const source of sources) {
          const element = source.node instanceof Element ? source.node : source.node?.parentElement;
          if (!element?.closest('header')) continue;
          const controls = '[data-theme-toggle], [data-menu-button], [data-nav-brand]';
          if (element.closest(controls) || element.querySelector(controls)) moved.push(`${element.tagName.toLowerCase()}.${element.className}`);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('./');
  const brand = page.getByRole('banner').locator('a[data-nav-brand]');
  const logo = brand.locator('img[data-nav-logo]');
  await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  // Still the picture after React took over (a failed load would have swapped in the monogram).
  await expect(brand).toHaveAttribute('data-nav-brand', 'logo');
  await expect(brand).toHaveAccessibleName(`${site.name} — top of page`);
  const frame = brand.locator('[data-nav-logo-disc]');
  await expect(frame).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const picture = await logo.boundingBox();
  expect(picture!.width).toBeCloseTo(48, 1);
  expect(picture!.height).toBeCloseTo(48, 1);
  expect(await page.evaluate(() => (window as unknown as { __navShifts: string[] }).__navShifts)).toEqual([]);
});

test('the hero summary is in place from the first paint: opened straight on a tab, it never shifts and hydration keeps the element', async ({ page }) => {
  const game = content.getTrack('game');
  const tab = content.getTabs().find((candidate) => candidate.id !== game.defaultTab);
  test.skip(!tab, 'the site has one tab only');
  if (!tab) return;
  const expected = content.getSummary('game', tab.id).replace(/\s+/g, ' ').trim();
  test.skip(expected === '', 'this tab has no summary');

  await page.addInitScript(() => {
    const state = { shifts: [] as string[], first: null as Element | null };
    (window as unknown as { __summary: typeof state }).__summary = state;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const sources = (entry as unknown as { sources?: { node: Node | null }[] }).sources ?? [];
        for (const source of sources) {
          const element = source.node instanceof Element ? source.node : source.node?.parentElement;
          if (element?.closest('[data-hero-summary]')) state.shifts.push(`${element.tagName.toLowerCase()}: ${(entry as unknown as { value: number }).value}`);
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
    // The element the server sent: caught while the HTML is parsed, before the page's
    // (deferred) script runs.
    const watcher = new MutationObserver(() => {
      state.first = document.querySelector('[data-hero-summary]');
      if (state.first) watcher.disconnect();
    });
    watcher.observe(document, { childList: true, subtree: true });
  });
  await page.goto(relative(`/${game.route}/${tab.id}`));
  const block = page.locator('#about [data-hero-summary]');
  await expect(block).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);

  await expect(page.locator('[data-testid="track-page"]')).toHaveAttribute('data-tab', tab.id);
  expect((await block.innerText()).replace(/\s+/g, ' ').trim()).toBe(expected);
  const result = await page.evaluate(() => {
    const state = (window as unknown as { __summary: { shifts: string[]; first: Element | null } }).__summary;
    return { shifts: state.shifts, hadServerElement: state.first !== null, sameElement: state.first === document.querySelector('[data-hero-summary]') };
  });
  expect(result).toEqual({ shifts: [], hadServerElement: true, sameElement: true });
});
