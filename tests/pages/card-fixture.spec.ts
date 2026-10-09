import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { blockOtherOrigins, card, cssVar, hexToRgb, mediaButton, presetTheme, THEMES, type Theme } from './support/page';

/**
 * Card cases the real content cannot produce, on tests/pages/support/card-fixture.html (served
 * by the dev server, never built): the slideshow of several screenshots inside a real card and
 * what it asks the viewer to open, a broken screenshot among them, Play and View Code links on
 * different hosts, a project without screenshots.
 */
const FIXTURE_PATH = 'tests/pages/support/card-fixture.html';
const INTERVAL = 3000;
type Track = 'game' | 'softdev';
const TRACKS: readonly Track[] = ['game', 'softdev'];

async function openFixture(page: Page, options: { track?: Track; theme?: Theme; freezeTime?: boolean } = {}): Promise<Locator> {
  if (options.theme) await presetTheme(page, options.theme);
  if (options.freezeTime) {
    const start = new Date('2026-10-07T12:00:00Z');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(start);
  }
  await blockOtherOrigins(page);
  await page.goto(`${FIXTURE_PATH}?track=${options.track ?? 'game'}`);
  const root = page.locator('[data-testid="card-fixture"]');
  await root.waitFor();
  await page.evaluate(() => document.fonts.ready);
  return root;
}

test.describe('link buttons', () => {
  test('Play links are accent buttons like Gameplay; every other kind stays outline', async ({ page }) => {
    await openFixture(page);
    const slider = card(page, 'slider');
    await expect(slider.locator('[data-project-link="play"]')).toHaveAttribute('data-variant', 'accent');
    await expect(slider.locator('[data-project-link="code"]')).toHaveAttribute('data-variant', 'outline');
    await expect(slider.locator('[data-project-gameplay]')).toHaveAttribute('data-variant', 'accent');
    // Two accent buttons on one card is accepted.
    await expect(slider.locator('[data-variant="accent"]')).toHaveCount(2);

    const single = card(page, 'single');
    for (const kind of ['code', 'demo', 'video', 'store']) {
      await expect(single.locator(`[data-project-link="${kind}"]`), kind).toHaveAttribute('data-variant', 'outline');
    }
    await expect(single.locator('[data-project-link="play"]')).toHaveAttribute('data-variant', 'accent');
    await expect(single.locator('[data-project-link="play"]')).toHaveCount(1); // the one without a URL is not rendered
  });

  for (const theme of THEMES) {
    for (const track of TRACKS) {
      test(`a Play link is filled with the accent, dark text — ${theme} / ${track}`, async ({ page }) => {
        const root = await openFixture(page, { theme, track });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const play = card(page, 'slider').locator('[data-project-link="play"]');
        const accent = await cssVar(root, '--color-accent');
        expect(accent).toBe(track === 'game' ? '#faff69' : '#7cb2ff');
        await expect(play).toHaveCSS('background-color', hexToRgb(accent));
        await expect(play).toHaveCSS('color', hexToRgb(await cssVar(root, '--color-on-accent')));
        // Same look as the Gameplay button beside it.
        const gameplay = card(page, 'slider').locator('[data-project-gameplay]');
        await expect(gameplay).toHaveCSS('background-color', hexToRgb(accent));
        await expect(play).toHaveCSS('border-top-color', await gameplay.evaluate((element) => getComputedStyle(element).borderTopColor));
      });
    }
  }

  test('every View Code link shows the one code icon, whatever its host', async ({ page }) => {
    await openFixture(page);
    await expect(card(page, 'slider').locator('[data-project-link="code"] svg[data-icon="gitlab"]')).toHaveCount(1); // github.com
    await expect(card(page, 'single').locator('[data-project-link="code"] svg[data-icon="gitlab"]')).toHaveCount(1); // gitlab.com
    await expect(page.locator('[data-project-link="code"] svg[data-icon="github"]')).toHaveCount(0);
  });

  test('every Play link has the one play icon whatever the host; the other kinds keep their host-based icons', async ({ page }) => {
    await openFixture(page);
    await expect(card(page, 'slider').locator('[data-project-link="play"] svg[data-icon="play"]')).toHaveCount(1);
    const single = card(page, 'single');
    await expect(single.locator('[data-project-link="play"] svg[data-icon="play"]')).toHaveCount(1);
    await expect(single.locator('[data-project-link="demo"] svg[data-icon="external"]')).toHaveCount(1);
    await expect(single.locator('[data-project-link="video"] svg[data-icon="youtube"]')).toHaveCount(1);
    await expect(single.locator('[data-project-link="store"] svg[data-icon="external"]')).toHaveCount(1);
  });
});

