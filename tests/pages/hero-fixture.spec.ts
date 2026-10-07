import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createContentApi } from '../../src/content/selectors';
import type { TrackId } from '../../src/content/types';
import { focusRingOf } from '../design/helpers';
import { withBase } from './support/content';
import { FIXTURE_CONTENT, LOGO_OK, type LogoCase } from './support/hero-fixture.content';
import { blockOtherOrigins, cssVar, hexToRgb, presetTheme, tabsNav, THEMES, type Theme } from './support/page';

/**
 * Cases the real content cannot produce, on tests/pages/support/hero-fixture.html (served by
 * the dev server, never built): a resume of its own on one project tab, a row without an
 * address, a page without a main resume; and a nav logo that is missing or does not load.
 * The fixture mounts the real SiteNav, Hero and tab links and is wired like the real page.
 */
const FIXTURE_PATH = 'tests/pages/support/hero-fixture.html';
const api = createContentApi(FIXTURE_CONTENT);
const site = api.getSite();
const tabs = api.getTabs();

interface FixtureOptions {
  track?: TrackId;
  /** Router path the fixture starts at, for example "/gamedev/unreal". */
  path?: string;
  logo?: LogoCase;
  theme?: Theme;
}

async function openFixture(page: Page, options: FixtureOptions = {}): Promise<Locator> {
  if (options.theme) await presetTheme(page, options.theme);
  await blockOtherOrigins(page);
  const query = new URLSearchParams({ track: options.track ?? 'game' });
  if (options.path) query.set('path', options.path);
  if (options.logo) query.set('logo', options.logo);
  await page.goto(`${FIXTURE_PATH}?${query.toString()}`);
  const root = page.locator('[data-testid="hero-fixture"]');
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  return root;
}

function resumeButton(page: Page): Locator {
  return page.locator('#about [data-hero-resume]');
}

async function expectResume(page: Page, expected: { url: string; label: string }): Promise<void> {
  const button = resumeButton(page);
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('href', expected.url);
  // The whole text: the label, then the hidden hint every new-tab link carries.
  await expect(button).toHaveText(`${expected.label} (opens in a new tab)`);
  await expect(button).toHaveAttribute('target', '_blank');
  await expect(button).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(button).toHaveAttribute('data-variant', 'accent');
}

async function chooseTab(page: Page, root: Locator, tabId: string): Promise<void> {
  const label = tabs.find((tab) => tab.id === tabId)!.label;
  await tabsNav(page).getByRole('link', { name: label, exact: true }).click();
  await expect(root).toHaveAttribute('data-tab', tabId);
}

test.describe('resume button per project tab', () => {
  const game = api.getTrack('game');
  const MAIN = { url: 'https://example.com/resume/game.pdf', label: 'Game Dev Resume' };
  /** What each tab of the hand-made game page must show (see hero-fixture.content.ts). */
  const EXPECTED: Record<string, { url: string; label: string; why: string }> = {
    unreal: { url: 'https://example.com/resume/unreal.pdf', label: 'Unreal Resume', why: 'its own address and label' },
    unity: { ...MAIN, why: 'a row without an address falls back to the main resume' },
    webapps: { ...MAIN, why: 'no row: the main resume' },
    all: { url: 'https://example.com/resume/everything.pdf', label: 'Game Dev Resume', why: 'its own address, the main label' },
  };

  test('the hand-made content says what this test assumes', () => {
    expect(tabs.map((tab) => tab.id)).toEqual(['unreal', 'unity', 'webapps', 'all']);
    for (const tab of tabs) {
      const { url, label } = EXPECTED[tab.id]!;
      expect(api.getResume('game', tab.id), tab.id).toEqual({ url, label });
    }
    expect({ url: game.resumeUrl, label: game.resumeLabel }).toEqual(MAIN);
  });

  for (const tab of tabs) {
    test(`opened straight on /gamedev/${tab.id}: ${EXPECTED[tab.id]!.why}`, async ({ page }) => {
      const root = await openFixture(page, { path: `/gamedev/${tab.id}` });
      await expect(root).toHaveAttribute('data-tab', tab.id);
      await expectResume(page, EXPECTED[tab.id]!);
    });
  }

  test('the page without a tab in its address shows the resume of its first tab', async ({ page }) => {
    const root = await openFixture(page, { path: '/gamedev' });
    await expect(root).toHaveAttribute('data-tab', game.defaultTab);
    await expectResume(page, EXPECTED[game.defaultTab]!);
  });

  test('choosing a tab swaps the resume in place, each way', async ({ page }) => {
    const root = await openFixture(page, { path: '/gamedev' });
    await expectResume(page, MAIN);
    // Mark the button: a tab change must update this very element, not replace it.
    await resumeButton(page).evaluate((button) => button.setAttribute('data-test-mark', 'same-element'));

    for (const tabId of ['unreal', 'webapps', 'all', 'unity', 'unreal']) {
      await chooseTab(page, root, tabId);
      await expectResume(page, EXPECTED[tabId]!);
      await expect(resumeButton(page), `after choosing ${tabId}`).toHaveAttribute('data-test-mark', 'same-element');
    }
    // The other hero buttons are untouched.
    await expect(page.locator('#about [data-hero-link]')).toHaveCount(api.getLinks('game', 'hero').length);
  });

  test('a page without a main resume shows the button only on the tab that has its own; an empty label reads "Resume"', async ({ page }) => {
    const softdev = api.getTrack('softdev');
    expect(softdev.resumeUrl).toBe('');
    const root = await openFixture(page, { track: 'softdev', path: '/softdev' });
    await expect(root).toHaveAttribute('data-tab', 'webapps');
    await expectResume(page, { url: 'https://example.com/resume/web.pdf', label: 'Resume' });

    for (const tabId of ['unity', 'all', 'unreal']) {
      await chooseTab(page, root, tabId);
      await expect(resumeButton(page), tabId).toHaveCount(0);
      // The hero links stay.
      await expect(page.locator('#about [data-hero-link]')).toHaveCount(api.getLinks('softdev', 'hero').length);
    }
    await chooseTab(page, root, 'webapps');
    await expectResume(page, { url: 'https://example.com/resume/web.pdf', label: 'Resume' });
  });

  test('opened straight on a tab of that page that has no resume: no button', async ({ page }) => {
    const root = await openFixture(page, { track: 'softdev', path: '/softdev/all' });
    await expect(root).toHaveAttribute('data-tab', 'all');
    await expect(resumeButton(page)).toHaveCount(0);
  });
});

