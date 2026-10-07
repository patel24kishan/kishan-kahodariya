import { expect, test, type Page } from '@playwright/test';
import { blockOtherOrigins, viewer } from './support/page';

/**
 * Viewer cases the real content cannot produce, on tests/pages/support/viewer-fixture.html
 * (served by the dev server, never built): several screenshots, a video address that is not
 * YouTube, a screenshot that fails to load, a project with no media, a tab with no projects.
 */
const FIXTURE_PATH = 'tests/pages/support/viewer-fixture.html';

async function openFixture(page: Page): Promise<void> {
  await blockOtherOrigins(page);
  await page.goto(FIXTURE_PATH);
  await page.locator('[data-testid="viewer-fixture"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function launch(page: Page, name: string) {
  await page.locator(`[data-open="${name}"]`).click();
  const dialog = viewer(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a video address that is not YouTube shows a panel with a new-tab link instead of an iframe', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'odd-video');
  await expect(dialog).toHaveAttribute('data-viewer-item', 'video');
  await expect(dialog.locator('iframe')).toHaveCount(0);
  const fallback = dialog.locator('[data-viewer-fallback="video"]');
  await expect(fallback).toBeVisible();
  const open = fallback.getByRole('link', { name: /^Open Video/ });
  await expect(open).toHaveAttribute('href', 'https://example.com/videos/not-on-youtube');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
});

test('a screenshot that fails to load shows a fallback with a link to the image', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'gallery-broken');
  await expect(dialog).toHaveAttribute('data-viewer-item', '3');
  const fallback = dialog.locator('[data-viewer-fallback="image"]');
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole('link', { name: /^Open Image/ })).toHaveAttribute('href', 'https://images.invalid/gallery-3.png');
  await expect(dialog.locator('[data-viewer-image]')).toHaveCount(0);
  await expect(dialog.locator('[data-viewer-position]')).toHaveText('Screenshot 3 of 3');
  // A thumbnail of the broken image shows its own fallback glyph.
  await expect(dialog.locator('[data-thumb="3"] img')).toHaveCount(0);
});

test('several screenshots: counting, wrap-around, Home and End', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'gallery');
  const position = dialog.locator('[data-viewer-position]');
  await expect(dialog).toHaveAttribute('data-viewer-item', '1');
  await expect(position).toHaveText('Screenshot 1 of 3');
  await expect(dialog.locator('[data-viewer-image]')).toHaveAttribute('alt', 'Gallery shot one');
  await expect(dialog.locator('[data-thumb]')).toHaveCount(4);

  await page.keyboard.press('ArrowRight');
  await expect(position).toHaveText('Screenshot 2 of 3');
  await expect(dialog.locator('[data-viewer-image]')).toHaveAttribute('alt', 'Gallery shot two');
  await page.keyboard.press('ArrowRight');
  await expect(position).toHaveText('Screenshot 3 of 3');
  await page.keyboard.press('ArrowRight');
  await expect(position).toHaveText('Gameplay Video');
  await expect(dialog.locator('iframe')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expect(position).toHaveText('Screenshot 3 of 3');
  await expect(dialog.locator('iframe')).toHaveCount(0);
  await page.keyboard.press('Home');
  await expect(position).toHaveText('Gameplay Video');
  await page.keyboard.press('End');
  await expect(position).toHaveText('Screenshot 3 of 3');
  await expect(dialog.locator('[data-thumb][aria-current="true"]')).toHaveAttribute('data-thumb', '3');
});

test('only the links with an address are shown', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'gallery');
  const links = dialog.locator('[data-viewer-link]');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('href', 'https://example.com/code');
  await expect(dialog.getByRole('link', { name: /Hidden Link/ })).toHaveCount(0);
});

test('a swipe moves to the next and previous item; a tap does not', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'gallery');
  const stage = dialog.locator('[data-viewer-stage]');
  const touch = (type: string, x: number) => stage.dispatchEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 300, bubbles: true, isPrimary: true });

  await touch('pointerdown', 300);
  await touch('pointerup', 120);
  await expect(dialog).toHaveAttribute('data-viewer-item', '2');

  await touch('pointerdown', 100);
  await touch('pointerup', 290);
  await expect(dialog).toHaveAttribute('data-viewer-item', '1');

  // A short movement is a tap, not a swipe; a vertical drag is a scroll, not a swipe.
  await touch('pointerdown', 200);
  await touch('pointerup', 215);
  await expect(dialog).toHaveAttribute('data-viewer-item', '1');
  await stage.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: 200, clientY: 100, bubbles: true });
  await stage.dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch', clientX: 260, clientY: 320, bubbles: true });
  await expect(dialog).toHaveAttribute('data-viewer-item', '1');
  // The stage is still on screen: swiping did not close the viewer.
  await expect(dialog).toBeVisible();
});

test('a project without media says so and disables the arrows', async ({ page }) => {
  await openFixture(page);
  const dialog = await launch(page, 'no-media');
  await expect(dialog).toHaveAttribute('data-viewer-item', 'none');
  await expect(dialog.locator('[data-viewer-position]')).toHaveText('No media yet');
  await expect(dialog.locator('[data-viewer-panel]')).toContainText('no screenshots or video');
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await expect(dialog.locator('[data-viewer-thumbs]')).toHaveCount(0);
  await expect(dialog.locator('iframe')).toHaveCount(0);
});

test('Esc returns focus to the element that opened the viewer', async ({ page }) => {
  await openFixture(page);
  await launch(page, 'gallery-video');
  await expect(viewer(page)).toHaveAttribute('data-viewer-item', 'video');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.locator('[data-open="gallery-video"]')).toBeFocused();
});

test('a tab without projects shows the empty state with a way to the All tab', async ({ page }) => {
  await openFixture(page);
  const empty = page.getByTestId('projects-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('Unity3D');
  await expect(empty.getByRole('link', { name: /All Projects/ })).toHaveAttribute('href', /\/gamedev\/all$/);
  await expect(page.locator('[data-testid="project-grid"]')).toHaveCount(0);
});
