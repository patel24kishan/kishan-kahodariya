import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { withBase } from './support/content';
import {
  HERO_BADGE,
  HERO_POSTER,
  HERO_STATS,
  HERO_VIDEO,
  HERO_WORK_LABEL,
  type HeroCase,
} from './support/hero-fixture.content';
import { blockOtherOrigins, cssVar, hexToRgb, presetTheme, scrollTo, THEMES, type Theme } from './support/page';

/**
 * The motion hero on tests/pages/support/hero-fixture.html (the real SiteNav and Hero over
 * hand-made content): the background video and its pause button, what is left without a video,
 * the badge, the stats and the "See my work" button, reduced motion and data saving, and that
 * the text stays readable over the brightest possible picture.
 *
 * The video is a 4 KB .webm beside the fixture, served by the dev server: no test here (or
 * anywhere) needs the real video address to answer.
 */
const FIXTURE_PATH = 'tests/pages/support/hero-fixture.html';

interface FixtureOptions {
  track?: 'game' | 'softdev';
  hero?: HeroCase;
  theme?: Theme;
  /** Sections under the hero, so the page can scroll. */
  filler?: boolean;
}

async function openFixture(page: Page, options: FixtureOptions = {}): Promise<Locator> {
  if (options.theme) await presetTheme(page, options.theme);
  await blockOtherOrigins(page);
  const query = new URLSearchParams({ track: options.track ?? 'game', hero: options.hero ?? 'full' });
  if (options.filler) query.set('filler', '1');
  await page.goto(`${FIXTURE_PATH}?${query.toString()}`);
  await page.locator('[data-testid="hero-fixture"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.locator('#about');
}

function video(page: Page): Locator {
  return page.locator('#about video[data-hero-video]');
}

function pauseButton(page: Page): Locator {
  return page.locator('#about [data-hero-pause]');
}

interface Playback {
  paused: boolean;
  time: number;
}

function playback(page: Page): Promise<Playback> {
  return video(page).evaluate((element) => {
    const media = element as HTMLVideoElement;
    return { paused: media.paused, time: media.currentTime };
  });
}

async function expectPlaying(page: Page): Promise<void> {
  await expect.poll(async () => (await playback(page)).paused, { message: 'the video is playing' }).toBe(false);
  const before = (await playback(page)).time;
  await expect.poll(async () => (await playback(page)).time, { message: 'the video moves on' }).not.toBe(before);
}

async function expectStill(page: Page): Promise<void> {
  await expect.poll(async () => (await playback(page)).paused, { message: 'the video is paused' }).toBe(true);
  const before = (await playback(page)).time;
  await page.waitForTimeout(400);
  expect((await playback(page)).time, 'the video does not move').toBe(before);
}

/** The last block of the reveal has arrived. */
async function revealDone(page: Page): Promise<void> {
  await expect(page.locator('#about h1')).toHaveCSS('opacity', '1');
  const last = page.locator('#about [data-hero-stats], #about [data-hero-actions], #about [data-hero-summary]').last();
  await expect(last).toHaveCSS('opacity', '1');
}

test.describe('background video', () => {
  test('is a decorative, muted, looping, inline video from the content path, and it plays by itself', async ({ page }) => {
    const hero = await openFixture(page);
    const element = video(page);
    await expect(element).toHaveCount(1);
    await expect(element).toHaveAttribute('src', withBase(HERO_VIDEO));
    await expect(element).toHaveAttribute('loop', '');
    await expect(element).toHaveAttribute('playsinline', '');
    await expect(element).toHaveAttribute('tabindex', '-1');
    await expect(element).not.toHaveAttribute('controls', /.*/);
    const facts = await element.evaluate((node) => {
      const media = node as HTMLVideoElement;
      return { muted: media.muted, autoplay: media.autoplay, hidden: media.closest('[aria-hidden="true"]') !== null, fit: getComputedStyle(media).objectFit };
    });
    expect(facts).toEqual({ muted: true, autoplay: true, hidden: true, fit: 'cover' });
    await expectPlaying(page);

    // It covers the whole hero, behind the text.
    const [heroBox, videoBox] = await Promise.all([hero.boundingBox(), element.boundingBox()]);
    expect(videoBox!.x).toBeCloseTo(heroBox!.x, 0);
    expect(videoBox!.y).toBeCloseTo(heroBox!.y, 0);
    expect(videoBox!.width).toBeCloseTo(heroBox!.width, 0);
    expect(videoBox!.height).toBeCloseTo(heroBox!.height, 0);
    // The text is on top of it: the name is what a click at its centre hits.
    const onTop = await hero.locator('h1').evaluate((heading) => {
      const rect = heading.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + 20, rect.top + rect.height / 2);
      return hit !== null && heading.contains(hit);
    });
    expect(onTop).toBe(true);
  });

  for (const [track, phone] of [['game', '60% 50%'], ['softdev', '76% 50%']] as const) {
    test(`the ${track} video is slid on a phone so its character is in the crop, and centred on a larger screen`, async ({ page, isMobile }) => {
      await openFixture(page, { track });
      const position = await video(page).evaluate((element) => getComputedStyle(element).objectPosition);
      expect(position).toBe(isMobile ? phone : '50% 50%');
      // Still a cover crop that fills the hero, whatever the position.
      await expect(video(page)).toHaveCSS('object-fit', 'cover');
    });
  }

  test('the pause button is a 44px toggle at the bottom right; it pauses and plays, by pointer and by keyboard', async ({ page }) => {
    const hero = await openFixture(page);
    const button = pauseButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveRole('button');
    await expect(button).toHaveAccessibleName('Pause background video');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button.locator('svg[data-icon="pause"]')).toHaveCount(1);
    // Not inside the hidden, decorative layer.
    expect(await button.evaluate((node) => node.closest('[aria-hidden="true"]') === null)).toBe(true);

    const [heroBox, box] = await Promise.all([hero.boundingBox(), button.boundingBox()]);
    expect(box!.width).toBeCloseTo(44, 0);
    expect(box!.height).toBeCloseTo(44, 0);
    const fromRight = heroBox!.x + heroBox!.width - (box!.x + box!.width);
    const fromBottom = heroBox!.y + heroBox!.height - (box!.y + box!.height);
    expect(fromRight).toBeGreaterThanOrEqual(12);
    expect(fromRight).toBeLessThanOrEqual(64);
    expect(fromBottom).toBeGreaterThanOrEqual(12);
    expect(fromBottom).toBeLessThanOrEqual(32);
    // On screen without scrolling when the hero is one viewport tall.
    await expect(button).toBeInViewport();

    await expectPlaying(page);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button.locator('svg[data-icon="play"]')).toHaveCount(1);
    await expect(button).toHaveAccessibleName('Pause background video');
    await expectStill(page);

    await button.focus();
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expectPlaying(page);
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectStill(page);
  });

  test('pauses while the hero is off screen and resumes when it is back — unless the visitor paused it', async ({ page }) => {
    await openFixture(page, { filler: true });
    await expectPlaying(page);
    const height = await page.evaluate(() => document.querySelector('#about')!.getBoundingClientRect().height);
    await scrollTo(page, Math.round(height + 300));
    await expectStill(page);
    // The button still says what the visitor chose: they did not pause it.
    await expect(pauseButton(page)).toHaveAttribute('aria-pressed', 'false');
    await scrollTo(page, 0);
    await expectPlaying(page);

    await pauseButton(page).click();
    await expectStill(page);
    await scrollTo(page, Math.round(height + 300));
    await scrollTo(page, 0);
    await page.waitForTimeout(300);
    await expectStill(page);
    await expect(pauseButton(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('pauses while the tab is hidden and resumes when it is shown again', async ({ page }) => {
    await openFixture(page);
    await expectPlaying(page);
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await setVisibility('hidden');
    await expectStill(page);
    await setVisibility('visible');
    await expectPlaying(page);
  });

  test('with data saving on it does not start by itself; the button plays it', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true }) });
    });
    await openFixture(page);
    const button = pauseButton(page);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button.locator('svg[data-icon="play"]')).toHaveCount(1);
    await expectStill(page);
    expect((await playback(page)).time).toBe(0);
    expect(await video(page).evaluate((node) => (node as HTMLVideoElement).autoplay)).toBe(false);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expectPlaying(page);
  });

  test('nothing of the video is fetched ahead of playing it (preload="none")', async ({ page }) => {
    await openFixture(page);
    await expect(video(page)).toHaveAttribute('preload', 'none');
  });
});