test.describe('nav logo', () => {
  const NAME = `${site.name} — top of page`;

  function brand(page: Page): Locator {
    return page.getByRole('banner').locator('a[data-nav-brand]');
  }

  for (const theme of THEMES) {
    test(`shows the picture, whole, at 48px with a transparent background — ${theme}`, async ({ page }) => {
      await openFixture(page, { logo: 'ok', theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const link = brand(page);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('data-nav-brand', 'logo');
      await expect(link).toHaveAttribute('href', '#top');
      // Named once, by the link; the monogram text is not there as well.
      await expect(link).toHaveAccessibleName(NAME);
      await expect(page.getByRole('banner').getByRole('link', { name: NAME, exact: true })).toHaveCount(1);
      expect((await link.innerText()).trim()).toBe('');

      const image = link.locator('img[data-nav-logo]');
      await expect(image).toHaveCount(1);
      // The content path with the base in front (assetUrl).
      await expect(image).toHaveAttribute('src', withBase(LOGO_OK));
      await expect(image).toHaveAttribute('alt', site.logoAlt);
      await expect(image).toHaveAttribute('width', /^\d+$/);
      await expect(image).toHaveAttribute('height', /^\d+$/);
      await expect(image).toHaveAttribute('loading', 'eager');
      await expect(image).toHaveAttribute('decoding', 'async');
      await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

      // Transparent: nothing is drawn behind the picture, in either theme.
      const frame = link.locator('[data-nav-logo-disc]');
      await expect(frame).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(frame).toHaveCSS('border-top-width', '0px');
      await expect(link).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

      const boxes = await link.evaluate((anchor) => {
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const img = anchor.querySelector('img')!;
        return { link: box(anchor), image: box(img), fit: getComputedStyle(img).objectFit };
      });
      // 48px: 20% more than the 40px it was.
      expect(boxes.image.width).toBeCloseTo(48, 1);
      expect(boxes.image.height).toBeCloseTo(48, 1);
      expect(boxes.link.width).toBeGreaterThanOrEqual(44);
      expect(boxes.link.height).toBeGreaterThanOrEqual(44);
      // The picture fills its link and is shown whole.
      expect(boxes.fit).toBe('contain');
      expect((boxes.image.left + boxes.image.right) / 2).toBeCloseTo((boxes.link.left + boxes.link.right) / 2, 1);
      expect((boxes.image.top + boxes.image.bottom) / 2).toBeCloseTo((boxes.link.top + boxes.link.bottom) / 2, 1);

      // Keyboard focus: a visible ring.
      await link.focus();
      await page.keyboard.press('Shift');
      const ring = await focusRingOf(link);
      expect(ring.focused).toBe(true);
      expect(ring.style).toBe('solid');
      expect(ring.width).toBeGreaterThanOrEqual(2);
    });
  }

  test('without a logo the monogram text is shown, as before', async ({ page }) => {
    await openFixture(page, { logo: 'none' });
    const link = brand(page);
    await expect(link).toHaveAttribute('data-nav-brand', 'monogram');
    await expect(link).toHaveText(site.monogram);
    await expect(link).toHaveAccessibleName(NAME);
    await expect(link).toHaveAttribute('href', '#top');
    await expect(link.locator('img')).toHaveCount(0);
    await expect(link.locator('[data-nav-logo-disc]')).toHaveCount(0);
    const box = await link.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(link).toHaveCSS('color', hexToRgb(await cssVar(page.locator('html'), '--color-ink')));
  });

  test('a logo that does not load is replaced by the monogram text', async ({ page }) => {
    await openFixture(page, { logo: 'broken' });
    const link = brand(page);
    await expect(link).toHaveAttribute('data-nav-brand', 'monogram');
    await expect(link).toHaveText(site.monogram);
    await expect(link).toHaveAccessibleName(NAME);
    await expect(link.locator('img')).toHaveCount(0);
    await expect(link.locator('[data-nav-logo-disc]')).toHaveCount(0);
  });

  test('fits beside the menu button and the theme toggle at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openFixture(page, { logo: 'ok' });
    const banner = page.getByRole('banner');
    const [logoBox, menuBox, toggleBox] = await Promise.all([brand(page).boundingBox(), banner.locator('[data-menu-button]').boundingBox(), banner.getByRole('switch').boundingBox()]);
    expect(logoBox!.x).toBeGreaterThanOrEqual(0);
    expect(logoBox!.x + logoBox!.width).toBeLessThan(menuBox!.x);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(toggleBox!.x);
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(320);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(320);
    expect(widths.body).toBeLessThanOrEqual(320);
  });

  for (const theme of THEMES) {
    test(`the fixture page has no axe violations — ${theme}`, async ({ page }) => {
      await openFixture(page, { logo: 'ok', theme, path: '/gamedev/unreal' });
      await expect(page.locator('#about').getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1');
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((violation) => ({ id: violation.id, help: violation.help, nodes: violation.nodes.slice(0, 5).map((node) => node.target) }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
    });
  }
});