test.describe('card media with several screenshots', () => {
  test('slides every 3 seconds and opens the viewer at the screenshot on show', async ({ page }) => {
    const root = await openFixture(page, { freezeTime: true });
    const media = mediaButton(card(page, 'slider'));
    await media.scrollIntoViewIfNeeded();
    await expect(media).toHaveAttribute('data-media-current', '0');
    await expect(media).toHaveAttribute('data-media-count', '3');
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await expect(media.locator('[data-media-dot]')).toHaveCount(3);
    await expect(media).toHaveAccessibleName('Slider shot one View Gameplay & Screenshots');

    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
    await expect(media).toHaveAccessibleName('Slider shot two View Gameplay & Screenshots');
    await media.click();
    await expect(root).toHaveAttribute('data-fixture-open', 'slider');
    await expect(root).toHaveAttribute('data-fixture-item', '2');
    await expect(root).toHaveAttribute('data-fixture-opener', 'slider');
  });

  test('a broken screenshot is skipped in the card too', async ({ page }) => {
    await openFixture(page, { freezeTime: true });
    const media = mediaButton(card(page, 'slider-broken'));
    await media.scrollIntoViewIfNeeded();
    await expect(media.locator('[data-media-slide="1"]')).toHaveAttribute('data-media-slide-state', 'failed');
    await expect(media).toHaveAttribute('data-media-count', '2');
    await expect(media.locator('[data-media-dot]')).toHaveCount(2);
    await expect(media).not.toHaveAttribute('data-media-fallback', /./);
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '2');
  });

  test('hover pauses it and shows the overlay with the hover text', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch devices show a permanent badge');
    await openFixture(page, { freezeTime: true });
    const media = mediaButton(card(page, 'slider'));
    await media.scrollIntoViewIfNeeded();
    await media.hover();
    await expect(media.locator('[data-media-label]')).toHaveCSS('opacity', '1');
    await expect(media.locator('[data-media-label]')).toHaveText('View Gameplay & Screenshots');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '0');
  });

  test('a card with one screenshot and a card without stay as they were', async ({ page }) => {
    const root = await openFixture(page);
    const single = mediaButton(card(page, 'single'));
    await single.scrollIntoViewIfNeeded();
    await expect(single).not.toHaveAttribute('data-media-carousel', /.*/);
    await expect(single.locator('[data-media-dots]')).toHaveCount(0);
    await expect(single.locator('img')).toHaveCount(1);
    await expect(single.locator('img')).toHaveAttribute('alt', 'Single shot');
    await single.click();
    await expect(root).toHaveAttribute('data-fixture-open', 'single');
    await expect(root).toHaveAttribute('data-fixture-item', '1');

    const none = mediaButton(card(page, 'none'));
    await none.scrollIntoViewIfNeeded();
    await expect(none.locator('[data-media-placeholder]')).toBeVisible();
    await expect(none.locator('[data-media-dots]')).toHaveCount(0);
    await none.click();
    await expect(root).toHaveAttribute('data-fixture-open', 'none');
    await expect(root).toHaveAttribute('data-fixture-item', 'video');
  });
});

for (const theme of THEMES) {
  test(`the fixture has no axe violations — ${theme}`, async ({ page }) => {
    await openFixture(page, { theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).analyze();
    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.slice(0, 5).map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
    expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
