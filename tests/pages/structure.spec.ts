import { expect, test, type Page } from '@playwright/test';
import { expectToggleGeometry, toggleBoxes } from '../design/helpers';
import { assetHref, content, isExternal, routeOf, SECTION_IDS, SECTION_LABELS, TRACK_IDS, withBase } from './support/content';
import { cssVar, openRoute, sectionsNav, tabsNav, THEMES, trackPage } from './support/page';

/**
 * The page's skeleton on both pages: landmarks, section order, headings, the nav and its
 * anchors, the skip link, the phone menu, the theme toggle in the bar, image and link hygiene,
 * no overflow at 320px.
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

    test('the nav links the sections in order and the logo goes to the top', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // A CSS locator: behind the closed phone menu the nav is display:none, which role queries skip.
      const links = sectionsNav(page).locator('a[href]');
      await expect(links).toHaveCount(SECTION_IDS.length);
      for (const [index, id] of SECTION_IDS.entries()) {
        await expect(links.nth(index)).toHaveAttribute('href', `#${id}`);
        await expect(links.nth(index)).toHaveText(SECTION_LABELS[index]!);
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      // One link, named once, whether it shows the logo picture or the monogram text.
      const brand = page.getByRole('banner').getByRole('link', { name: `${site.name} — top of page`, exact: true });
      await expect(brand).toHaveCount(1);
      await expect(brand).toHaveAttribute('href', '#top');
      await expect(page.locator('#top')).toHaveCount(1);
      if (site.logo) {
        // The logo picture: the content path with the base in front, sized, eager, and it loads.
        await expect(brand).toHaveAttribute('data-nav-brand', 'logo');
        const logo = brand.locator('img[data-nav-logo]');
        await expect(logo).toHaveCount(1);
        await expect(logo).toHaveAttribute('src', assetHref(site.logo));
        await expect(logo).toHaveAttribute('alt', site.logoAlt);
        await expect(logo).toHaveAttribute('width', /^\d+$/);
        await expect(logo).toHaveAttribute('height', /^\d+$/);
        await expect(logo).toHaveAttribute('loading', 'eager');
        await expect(logo).toHaveAttribute('decoding', 'async');
        await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect((await brand.innerText()).trim(), 'no monogram text next to the picture').toBe('');
        // A 48px picture (20% more than the old 40px), transparent, with nothing behind it,
        // in a link of at least 44px, at the left end of the bar.
        const frame = brand.locator('[data-nav-logo-disc]');
        await expect(frame).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(brand).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        const [logoBox, brandBox] = await Promise.all([logo.boundingBox(), brand.boundingBox()]);
        expect(logoBox!.width).toBeCloseTo(48, 1);
        expect(logoBox!.height).toBeCloseTo(48, 1);
        expect(brandBox!.width).toBeGreaterThanOrEqual(44);
        expect(brandBox!.height).toBeGreaterThanOrEqual(44);
        const gutter = parseFloat(await cssVar(page.locator('html'), '--gutter'));
        expect(logoBox!.x, 'the picture starts at the gutter').toBeCloseTo(gutter, 0);
      } else {
        await expect(brand).toHaveAttribute('data-nav-brand', 'monogram');
        await expect(brand).toHaveText(site.monogram);
      }
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
          // The hero photo and the logo in the bar are on screen at once: those load eagerly.
          const aboveTheFold = image.closest('#about') !== null || image.closest('header') !== null;
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

  test('the menu button sits left of the theme toggle, in the DOM and in the tab order too', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'there is no menu button above 768px');
    await openRoute(page, routeOf(track));
    const banner = page.getByRole('banner');
    const button = banner.locator('[data-menu-button]');
    const toggle = banner.getByRole('switch');
    const monogram = banner.getByRole('link', { name: new RegExp(`${site.name}.*top`) });
    await expect(button).toBeVisible();
    await expect(toggle).toBeVisible();

    // On screen: logo … [menu button] [theme toggle], on one line, without overlapping.
    const [logoBox, buttonBox, toggleBox] = await Promise.all([monogram.boundingBox(), button.boundingBox(), toggle.boundingBox()]);
    expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(buttonBox!.x);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(toggleBox!.x);
    expect(toggleBox!.x - (buttonBox!.x + buttonBox!.width), 'gap between the two hit areas').toBeGreaterThanOrEqual(8);
    expect(buttonBox!.y + buttonBox!.height / 2).toBeCloseTo(toggleBox!.y + toggleBox!.height / 2, 0);

    // In the DOM: the menu button comes before the toggle.
    const follows = await button.evaluate((menuButton) => {
      const themeToggle = menuButton.closest('header')!.querySelector('[role="switch"]')!;
      return (menuButton.compareDocumentPosition(themeToggle) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(follows, 'the theme toggle follows the menu button in the DOM').toBe(true);

    // With the keyboard: Tab goes from the menu button to the toggle, Shift+Tab comes back.
    await button.focus();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();

    // Still true while the menu is open (the button becomes "Close menu").
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const [openButtonBox, openToggleBox] = await Promise.all([button.boundingBox(), toggle.boundingBox()]);
    expect(openButtonBox).toEqual(buttonBox);
    expect(openToggleBox).toEqual(toggleBox);
  });
});

test.describe('theme toggle in the nav', () => {
  const track = content.getTrack('game');

  /** The right edge of the bar's content box: where the gutter starts. */
  function barContentRight(page: Page): Promise<number> {
    return page
      .getByRole('banner')
      .locator('> *')
      .first()
      .evaluate((bar) => bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight));
  }

  for (const theme of THEMES) {
    test(`is a 48 × 22 pill in a 44px hit area, the right-most control, knob inside by night and by day — ${theme}`, async ({ page }) => {
      await openRoute(page, routeOf(track), { theme });
      const banner = page.getByRole('banner');
      const toggle = banner.getByRole('switch');
      await expect(toggle).toHaveCount(1);
      const first = theme === 'light' ? 'day' : 'night';
      await expectToggleGeometry(toggle, first, 'nav toggle');

      // Nothing in the bar is further right, and the pill ends flush with the gutter.
      const { button, pill } = await toggleBoxes(toggle);
      expect(pill.right).toBeCloseTo(await barContentRight(page), 1);
      const others = await banner.locator('a[href], button').evaluateAll((controls) =>
        controls.filter((control) => control.getAttribute('role') !== 'switch' && control.getClientRects().length > 0).map((control) => control.getBoundingClientRect().right),
      );
      expect(others.length).toBeGreaterThan(0);
      for (const right of others) expect(right).toBeLessThanOrEqual(button.left + 0.05);

      // The bar keeps its height: the smaller pill does not pull it in, the hit area does not push it out.
      const navHeight = await cssVar(page.locator('html'), '--nav-height');
      const barHeight = await banner.locator('> *').first().evaluate((bar) => bar.getBoundingClientRect().height);
      expect(barHeight).toBe(parseFloat(navHeight));

      // Switched from the keyboard, so no pointer rests on the knob while it is measured.
      await toggle.focus();
      await page.keyboard.press('Space');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
      await expectToggleGeometry(toggle, first === 'day' ? 'night' : 'day', 'nav toggle');
    });
  }

  test('switches the theme, keeps the choice in localStorage["kk-theme"] and comes back with it after a reload', async ({ page }) => {
    await openRoute(page, routeOf(track), { theme: 'dark' });
    const html = page.locator('html');
    const toggle = page.getByRole('banner').getByRole('switch');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAccessibleName('Switch to light mode');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');
    expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBe('light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
    const reloaded = page.getByRole('banner').getByRole('switch');
    await expect(reloaded).toHaveAttribute('aria-checked', 'true');
    await expectToggleGeometry(reloaded, 'day', 'nav toggle after a reload');
    await expectToggleGeometry(page.getByRole('contentinfo').getByRole('switch'), 'day', 'footer toggle after a reload');

    await reloaded.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBe('dark');
  });

  test('the bar controls do not move while the page loads', async ({ page }) => {
    // Record every layout shift from the first paint on, with the elements that moved.
    await page.addInitScript(() => {
      const moved: string[] = [];
      (window as unknown as { __navShifts: string[] }).__navShifts = moved;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const sources = (entry as unknown as { sources?: { node: Node | null }[] }).sources ?? [];
          for (const source of sources) {
            const element = source.node instanceof Element ? source.node : source.node?.parentElement;
            if (!element?.closest('header')) continue;
            // A control (the logo link included), a part of one, or a box in the bar that holds one.
            const controls = '[data-theme-toggle], [data-menu-button], [data-nav-brand]';
            if (element.closest(controls) || element.querySelector(controls)) moved.push(`${element.tagName.toLowerCase()}.${element.className}`);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await openRoute(page, routeOf(track), { theme: 'light' });
    await expect(page.getByRole('banner').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as unknown as { __navShifts: string[] }).__navShifts)).toEqual([]);
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
