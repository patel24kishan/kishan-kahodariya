import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { focusRingOf } from '../design/helpers';
import { content, hasParseableVideo, routeOf, TRACK_IDS } from './support/content';
import { openRoute, THEMES, viewer } from './support/page';

/** axe on both pages in both themes (viewer closed and open), reduced motion, touch targets. */

async function expectNoAxeViolations(page: Page, options: { excludeIframe?: boolean } = {}): Promise<void> {
  // Let the hero reveal finish: axe reads computed colours, and a block at opacity 0.3 mid-fade
  // would be measured as such.
  await expect(page.locator('#about').getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1');
  await page.waitForTimeout(400);
  let builder = new AxeBuilder({ page });
  if (options.excludeIframe) builder = builder.exclude('iframe');
  const results = await builder.analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => ({ target: node.target, summary: node.failureSummary })),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);
  const projects = content.getProjects(trackId, 'all');
  const withShot = projects.find((project) => project.screenshots.length > 0);
  const withVideo = projects.find(hasParseableVideo);

  for (const theme of THEMES) {
    test(`${track.route} page has no axe violations — ${theme}`, async ({ page }) => {
      await openRoute(page, routeOf(track, 'all'), { theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectNoAxeViolations(page);
    });

    test(`${track.route} page with the viewer open has no axe violations — ${theme}`, async ({ page }) => {
      test.skip(!withShot, 'no project with a screenshot');
      await openRoute(page, routeOf(track, 'all'), { theme, suffix: `?view=${withShot!.slug}&item=1` });
      await expect(viewer(page)).toBeVisible();
      await expectNoAxeViolations(page);
      if (withVideo) {
        await openRoute(page, routeOf(track, 'all'), { theme, suffix: `?view=${withVideo.slug}&item=video` });
        await expect(viewer(page).locator('iframe')).toHaveCount(1);
        await expectNoAxeViolations(page, { excludeIframe: true });
      }
    });
  }

  test(`${track.route}: every interactive element is at least 44px tall and wide`, async ({ page }) => {
    await openRoute(page, routeOf(track, 'all'));
    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>('a[href], button, [role="button"], [role="switch"]')) {
        const rect = element.getBoundingClientRect();
        // Not rendered, or visually hidden until focused (the skip link is clipped to 1 × 1).
        if (rect.width < 2 && rect.height < 2) continue;
        if (rect.width < 44 || rect.height < 44) {
          out.push(`${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40)}" ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        }
      }
      return out;
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test(`${track.route}: keyboard focus is visible on every interactive element`, async ({ page }) => {
    // About a hundred elements, several browser round trips each: 12 to 14 s on a quiet machine,
    // past the 30 s limit on a busy one (logs/issues/round2-chrome-01). Three times the budget.
    test.slow();
    await openRoute(page, routeOf(track, 'all'));
    const elements = await page.locator('a[href], button').all();
    const failures: string[] = [];
    for (const element of elements) {
      const visible = await element.evaluate((node) => node.getClientRects().length > 0 && !(node as HTMLButtonElement).disabled);
      if (!visible) continue;
      await element.evaluate((node) => (node as HTMLElement).focus());
      await page.keyboard.press('Shift');
      // The ring is on the element itself, or on the part it marks with data-focus-ring (the
      // theme toggle rings its 48 × 22 pill, not its 44px-tall hit area).
      const ring = await focusRingOf(element);
      if (!ring.focused) continue;
      if (ring.style === 'none' || ring.width < 2) {
        failures.push(`${await element.evaluate((node) => node.tagName)} "${((await element.getAttribute('aria-label')) ?? (await element.textContent()))?.trim().slice(0, 30)}"`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test(`${track.route}: the theme toggles draw their focus ring around the pill, in the nav and in the footer`, async ({ page }) => {
    await openRoute(page, routeOf(track, 'all'));
    const toggles = await page.getByRole('switch').all();
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) {
      await toggle.focus();
      await page.keyboard.press('Shift'); // keeps :focus-visible on
      const ring = await focusRingOf(toggle);
      expect(ring.focused).toBe(true);
      expect(ring.onChild, 'the ring is drawn on the pill').toBe(true);
      expect(ring.style).toBe('solid');
      expect(ring.width).toBeGreaterThanOrEqual(2);
      expect(ring.ownStyle, 'no second ring around the hit area').toBe('none');
    }
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  const track = content.getTrack('game');
  const withShot = content.getProjects('game', 'all').find((project) => project.screenshots.length > 0);

  test('the hero reveal, the viewer fade and the card overlay are off', async ({ page }) => {
    await openRoute(page, routeOf(track, 'all'));
    const name = page.locator('#about').getByRole('heading', { level: 1 });
    await expect(name).toHaveCSS('animation-name', 'none');
    await expect(name).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-media-label]').first()).toHaveCSS('transition-duration', '0s');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-slow').trim())).toBe('0ms');

    test.skip(!withShot, 'no project with a screenshot');
    await page.locator(`[data-project="${withShot!.slug}"] [data-media-overlay]`).scrollIntoViewIfNeeded();
    await page.locator(`[data-project="${withShot!.slug}"] [data-media-overlay]`).click();
    const dialog = viewer(page);
    await expect(dialog).toBeVisible();
    // Reported as "0.01ms" or "1e-05s" depending on the browser: compare the number.
    const fadeMs = await dialog.evaluate((element) => {
      const duration = getComputedStyle(element).animationDuration;
      return parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    });
    expect(fadeMs).toBeLessThanOrEqual(0.05);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test('the page animates only transform and opacity', async ({ page }) => {
  const track = content.getTrack('game');
  await openRoute(page, routeOf(track, 'all'));
  const properties = await page.evaluate(() => {
    const found = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const style = getComputedStyle(element);
      if (style.transitionDuration !== '0s' && style.transitionProperty) {
        for (const property of style.transitionProperty.split(',')) found.add(property.trim());
      }
      if (style.animationName !== 'none') found.add(`animation:${style.animationName}`);
    }
    return [...found];
  });
  for (const property of properties) {
    if (property.startsWith('animation:')) continue;
    expect(['transform', 'opacity'], property).toContain(property);
  }
  expect(properties).not.toContain('all');
});