test.describe('background video under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('does not start by itself, everything is visible and still, and the button plays it', async ({ page }) => {
    await openFixture(page);
    await expect(video(page)).toHaveCount(1);
    const button = pauseButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectStill(page);
    expect((await playback(page)).time).toBe(0);

    // Every block of the hero is there at once: no animation, full opacity, not moved.
    const blocks = await page.locator('#about [data-hero-tagline], #about h1, #about [data-hero-summary], #about [data-hero-actions], #about [data-hero-stats]').evaluateAll((list) =>
      list.map((block) => {
        const style = getComputedStyle(block);
        return { animation: style.animationName, opacity: style.opacity, transform: style.transform };
      }),
    );
    expect(blocks).toHaveLength(5);
    for (const block of blocks) expect(block).toEqual({ animation: 'none', opacity: '1', transform: 'none' });

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expectPlaying(page);
  });
});

test.describe('without a video', () => {
  test('no video in the content: no <video>, no pause button, the gradient shows', async ({ page }) => {
    const hero = await openFixture(page, { hero: 'plain' });
    await expect(video(page)).toHaveCount(0);
    await expect(page.locator('#about video')).toHaveCount(0);
    await expect(pauseButton(page)).toHaveCount(0);
    await expect(page.locator('#about [data-hero-poster]')).toHaveCount(0);
    expect(await hero.evaluate((section) => getComputedStyle(section).backgroundImage)).toContain('radial-gradient');
    await expect(hero.locator('h1')).toBeVisible();
  });

  test('a poster without a video is shown as the picture behind the text', async ({ page }) => {
    await openFixture(page, { hero: 'poster' });
    await expect(video(page)).toHaveCount(0);
    await expect(pauseButton(page)).toHaveCount(0);
    const poster = page.locator('#about img[data-hero-poster]');
    await expect(poster).toHaveCount(1);
    await expect(poster).toHaveAttribute('src', withBase(HERO_POSTER));
    await expect(poster).toHaveAttribute('alt', '');
    await expect(poster).toHaveAttribute('width', /^\d+$/);
    await expect(poster).toHaveAttribute('height', /^\d+$/);
    await expect.poll(() => poster.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await poster.evaluate((image) => image.closest('[aria-hidden="true"]') !== null)).toBe(true);
    await expect(poster).toHaveCSS('object-fit', 'cover');
  });

  test('a video with a poster carries the poster', async ({ page }) => {
    await openFixture(page, { hero: 'both' });
    await expect(video(page)).toHaveAttribute('poster', withBase(HERO_POSTER));
    await expect(pauseButton(page)).toBeVisible();
  });

  test('a video that cannot be loaded leaves the gradient, with no dead pause button', async ({ page }) => {
    const hero = await openFixture(page, { hero: 'broken' });
    await expect(video(page)).toHaveCount(0);
    await expect(pauseButton(page)).toHaveCount(0);
    expect(await hero.evaluate((section) => getComputedStyle(section).backgroundImage)).toContain('radial-gradient');
    await revealDone(page);
    await expect(hero.locator('h1')).toBeVisible();
  });
});

