import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createContentApi } from '../../src/content/selectors';
import type { TrackId } from '../../src/content/types';
import { focusRingOf } from '../design/helpers';
import { withBase } from './support/content';
import {
  FIXTURE_CONTENT,
  LOGO_OK,
  MAIN_SUMMARY,
  SOFTDEV_UNITY_SUMMARY,
  UNITY_SUMMARY,
  UNREAL_SUMMARY,
  type LogoCase,
} from './support/hero-fixture.content';
import { blockOtherOrigins, cssVar, hexToRgb, presetTheme, tabsNav, THEMES, type Theme } from './support/page';

/**
 * Cases the real content cannot produce, on tests/pages/support/hero-fixture.html (served by
 * the dev server, never built): a resume of its own on one project tab, a row without an
 * address, a page without a main resume; a summary of its own on a tab (with and without a
 * resume), a page without a main summary; and a nav logo that is missing or does not load.
 * The fixture mounts the real SiteNav, Hero and tab links and is wired like the real page.
 * (The fixture's video, badge, stats and button variants are in hero-video.spec.ts.)
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
  // The outlined, square button of the motion hero.
  await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(button).toHaveCSS('border-top-width', '1px');
  await expect(button).toHaveCSS('border-radius', '0px');
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
    // The hero has no link buttons any more, whatever the content's hero links are.
    expect(api.getLinks('game', 'hero').length).toBeGreaterThan(0);
    await expect(page.locator('#about [data-hero-link]')).toHaveCount(0);
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
      // With no resume, no work label and no badge there is no button row at all.
      await expect(page.locator('#about [data-hero-actions]')).toHaveCount(0);
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

test.describe('summary per project tab', () => {
  const game = api.getTrack('game');
  /** What each tab of the hand-made game page must show (see hero-fixture.content.ts). */
  const EXPECTED: Record<string, { text: string; why: string }> = {
    unreal: { text: UNREAL_SUMMARY, why: 'its own summary (the row has a resume too)' },
    unity: { text: UNITY_SUMMARY, why: 'its own summary (the row has no resume address)' },
    webapps: { text: MAIN_SUMMARY, why: 'no row: the main summary' },
    all: { text: MAIN_SUMMARY, why: 'a row whose summary is only spaces: the main summary' },
  };

  function summaryBlock(page: Page): Locator {
    return page.locator('#about [data-hero-summary]');
  }

  /** One <p> per paragraph (blank line between them); a line break inside one stays a <br>. */
  async function expectSummary(page: Page, text: string): Promise<void> {
    const block = summaryBlock(page);
    if (text.trim() === '') {
      await expect(block).toHaveCount(0);
      return;
    }
    await expect(block).toHaveCount(1);
    const paragraphs = text.split(/\n\s*\n/);
    // innerText: a <br> reads as a line break (which the comparison treats as one space).
    await expect(block.locator('p')).toHaveText(paragraphs.map((paragraph) => paragraph.replace(/\n/g, ' ')), { useInnerText: true });
    await expect(block.locator('br')).toHaveCount(paragraphs.reduce((count, paragraph) => count + paragraph.split('\n').length - 1, 0));
    // In its place: after the name (which follows the tagline), before the buttons when there are any.
    const around = await block.evaluate((element) => ({
      before: element.previousElementSibling?.tagName ?? '',
      beforeText: element.previousElementSibling?.textContent ?? '',
      first: element.parentElement?.firstElementChild?.textContent ?? '',
      nextIsButtons: element.nextElementSibling === null ? null : element.nextElementSibling.hasAttribute('data-hero-actions'),
      parentIsHeroText: element.parentElement?.querySelector(':scope > h1') !== null,
    }));
    const hasButtons = (await page.locator('#about [data-hero-resume]').count()) > 0;
    expect(around).toEqual({ before: 'H1', beforeText: site.name, first: 'Fixture Headline', nextIsButtons: hasButtons ? true : null, parentIsHeroText: true });
  }

  test('the hand-made content says what this test assumes', () => {
    expect(game.summary).toBe(MAIN_SUMMARY);
    for (const tab of tabs) expect(api.getSummary('game', tab.id), tab.id).toBe(EXPECTED[tab.id]!.text);
    // The cases differ in which half of a row is set.
    expect(api.getResume('game', 'unity').url, 'unity: a summary without a resume of its own').toBe(game.resumeUrl);
    expect(api.getResume('game', 'all').url, 'all: a resume without a summary of its own').not.toBe(game.resumeUrl);
    expect(UNREAL_SUMMARY.length).toBeGreaterThan(MAIN_SUMMARY.length * 3);
  });

  for (const tab of tabs) {
    test(`opened straight on /gamedev/${tab.id}: ${EXPECTED[tab.id]!.why}`, async ({ page }) => {
      const root = await openFixture(page, { path: `/gamedev/${tab.id}` });
      await expect(root).toHaveAttribute('data-tab', tab.id);
      await expectSummary(page, EXPECTED[tab.id]!.text);
    });
  }

  test('the page without a tab in its address shows the summary of its first tab', async ({ page }) => {
    const root = await openFixture(page, { path: '/gamedev' });
    await expect(root).toHaveAttribute('data-tab', game.defaultTab);
    await expectSummary(page, EXPECTED[game.defaultTab]!.text);
  });

  test('choosing a tab swaps the summary in place, each way, with the resume of the same tab', async ({ page }) => {
    const root = await openFixture(page, { path: '/gamedev' });
    await expectSummary(page, UNITY_SUMMARY);
    // Mark the block: a tab change must update this very element, not replace it.
    await summaryBlock(page).evaluate((block) => block.setAttribute('data-test-mark', 'same-element'));

    for (const tabId of ['unreal', 'webapps', 'all', 'unity', 'unreal']) {
      await chooseTab(page, root, tabId);
      await expectSummary(page, EXPECTED[tabId]!.text);
      await expect(summaryBlock(page), `after choosing ${tabId}`).toHaveAttribute('data-test-mark', 'same-element');
      // The resume follows the same tab, by its own rule.
      await expectResume(page, api.getResume('game', tabId));
    }
    await expect(page.locator('#about [data-hero-link]')).toHaveCount(0);
  });

  test('a page without a main summary shows the block only on the tab that has its own', async ({ page }) => {
    const softdev = api.getTrack('softdev');
    expect(softdev.summary).toBe('');
    const root = await openFixture(page, { track: 'softdev', path: '/softdev' });
    await expect(root).toHaveAttribute('data-tab', 'webapps');
    await expectSummary(page, '');

    await chooseTab(page, root, 'unity');
    await expectSummary(page, SOFTDEV_UNITY_SUMMARY);
    for (const tabId of ['all', 'unreal', 'webapps']) {
      await chooseTab(page, root, tabId);
      await expectSummary(page, '');
      // The rest of the hero stays.
      await expect(page.locator('#about h1')).toHaveText(site.name);
      await expect(page.locator('#about [data-hero-tagline]')).toHaveText('Fixture Headline');
    }
  });

  test('opened straight on the tab of that page that has a summary: it is there', async ({ page }) => {
    const root = await openFixture(page, { track: 'softdev', path: '/softdev/unity' });
    await expect(root).toHaveAttribute('data-tab', 'unity');
    await expectSummary(page, SOFTDEV_UNITY_SUMMARY);
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
    // Over the hero the bar's text is white (the dark theme's ink), in both themes.
    await expect(link).toHaveCSS('color', hexToRgb(await cssVar(page.locator('html'), '--color-ink')));
    await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
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

  test('fits beside the menu button at 320px, where the bar holds nothing else', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openFixture(page, { logo: 'ok' });
    const banner = page.getByRole('banner');
    const [logoBox, menuBox] = await Promise.all([brand(page).boundingBox(), banner.locator('[data-menu-button]').boundingBox()]);
    expect(logoBox!.x).toBeGreaterThanOrEqual(0);
    expect(logoBox!.x + logoBox!.width).toBeLessThan(menuBox!.x);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(320);
    // The theme toggle is in the menu at this width, not in the bar.
    await expect(banner.getByRole('switch')).toHaveCount(0);
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
