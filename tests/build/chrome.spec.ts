import { expect, test, type Page } from '@playwright/test';
import { expectedView, relative, siteMap } from '../infra/support/site-map';
import { assetHref, content } from '../pages/support/content';
import { attribute, decodeEntities, rootMarkup, tags } from './support/html';

/**
 * Three things every prerendered page must already carry in its HTML, before any script runs:
 * the resume and the summary of the tab that page shows (getResume(track, tab) and
 * getSummary(track, tab)) and the logo in the nav bar — and the motion header and hero in their
 * top-of-page, nothing-started state.
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

/**
 * The hero's background video lives on another host. These tests wait for the network to go
 * quiet and must not depend on that host: its requests are refused.
 */
async function blockVideo(page: Page): Promise<void> {
  await page.route(
    (url) => /\.(?:mp4|webm|mov|m4v)$/i.test(url.pathname),
    (route) => route.abort('blockedbyclient'),
  );
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

    // ---- Header: the top-of-page state (see-through, on dark), no section marked, no menu ----
    const headerTags = tags(markup, 'header').filter((tag) => attribute(tag, 'data-site-header') !== null);
    expect(headerTags, 'one header').toHaveLength(1);
    expect(attribute(headerTags[0]!, 'data-on-dark'), 'the server renders the bar over the hero').not.toBeNull();
    expect(attribute(headerTags[0]!, 'data-scrolled')).toBeNull();
    const headerEnd = markup.indexOf('</header>');
    const headerMarkup = markup.slice(markup.indexOf(headerTags[0]!), headerEnd);
    expect(headerMarkup).not.toContain('aria-current');
    expect(tags(markup, 'dialog'), 'the closed phone menu is not in the HTML').toHaveLength(0);
    const contactTags = tags(headerMarkup, 'a').filter((tag) => attribute(tag, 'data-nav-contact') !== null);
    if (site.contactLabel.trim() && site.email.trim()) {
      expect(contactTags).toHaveLength(1);
      expect(attribute(contactTags[0]!, 'href')).toBe(`mailto:${site.email.trim()}`);
      expect(textOf(headerMarkup, contactTags[0]!, 'a')).toBe(site.contactLabel.trim());
    } else {
      expect(contactTags).toHaveLength(0);
    }

    // ---- Hero: the name as the h1, the stats, and a video that cannot start by itself --------
    const track = content.getTrack(view.track.id);
    const h1 = tags(markup, 'h1');
    expect(h1).toHaveLength(1);
    expect(textOf(markup, h1[0]!, 'h1')).toBe(site.name);
    const videoTags = tags(markup, 'video');
    if (track.heroVideo) {
      expect(videoTags, 'one background video').toHaveLength(1);
      expect(attribute(videoTags[0]!, 'src')).toBe(assetHref(track.heroVideo));
      // No autoplay attribute: the page decides after checking reduced motion and data saving,
      // and nothing is fetched before that.
      expect(/\sautoplay\b/i.test(videoTags[0]!), 'no autoplay attribute in the HTML').toBe(false);
      expect(attribute(videoTags[0]!, 'preload')).toBe('none');
      expect(/\smuted\b/i.test(videoTags[0]!)).toBe(true);
      expect(/\sloop\b/i.test(videoTags[0]!)).toBe(true);
      expect(/\splaysinline\b/i.test(videoTags[0]!)).toBe(true);
      expect(/\scontrols\b/i.test(videoTags[0]!)).toBe(false);
      expect(attribute(videoTags[0]!, 'tabindex')).toBe('-1');
    } else {
      expect(videoTags).toHaveLength(0);
    }
    // Gone from the hero: the photo and the hero link buttons.
    expect(markup).not.toContain('data-hero-photo');
    expect(markup).not.toContain('data-hero-link');
    // Nothing in the HTML is hidden waiting for a script: no inline opacity or visibility.
    const about = markup.slice(markup.indexOf('id="about"'), markup.indexOf('id="projects"'));
    expect(about).not.toMatch(/style="[^"]*(?:opacity|visibility)/i);
    const badge = [track.badgeLine1.trim(), track.badgeLine2.trim()].filter(Boolean);
    for (const line of badge) expect(decodeEntities(about)).toContain(line);
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
  await blockVideo(page);
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
  await blockVideo(page);
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
