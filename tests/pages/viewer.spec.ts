import { expect, test } from '@playwright/test';
import {
  content,
  hasNonStandardVideoAddress,
  hasParseableVideo,
  isExternal,
  routeOf,
  viewerItemCount,
  withBase,
  youtubeVideoId,
} from './support/content';
import {
  card,
  focusIsInside,
  mediaButton,
  openRoute,
  openViewerFromCard,
  scrollTo,
  scrollY,
  searchOf,
  VIEWER,
  viewer,
  waitForBoxToSettle,
  waitForScrollToSettle,
} from './support/page';

/**
 * The media viewer on the real page: opening, moving, closing, keyboard, focus, scroll lock,
 * the address, the YouTube embed. Projects are chosen from the content by what they have.
 */
const track = content.getTrack('game');
const route = routeOf(track, 'all');
const projects = content.getProjects('game', 'all');

const withShot = projects.find((project) => project.screenshots.length > 0);
const withVideo = projects.find(hasParseableVideo);
const withBoth = projects.find((project) => hasParseableVideo(project) && project.screenshots.length > 0);
const nonStandard = projects.find(hasNonStandardVideoAddress);

/** The strip of a project as data-viewer-item values: "video" first, then "1", "2", … */
function strip(project: NonNullable<typeof withShot>): string[] {
  const items: string[] = [];
  if (project.videoUrl.trim()) items.push('video');
  project.screenshots.forEach((_, index) => items.push(String(index + 1)));
  return items;
}