test.describe('badge, stats and the work button', () => {
  test('nothing of them is rendered when the content has none', async ({ page }) => {
    await openFixture(page, { hero: 'plain' });
    await expect(page.locator('#about [data-hero-badge]')).toHaveCount(0);
    await expect(page.locator('#about [data-hero-stats]')).toHaveCount(0);
    await expect(page.locator('#about [data-hero-work]')).toHaveCount(0);
    await expect(page.locator('#about svg[data-icon="award"]')).toHaveCount(0);
    // The header has no contact button either (no label, no address).
    await expect(page.locator('[data-nav-contact]')).toHaveCount(0);
  });

  test('the stats are the resolved list, in order; a stat without a value is dropped', async ({ page }) => {
    await openFixture(page);
    const items = page.locator('#about [data-hero-stats] > li');
    await expect(items).toHaveCount(HERO_STATS.length);
    for (const [index, stat] of HERO_STATS.entries()) {
      await expect(items.nth(index)).toHaveText(`${stat.value} ${stat.label}`);
    }
    // The number is drawn above its label.
    const boxes = await items.first().locator('span').evaluateAll((spans) => spans.map((span) => span.getBoundingClientRect().top));
    expect(boxes[0]!).toBeLessThan(boxes[1]!);
    await expect(page.locator('#about')).not.toContainText('Dropped');
  });

  test('the badge shows both lines with the award icon: in the button row from 640px, under the stats below', async ({ page, isMobile }) => {
    await openFixture(page);
    await revealDone(page);
    const row = page.locator('#about [data-hero-badge="row"]');
    const below = page.locator('#about [data-hero-badge="below"]');
    const shown = isMobile ? below : row;
    const other = isMobile ? row : below;
    await expect(shown).toBeVisible();
    await expect(other).toBeHidden();
    await expect(shown.locator('svg[data-icon="award"]')).toHaveCount(1);
    await expect(shown).toContainText(HERO_BADGE[0]);
    await expect(shown).toContainText(HERO_BADGE[1]);
    // Only one of the two is ever exposed.
    await expect(page.locator('#about').getByText(HERO_BADGE[0]).filter({ visible: true })).toHaveCount(1);
    if (isMobile) {
      const [statsBox, badgeBox] = await Promise.all([page.locator('#about [data-hero-stats]').boundingBox(), shown.boundingBox()]);
      expect(badgeBox!.y).toBeGreaterThanOrEqual(statsBox!.y + statsBox!.height);
    } else {
      expect(await shown.evaluate((badge) => badge.parentElement?.hasAttribute('data-hero-actions'))).toBe(true);
      expect(await shown.locator('br').count()).toBe(1);
    }
  });

  test('a badge with one line shows that line only', async ({ page, isMobile }) => {
    await openFixture(page, { hero: 'oneline' });
    const shown = page.locator(`#about [data-hero-badge="${isMobile ? 'below' : 'row'}"]`);
    await expect(shown).toHaveText(HERO_BADGE[0]);
    await expect(shown.locator('br')).toHaveCount(0);
  });

  test('"See my work" is the first button and goes to the projects', async ({ page }) => {
    await openFixture(page, { filler: true });
    const work = page.locator('#about [data-hero-work]');
    await expect(work).toHaveText(HERO_WORK_LABEL);
    await expect(work).toHaveAttribute('href', '#projects');
    await expect(work).not.toHaveAttribute('target', /.*/);
    await expect(work.locator('svg[data-icon="external"]')).toHaveCount(1);
    const order = await page.locator('#about [data-hero-actions] > *').evaluateAll((children) => children.map((child) => Object.keys((child as HTMLElement).dataset)[0]));
    expect(order.slice(0, 2)).toEqual(['heroWork', 'heroResume']);
    const box = await work.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await revealDone(page);
    await work.click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#projects');
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('#projects')!.getBoundingClientRect().top)), { timeout: 10_000 }).toBeLessThanOrEqual(120);
  });
});

