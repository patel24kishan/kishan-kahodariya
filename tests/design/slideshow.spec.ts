import { expect, test, type Locator, type Page } from '@playwright/test';
import { openKit, presetTheme, THEMES, TRACKS, type Track } from './helpers';

/**
 * MediaOverlayButton with several `slides` (the kit's slideshow samples): auto-advance on a
 * fake clock, pause on hover and on focus, only on screen and only while the page is visible,
 * the position dots, activation with the index on show, broken slides skipped, every slide
 * broken → fallback, reduced motion → static, and the single-image button left as it was.
 */
const INTERVAL = 3000;

function slideshow(page: Page): Locator {
  return page.getByTestId('media-slideshow');
}

/** Put the page's timers under test control: nothing fires until `page.clock.runFor()`. */
async function freezeTime(page: Page): Promise<void> {
  const start = new Date('2026-10-07T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
}

/** Open the kit with the page's timers under test control, scrolled to the slideshow sample. */
async function openSlideshow(page: Page, track: Track = 'game', theme: 'dark' | 'light' = 'dark'): Promise<Locator> {
  await presetTheme(page, theme);
  await freezeTime(page);
  await openKit(page, track);
  const media = slideshow(page);
  await media.scrollIntoViewIfNeeded();
  await expect(media).toHaveAttribute('data-media-current', '0');
  await expect(media).toHaveAttribute('data-media-running', 'true');
  return media;
}

test.describe('auto-advance', () => {
  test('moves to the next screenshot every 3 seconds and loops', async ({ page }) => {
    const media = await openSlideshow(page);
    await expect(media).toHaveAttribute('data-media-count', '3');
    await page.clock.runFor(INTERVAL - 100);
    await expect(media).toHaveAttribute('data-media-current', '0');
    await page.clock.runFor(100);
    await expect(media).toHaveAttribute('data-media-current', '1');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '2');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '0');
  });

  test('moves the track with a transform only, one slide at a time', async ({ page }) => {
    const media = await openSlideshow(page);
    const track = media.locator('[data-media-track]');
    await expect(track).toHaveCSS('transition-property', 'transform');
    const duration = await track.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration) * 1000);
    expect(duration).toBeGreaterThanOrEqual(400);
    expect(duration).toBeLessThanOrEqual(500);
    const slides = media.locator('[data-media-slide]');
    await expect(slides).toHaveCount(3);
    const [box, first, second] = await Promise.all([media.boundingBox(), slides.nth(0).boundingBox(), slides.nth(1).boundingBox()]);
    expect(first!.width).toBeCloseTo(box!.width, 0);
    expect(second!.x).toBeCloseTo(first!.x + first!.width, 0);
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
    // The track's target position is one width to the left; the layout of the slides is unchanged.
    await expect.poll(() => slides.nth(1).boundingBox().then((rect) => Math.round(rect!.x))).toBe(Math.round(box!.x));
    expect((await slides.nth(0).boundingBox())!.width).toBeCloseTo(box!.width, 0);
  });

  test('is paused while the pointer is over the media and resumes when it leaves', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no pointer on touch devices');
    const media = await openSlideshow(page);
    await media.hover();
    await expect(media).not.toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '0');
    // The overlay is the same one as on a single image.
    await expect(media.locator('[data-media-label]')).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
  });

  test('is paused while the button has keyboard focus and resumes on blur', async ({ page }) => {
    const media = await openSlideshow(page);
    await media.focus();
    await page.keyboard.press('Shift');
    await expect(media).toBeFocused();
    await expect(media).not.toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '0');

    await media.evaluate((element) => (element as HTMLElement).blur());
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
  });

  test('runs only while the media is on screen', async ({ page }) => {
    await presetTheme(page, 'dark');
    await freezeTime(page);
    await openKit(page);
    const media = slideshow(page);
    // The sample is far down the page: not on screen, so no timer.
    await expect(media).not.toBeInViewport();
    await expect(media).toHaveAttribute('data-media-current', '0');
    await expect(media).not.toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '0');

    await media.scrollIntoViewIfNeeded();
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(media).not.toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '1');
  });

  test('runs only while the document is visible', async ({ page }) => {
    const media = await openSlideshow(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(media).not.toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-current', '0');

    await page.evaluate(() => {
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
  });
});

test.describe('dots', () => {
  for (const theme of THEMES) {
    for (const track of TRACKS) {
      test(`one dot per screenshot, the current one an accent pill, decorative — ${theme} / ${track}`, async ({ page }) => {
        const media = await openSlideshow(page, track, theme);
        const dots = media.locator('[data-media-dots]');
        await expect(dots).toHaveAttribute('aria-hidden', 'true');
        const each = dots.locator('[data-media-dot]');
        await expect(each).toHaveCount(3);
        await expect(each.nth(0)).toHaveAttribute('data-media-dot', 'active');
        await expect(each.nth(1)).toHaveAttribute('data-media-dot', 'inactive');

        const accent = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).getPropertyValue('--color-accent').trim());
        const hex = accent.replace('#', '');
        const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
        expect(accent).toBe(track === 'game' ? '#faff69' : '#7cb2ff');
        await expect(each.nth(0)).toHaveCSS('background-color', rgb);
        await expect(each.nth(0)).toHaveCSS('opacity', '1');
        await expect(each.nth(1)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(each.nth(1)).toHaveCSS('opacity', '0.55');

        const [active, inactive, box] = await Promise.all([each.nth(0).boundingBox(), each.nth(1).boundingBox(), media.boundingBox()]);
        expect(Math.round(active!.width)).toBe(16);
        expect(Math.round(active!.height)).toBe(6);
        expect(Math.round(inactive!.width)).toBe(6);
        expect(Math.round(inactive!.height)).toBe(6);
        // At the bottom of the image, inside it.
        expect(active!.y + active!.height).toBeLessThanOrEqual(box!.y + box!.height);
        expect(active!.y).toBeGreaterThan(box!.y + box!.height * 0.8);
        // Dots never transition (they are not transform / opacity animations).
        await expect(each.nth(0)).toHaveCSS('transition-duration', '0s');

        await page.clock.runFor(INTERVAL);
        await expect(each.nth(1)).toHaveAttribute('data-media-dot', 'active');
        await expect(each.nth(0)).toHaveAttribute('data-media-dot', 'inactive');
      });
    }
  }

  test('sit at the bottom centre on pointer devices', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch devices keep the badge in the corner');
    const media = await openSlideshow(page);
    const [dots, box] = await Promise.all([media.locator('[data-media-dots]').boundingBox(), media.boundingBox()]);
    expect(dots!.x + dots!.width / 2).toBeCloseTo(box!.x + box!.width / 2, 0);
  });

  test('sit at the bottom left on touch devices, clear of the badge', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'pointer devices centre the dots');
    const media = await openSlideshow(page);
    const each = media.locator('[data-media-dot]');
    const badge = media.locator('[data-media-label]');
    await expect(badge).toBeVisible();
    const [first, last, badgeBox, box] = await Promise.all([each.first().boundingBox(), each.last().boundingBox(), badge.boundingBox(), media.boundingBox()]);
    expect(first!.x).toBeLessThan(box!.x + box!.width / 4);
    expect(last!.x + last!.width).toBeLessThan(badgeBox!.x);
  });
});

