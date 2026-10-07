import { expect, test } from '@playwright/test';
import { assetHref, content, isExternal, routeOf, SECTION_IDS, SECTION_LABELS, TRACK_IDS, withBase } from './support/content';
import { openRoute, sectionsNav, tabsNav, trackPage } from './support/page';

/**
 * The page's skeleton on both pages: landmarks, section order, headings, the nav and its
 * anchors, the skip link, the phone menu, image and link hygiene, no overflow at 320px.
 */
const site = content.getSite();

/** Every image URL the content refers to, so the images can be served and counted. */
function contentImageUrls(trackId: (typeof TRACK_IDS)[number]): string[] {
  const urls = new Set<string>();
  for (const project of content.getProjects(trackId, 'all')) for (const shot of project.screenshots) urls.add(assetHref(shot.src));
  for (const entry of content.getExperience(trackId)) if (entry.logo) urls.add(assetHref(entry.logo));
  for (const certificate of content.getCertificates(trackId)) if (certificate.image) urls.add(assetHref(certificate.image));
  return [...urls].filter(isExternal);
}

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);

  test.describe(`${track.route} page`, () => {
    test('has the landmarks and the sections in order; certificates lead when the track says so', async ({ page }) => {
      await openRoute(page, routeOf(track));
      await expect(trackPage(page)).toHaveAttribute('data-track', trackId);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await expect(sectionsNav(page)).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Footer' })).toHaveCount(1);
      await expect(tabsNav(page)).toHaveCount(1);

      const ids = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id));
      expect(ids).toEqual([...SECTION_IDS]);

      const columns = await page.locator('#education [data-column]').evaluateAll((list) => list.map((column) => column.getAttribute('data-column')));
      expect(columns).toEqual(track.certificatesFirst ? ['certificates', 'education'] : ['education', 'certificates']);
      // The first column in the DOM is also first on screen (left on desktop, above on phones).
      const boxes = await page.locator('#education [data-column]').evaluateAll((list) =>
        list.map((column) => {
          const rect = column.getBoundingClientRect();
          return { x: Math.round(rect.left), y: Math.round(rect.top) };
        }),
      );
      expect(boxes).toHaveLength(2);
      expect(boxes[0]!.y < boxes[1]!.y || (boxes[0]!.y === boxes[1]!.y && boxes[0]!.x < boxes[1]!.x)).toBe(true);
    });

    test('has exactly one h1 and never skips a heading level', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(site.name);
      const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
      expect(levels[0]).toBe(1);
      expect(levels.filter((level) => level === 1)).toHaveLength(1);
      for (let index = 1; index < levels.length; index += 1) {
        expect(levels[index]!, `heading ${index} jumps from h${levels[index - 1]} to h${levels[index]}`).toBeLessThanOrEqual(levels[index - 1]! + 1);
      }
      for (const label of ['Projects', 'Experience', 'Skills']) {
        await expect(page.locator('main').getByRole('heading', { level: 2, name: label, exact: true })).toHaveCount(1);
      }
      await expect(page.locator('#education').getByRole('heading', { level: 2 })).toHaveText(/Education/);
    });

    test('the nav links the sections in order and the monogram goes to the top', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // A CSS locator: behind the closed phone menu the nav is display:none, which role queries skip.
      const links = sectionsNav(page).locator('a[href]');
      await expect(links).toHaveCount(SECTION_IDS.length);
      for (const [index, id] of SECTION_IDS.entries()) {
        await expect(links.nth(index)).toHaveAttribute('href', `#${id}`);
        await expect(links.nth(index)).toHaveText(SECTION_LABELS[index]!);
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      const monogram = page.getByRole('banner').getByRole('link', { name: new RegExp(`${site.name}.*top`) });
      await expect(monogram).toHaveText(site.monogram);
      await expect(monogram).toHaveAttribute('href', '#top');
      await expect(page.locator('#top')).toHaveCount(1);
      // No link between the two pages, on purpose.
      const other = content.getTracks().find((candidate) => candidate.id !== trackId);
      if (other) {
        await expect(page.locator(`a[href$="/${other.route}"], a[href*="/${other.route}/"]`)).toHaveCount(0);
      }
    });

    test('a section link lands the section just below the sticky nav', async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track));
      if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
      await sectionsNav(page).getByRole('link', { name: 'Skills' }).click();
      const navHeight = await page.getByRole('banner').evaluate((element) => element.getBoundingClientRect().height);
      // The scroll is smooth: wait until it has settled just below the nav.
      await expect
        .poll(
          async () => {
            const top = await page.locator('#skills').evaluate((element) => Math.round(element.getBoundingClientRect().top));
            return top >= navHeight - 1 && top <= navHeight + 24 ? 'below the nav' : `top at ${top}px`;
          },
          { timeout: 10_000 },
        )
        .toBe('below the nav');
      expect(new URL(page.url()).hash).toBe('#skills');
    });

    test('the skip link is the first focusable element and moves focus to main', async ({ page }) => {
      await openRoute(page, routeOf(track));
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to content' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator('main#main')).toBeFocused();
    });

    test('every image has alt, width and height; hot-linked ones send no referrer and load lazily', async ({ page }) => {
      await openRoute(page, routeOf(track, 'all'), { serveImages: contentImageUrls(trackId) });
      const report = await page.locator('img').evaluateAll((images) =>
        images.flatMap((image) => {
          const problems: string[] = [];
          const src = image.getAttribute('src') ?? '';
          if (!image.hasAttribute('alt')) problems.push(`${src}: no alt`);
          if (!image.getAttribute('width') || !image.getAttribute('height')) problems.push(`${src}: no width/height`);
          const external = /^(?:https?:)?\/\//i.test(src) && new URL(src, location.href).origin !== location.origin;
          if (external && image.getAttribute('referrerpolicy') !== 'no-referrer') problems.push(`${src}: no referrerpolicy`);
          const aboveTheFold = image.closest('#about') !== null;
          if (!aboveTheFold && image.getAttribute('loading') !== 'lazy') problems.push(`${src}: not lazy`);
          return problems;
        }),
      );
      expect(report).toEqual([]);
      expect(await page.locator('img').count()).toBeGreaterThan(5);
    });

    test('links to other sites open in a new tab safely; mailto and anchors do not', async ({ page }) => {
      await openRoute(page, routeOf(track, 'all'));
      const report = await page.locator('a[href]').evaluateAll((anchors) =>
        anchors.flatMap((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          const external = /^(?:https?:)?\/\//i.test(href);
          const problems: string[] = [];
          if (external) {
            if (anchor.getAttribute('target') !== '_blank') problems.push(`${href}: no target`);
            const rel = (anchor.getAttribute('rel') ?? '').split(/\s+/);
            if (!rel.includes('noopener') || !rel.includes('noreferrer')) problems.push(`${href}: rel is "${anchor.getAttribute('rel')}"`);
          } else if (anchor.hasAttribute('target')) {
            problems.push(`${href}: must not open a new tab`);
          }
          return problems;
        }),
      );
      expect(report).toEqual([]);
      expect(await page.locator('a[href^="http"]').count()).toBeGreaterThan(0);
    });

    test('no horizontal scroll at 320px', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openRoute(page, routeOf(track, 'all'));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(widths.scroll).toBeLessThanOrEqual(320);
      expect(widths.body).toBeLessThanOrEqual(320);
      const poking = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.right > 320.5 && !element.closest('[class*="scroller"], [class*="thumbs"]');
          })
          .slice(0, 5)
          .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
      );
      expect(poking, poking.join('\n')).toEqual([]);
    });
  });
}