/**
 * The text must pass WCAG AA whatever the video shows. The worst case is a white frame, so the
 * check is made against white seen through the scrim: for every piece of text, the scrim's
 * weakest point under it (it fades to the right, so the text's right edge) gives the darkest
 * guaranteed background, and the text colour is composited on that.
 */
test.describe('text over the video', () => {
  for (const theme of THEMES) {
    test(`passes AA against a white frame, and is the same in both themes — ${theme}`, async ({ page }) => {
      await openFixture(page, { theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await revealDone(page);
      await page.waitForTimeout(900);

      const report = await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>('#about')!;
        const heroRect = hero.getBoundingClientRect();
        const scrim = hero.querySelector<HTMLElement>('[data-hero-scrim]')!;
        const gradient = getComputedStyle(scrim).backgroundImage;
        const stops = [...gradient.matchAll(/rgba?\(0, 0, 0(?:, ([\d.]+))?\) ([\d.]+)(px|%)/g)].map((match) => ({
          alpha: match[1] === undefined ? 1 : Number(match[1]),
          at: match[3] === '%' ? (Number(match[2]) / 100) * heroRect.width : Number(match[2]),
        }));
        if (!gradient.startsWith('linear-gradient(90deg') || stops.length < 2) throw new Error(`The scrim is not the left-to-right gradient this test reads: ${gradient}`);
        const alphaAt = (x: number): number => {
          if (x <= stops[0]!.at) return stops[0]!.alpha;
          for (let index = 1; index < stops.length; index += 1) {
            const from = stops[index - 1]!;
            const to = stops[index]!;
            if (x <= to.at) return from.alpha + ((to.alpha - from.alpha) * (x - from.at)) / Math.max(1, to.at - from.at);
          }
          return stops[stops.length - 1]!.alpha;
        };
        const channel = (value: number) => {
          const unit = value / 255;
          return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);

        const out: { text: string; ratio: number; needed: number; colour: string }[] = [];
        const walker = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node.textContent ?? '').trim();
          const element = node.parentElement;
          if (text === '' || !element) continue;
          const style = getComputedStyle(element);
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          // Not drawn (the other badge), or screen-reader-only text.
          if (rect.width < 2 || rect.height < 2 || element.getClientRects().length === 0) continue;
          // Text on its own solid fill (the accent button) does not depend on the video.
          let filled = false;
          for (let up: HTMLElement | null = element; up && up !== hero; up = up.parentElement) {
            const fill = getComputedStyle(up).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
            if (fill.length === 3 || (fill.length === 4 && fill[3] === 1)) filled = true;
          }
          if (filled) continue;
          const parts = style.color.match(/[\d.]+/g)!.map(Number);
          const textAlpha = parts.length === 4 ? parts[3]! : 1;
          const right = Math.min(rect.right, heroRect.right) - heroRect.left;
          const backdrop = 255 * (1 - alphaAt(right));
          const drawn = parts.slice(0, 3).map((value) => value * textAlpha + backdrop * (1 - textAlpha));
          const light = luminance(drawn);
          const dark = luminance([backdrop, backdrop, backdrop]);
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
          out.push({ text: text.slice(0, 30), ratio: Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100, needed: large ? 3 : 4.5, colour: style.color });
        }
        return out;
      });

      expect(report.length).toBeGreaterThanOrEqual(8);
      const failing = report.filter((entry) => entry.ratio < entry.needed);
      expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
      // Always dark: the text is white (or a see-through white) whatever the theme, except the
      // "See my work" label, which is the page's accent (the outlined button).
      const accent = hexToRgb(await cssVar(page.locator('[data-testid="hero-fixture"]'), '--color-accent'));
      expect(report.filter((entry) => entry.colour === accent).length, 'only the outlined button label is accent-coloured').toBeLessThanOrEqual(1);
      for (const entry of report.filter((entry) => entry.colour !== accent)) expect(entry.colour, entry.text).toMatch(/^rgba?\(255, 255, 255/);
    });

    test(`the hero with the video playing has no axe violations — ${theme}`, async ({ page }) => {
      await openFixture(page, { theme });
      await revealDone(page);
      await page.waitForTimeout(900);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((violation) => ({ id: violation.id, help: violation.help, nodes: violation.nodes.slice(0, 5).map((node) => node.target) }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
    });
  }
});