test.describe('opening', () => {
  test('from the card image: the first screenshot, the title and label, the address, focus on Close', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    const dialog = await openViewerFromCard(page, withShot!.slug);
    await expect(dialog).toHaveAttribute('data-viewer-item', '1');
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(withShot!.title);
    await expect(dialog.locator('[data-viewer-position]')).toHaveText(`Screenshot 1 of ${withShot!.screenshots.length}`);
    await expect(dialog.locator('[data-viewer-image], [data-viewer-fallback="image"]')).toHaveCount(1);
    expect(searchOf(page)).toBe(`?view=${withShot!.slug}&item=1`);
    await expect(dialog.getByRole('button', { name: 'Close viewer' })).toBeFocused();
    // The project's links, new-tab.
    const expectedLinks = withShot!.links.filter((link) => link.url.trim() !== '');
    const links = dialog.locator('[data-viewer-link]');
    await expect(links).toHaveCount(expectedLinks.length);
    for (const [index, link] of expectedLinks.entries()) {
      await expect(links.nth(index)).toHaveAttribute('href', link.url);
      if (isExternal(link.url)) await expect(links.nth(index)).toHaveAttribute('target', '_blank');
    }
  });

  test('from the Gameplay button: the video, embedded through youtube-nocookie', async ({ page }) => {
    test.skip(!withVideo, 'no project with a YouTube video');
    await openRoute(page, route);
    const button = card(page, withVideo!.slug).locator('[data-project-gameplay]');
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const dialog = viewer(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-viewer-item', 'video');
    await expect(dialog.locator('[data-viewer-position]')).toHaveText('Gameplay Video');
    const frame = dialog.locator('iframe[data-viewer-video]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${youtubeVideoId(withVideo!.videoUrl)}\\b`));
    await expect(frame).toHaveAttribute('title', /.+/);
    expect(searchOf(page)).toBe(`?view=${withVideo!.slug}&item=video`);
  });

  test('from a pasted address, after hydration; an unknown project leaves the page alone', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route, { suffix: `?view=${withShot!.slug}&item=1` });
    const dialog = viewer(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-viewer-project', withShot!.slug);
    await expect(dialog).toHaveAttribute('data-viewer-item', '1');

    if (withVideo) {
      await openRoute(page, route, { suffix: `?view=${withVideo.slug}&item=video` });
      await expect(viewer(page)).toHaveAttribute('data-viewer-item', 'video');
      await expect(viewer(page).locator('iframe')).toHaveCount(1);
    }

    await openRoute(page, route, { suffix: '?view=no-such-project&item=1' });
    await expect(viewer(page)).toHaveCount(0);
    await expect(page.locator('[data-testid="project-grid"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(withBase(route));
  });

  test('the non-standard YouTube address still resolves to its id', async ({ page }) => {
    test.skip(!nonStandard, 'no project with a non-standard YouTube address');
    await openRoute(page, route, { suffix: `?view=${nonStandard!.slug}&item=video` });
    const frame = viewer(page).locator('iframe[data-viewer-video]');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', new RegExp(`/embed/${youtubeVideoId(nonStandard!.videoUrl)}\\b`));
  });
});

test.describe('moving between items', () => {
  test('next and previous by button, by arrow key and by thumbnail; the iframe exists only on the video', async ({ page }) => {
    test.skip(!withBoth, 'no project with both a video and a screenshot');
    const items = strip(withBoth!);
    expect(items.length).toBe(viewerItemCount(withBoth!));
    const start = items.indexOf('1');
    const at = (index: number) => items[((index % items.length) + items.length) % items.length]!;

    await openRoute(page, route);
    const dialog = await openViewerFromCard(page, withBoth!.slug);
    await expect(dialog).toHaveAttribute('data-viewer-item', at(start));
    await expect(dialog.locator('iframe')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog).toHaveAttribute('data-viewer-item', at(start + 1));
    await dialog.getByRole('button', { name: 'Previous' }).click();
    await expect(dialog).toHaveAttribute('data-viewer-item', at(start));

    await page.keyboard.press('ArrowRight');
    await expect(dialog).toHaveAttribute('data-viewer-item', at(start + 1));
    await page.keyboard.press('ArrowLeft');
    await expect(dialog).toHaveAttribute('data-viewer-item', at(start));

    // Thumbnails: the video first, the current one marked.
    const thumbs = dialog.locator('[data-thumb]');
    await expect(thumbs).toHaveCount(items.length);
    for (const [index, item] of items.entries()) await expect(thumbs.nth(index)).toHaveAttribute('data-thumb', item);
    await expect(dialog.locator('[data-thumb][aria-current="true"]')).toHaveAttribute('data-thumb', at(start));

    await dialog.locator('[data-thumb="video"]').click();
    await expect(dialog).toHaveAttribute('data-viewer-item', 'video');
    await expect(dialog.locator('[data-viewer-position]')).toHaveText('Gameplay Video');
    await expect(dialog.locator('iframe[data-viewer-video]')).toHaveCount(1);
    await expect(dialog.locator('[data-thumb][aria-current="true"]')).toHaveAttribute('data-thumb', 'video');
    expect(searchOf(page)).toBe(`?view=${withBoth!.slug}&item=video`);

    await dialog.locator('[data-thumb="1"]').click();
    await expect(dialog).toHaveAttribute('data-viewer-item', '1');
    await expect(dialog.locator('[data-viewer-position]')).toHaveText(`Screenshot 1 of ${withBoth!.screenshots.length}`);
    await expect(dialog.locator('iframe')).toHaveCount(0);
    expect(searchOf(page)).toBe(`?view=${withBoth!.slug}&item=1`);
  });

  test('moving replaces the history entry, so Back closes rather than stepping back', async ({ page }) => {
    test.skip(!withBoth, 'no project with both a video and a screenshot');
    await openRoute(page, route);
    const dialog = await openViewerFromCard(page, withBoth!.slug);
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog).not.toHaveAttribute('data-viewer-item', '1');
    await page.goBack();
    await expect(viewer(page)).toHaveCount(0);
    expect(searchOf(page)).toBe('');
  });
});

test.describe('closing', () => {
  test('Esc closes, clears the address and returns focus to the card image', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    await openViewerFromCard(page, withShot!.slug);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    expect(searchOf(page)).toBe('');
    await expect(mediaButton(card(page, withShot!.slug))).toBeFocused();
  });

  test('the close button returns focus to the Gameplay button that opened it', async ({ page }) => {
    test.skip(!withVideo, 'no project with a YouTube video');
    await openRoute(page, route);
    const opener = card(page, withVideo!.slug).locator('[data-project-gameplay]');
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await viewer(page).getByRole('button', { name: 'Close viewer' }).click();
    await expect(viewer(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('a click on the backdrop closes', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    await openViewerFromCard(page, withShot!.slug);
    await page.mouse.click(4, 150);
    await expect(viewer(page)).toHaveCount(0);
  });

  test('the browser Back button closes a viewer that was opened by a click', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    await openViewerFromCard(page, withShot!.slug);
    await page.goBack();
    await expect(viewer(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(withBase(route));
    expect(searchOf(page)).toBe('');
    await page.goForward();
    await expect(viewer(page)).toBeVisible();
  });

  test('closing a viewer opened from a pasted address stays on the page', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route, { suffix: `?view=${withShot!.slug}&item=1` });
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(withBase(route));
    expect(searchOf(page)).toBe('');
    await expect(page.locator('[data-testid="project-grid"]')).toBeVisible();
  });
});

test.describe('focus and the page behind', () => {
  test('focus stays inside the viewer while it is open', async ({ page }) => {
    test.skip(!withBoth, 'no project with both a video and a screenshot');
    await openRoute(page, route);
    await openViewerFromCard(page, withBoth!.slug);
    const visited = new Set<string>();
    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(page, VIEWER), `after ${step + 1} Tabs`).toBe(true);
      visited.add(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''));
    }
    expect(visited.size).toBeGreaterThan(2);
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInside(page, VIEWER), `after ${step + 1} Shift+Tabs`).toBe(true);
    }
  });

  test('the page behind keeps its scroll position, cannot scroll and does not shift', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    const button = mediaButton(card(page, withShot!.slug));
    await button.scrollIntoViewIfNeeded();
    await waitForScrollToSettle(page);
    await waitForBoxToSettle(card(page, withShot!.slug));
    const before = await scrollY(page);
    const boxesBefore = await Promise.all([page.getByRole('banner').boundingBox(), card(page, withShot!.slug).boundingBox()]);

    await button.click();
    await expect(viewer(page)).toBeVisible();
    expect(await scrollY(page)).toBe(before);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    // Nothing behind the viewer moved or changed width when the scrollbar went away.
    const boxesAfter = await Promise.all([page.getByRole('banner').boundingBox(), card(page, withShot!.slug).boundingBox()]);
    expect(boxesAfter).toEqual(boxesBefore);
    await expect(viewer(page)).toHaveCSS('overscroll-behavior', 'contain');

    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(250);
    expect(await scrollY(page)).toBe(before);

    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    expect(await scrollY(page)).toBe(before);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
    await scrollTo(page, Math.max(0, before - 100));
  });

  test('the viewer is a labelled modal dialog with a dark backdrop over the page', async ({ page }) => {
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, route);
    const dialog = await openViewerFromCard(page, withShot!.slug);
    await expect(dialog).toHaveRole('dialog');
    await expect(dialog).toHaveAttribute('open', '');
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
    await expect(dialog).toHaveAccessibleName(withShot!.title);
    await expect(dialog).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.7)');
    // The page is still there behind it.
    await expect(page.locator('[data-testid="project-grid"]')).toHaveCount(1);
    expect(await page.locator('main').evaluate((element) => element.matches(':modal *') || (element.closest('[inert]') !== null))).toBe(false);
  });
});