test.describe('phone menu', () => {
  const track = content.getTrack('game');

  test('is a disclosure: opens, closes on Esc with focus back on the button, closes after a link and on a click outside', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the links are inline above 768px');
    await openRoute(page, routeOf(track));
    const button = page.getByRole('button', { name: 'Open menu' });
    const nav = sectionsNav(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute('aria-controls', await nav.evaluate((element) => element.id));
    await expect(nav).toBeHidden();
    // The theme toggle stays in the bar.
    await expect(page.getByRole('banner').getByRole('switch')).toBeVisible();

    await button.click();
    const closeButton = page.getByRole('button', { name: 'Close menu' });
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(SECTION_IDS.length);

    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();

    await button.click();
    await nav.getByRole('link', { name: 'Projects' }).click();
    await expect(nav).toBeHidden();
    expect(new URL(page.url()).hash).toBe('#projects');

    await button.click();
    await expect(nav).toBeVisible();
    await page.mouse.click(200, 620);
    await expect(nav).toBeHidden();
  });

  test('is absent on wider screens, where the links are inline', async ({ page, isMobile }) => {
    test.skip(isMobile, 'phone layout');
    await openRoute(page, routeOf(track));
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
    await expect(sectionsNav(page)).toBeVisible();
    await expect(sectionsNav(page).getByRole('link')).toHaveCount(SECTION_IDS.length);
  });
});

test('the page root carries the routing hook on one element', async ({ page }) => {
  const track = content.getTrack('softdev');
  await openRoute(page, routeOf(track, 'all'));
  const root = trackPage(page);
  await expect(root).toHaveCount(1);
  await expect(root).toHaveAttribute('data-track', 'softdev');
  await expect(root).toHaveAttribute('data-tab', 'all');
  expect(new URL(page.url()).pathname).toBe(withBase(routeOf(track, 'all')));
});