test.describe('activation and accessibility', () => {
  test('activating the button reports the screenshot on show', async ({ page }) => {
    const media = await openSlideshow(page);
    const card = page.getByTestId('slideshow-card');
    await expect(card).toHaveAttribute('data-kit-opened', 'none');
    await media.click();
    await expect(card).toHaveAttribute('data-kit-opened', '0');
    await page.mouse.move(0, 0);
    await media.evaluate((element) => (element as HTMLElement).blur());
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
    await media.click();
    await expect(card).toHaveAttribute('data-kit-opened', '1');
  });

  test('one accessible name (the screenshot on show and the label); other slides hidden; no live region', async ({ page }) => {
    const media = await openSlideshow(page);
    await expect(media).toHaveAccessibleName('Tile Breaker screenshot one View Gameplay & Screenshots');
    const slides = media.locator('[data-media-slide]');
    await expect(slides.nth(0)).not.toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(1)).toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(2)).toHaveAttribute('aria-hidden', 'true');
    await expect(media.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
    await expect(media.locator('button, a[href], [tabindex]')).toHaveCount(0);

    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAccessibleName('Tile Breaker screenshot two View Gameplay & Screenshots');
    await expect(slides.nth(0)).toHaveAttribute('aria-hidden', 'true');
    await expect(slides.nth(1)).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('every slide image has alt, width and height; later slides are lazy until they come up', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const media = slideshow(page);
    const images = media.locator('img');
    await expect(images).toHaveCount(3);
    for (const index of [0, 1, 2]) {
      await expect(images.nth(index)).toHaveAttribute('alt', /Tile Breaker screenshot/);
      await expect(images.nth(index)).toHaveAttribute('width', '1600');
      await expect(images.nth(index)).toHaveAttribute('height', '900');
    }
    // Off screen: nothing after the first is fetched yet.
    await expect(media).not.toBeInViewport();
    await expect(images.nth(1)).toHaveAttribute('loading', 'lazy');
    await expect(images.nth(2)).toHaveAttribute('loading', 'lazy');
    // On screen: the slide that comes next is fetched ahead of its turn, the one after is not.
    await media.scrollIntoViewIfNeeded();
    await expect(images.nth(1)).toHaveAttribute('loading', 'eager');
    await expect(images.nth(2)).toHaveAttribute('loading', 'lazy');
  });

  test('the box keeps its aspect ratio and the page never scrolls sideways', async ({ page }) => {
    const media = await openSlideshow(page);
    const box = await media.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '1');
    const after = await media.boundingBox();
    expect(after).toEqual(box);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});

test.describe('broken screenshots', () => {
  test('a screenshot that fails to load is skipped and loses its dot', async ({ page }) => {
    await presetTheme(page, 'dark');
    await freezeTime(page);
    await openKit(page);
    const media = page.getByTestId('media-slideshow-broken');
    await media.scrollIntoViewIfNeeded();
    await expect(media.locator('[data-media-slide="1"]')).toHaveAttribute('data-media-slide-state', 'failed');
    await expect(media.locator('[data-media-slide="1"] img')).toHaveCount(0);
    await expect(media).toHaveAttribute('data-media-count', '2');
    await expect(media.locator('[data-media-dot]')).toHaveCount(2);
    await expect(media).toHaveAttribute('data-media-current', '0');
    await expect(media).toHaveAttribute('data-media-running', 'true');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '2');
    await page.clock.runFor(INTERVAL);
    await expect(media).toHaveAttribute('data-media-current', '0');
  });

  test('when every screenshot fails the fallback shows, with no dots and no timer', async ({ page }) => {
    await presetTheme(page, 'dark');
    await freezeTime(page);
    await openKit(page);
    const media = page.getByTestId('media-slideshow-failed');
    await media.scrollIntoViewIfNeeded();
    await expect(media).toHaveAttribute('data-media-fallback', 'true');
    await expect(media).toContainText('No preview yet');
    await expect(media.locator('img')).toHaveCount(0);
    await expect(media.locator('[data-media-dots]')).toHaveCount(0);
    await expect(media.locator('[data-media-track]')).toHaveCount(0);
    await expect(media).not.toHaveAttribute('data-media-current', /./);
    await expect(media).not.toHaveAttribute('data-media-running', /./);
    await expect(media.locator('[data-media-label]')).toHaveText('View Screenshots');
    await page.clock.runFor(INTERVAL * 2);
    await expect(media).toHaveAttribute('data-media-fallback', 'true');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the first screenshot statically: no advance, no slide animation, no dots', async ({ page }) => {
    await presetTheme(page, 'dark');
    await freezeTime(page);
    await openKit(page);
    const media = slideshow(page);
    await media.scrollIntoViewIfNeeded();
    await expect(media).toBeInViewport();
    await expect(media).toHaveAttribute('data-media-current', '0');
    await expect(media).not.toHaveAttribute('data-media-running', /./);
    await expect(media.locator('[data-media-dots]')).toBeHidden();
    await expect(media.locator('[data-media-track]')).toHaveCSS('transition-duration', '0s');
    await page.clock.runFor(INTERVAL * 3);
    await expect(media).toHaveAttribute('data-media-current', '0');
    await expect(media.locator('[data-media-slide="0"]')).toHaveAttribute('data-media-slide-state', 'current');
    await expect(media.locator('[data-media-slide="0"] img')).toBeVisible();
  });
});

test.describe('a single image', () => {
  test('is the plain media button: no slideshow markup, no dots, one image', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const media = page.getByTestId('media-overlay');
    await media.scrollIntoViewIfNeeded();
    await expect(media).not.toHaveAttribute('data-media-carousel', /.*/);
    await expect(media).not.toHaveAttribute('data-media-current', /./);
    await expect(media.locator('[data-media-dots]')).toHaveCount(0);
    await expect(media.locator('[data-media-track]')).toHaveCount(0);
    await expect(media.locator('[data-media-slide]')).toHaveCount(0);
    await expect(media.locator('img')).toHaveCount(1);
    await expect(media.locator('img')).toHaveAttribute('alt', 'Scarfall cover image');
    await expect(media).toHaveAccessibleName('Scarfall cover image View Gameplay & Screenshots');
  });
});
