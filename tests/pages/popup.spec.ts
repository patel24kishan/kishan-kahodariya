import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { content } from './support/content';

/**
 * The welcome popup: shown once to a first-time visitor (the rest of the suite starts as a
 * returning visitor, see playwright.config.ts), closable by Esc / the X / the backdrop, the
 * two buttons lead to the two pages, and the name tag starts behind the card and drops out.
 */
const popup = content.getSite().popup;
const SEEN = 'kk-welcome-seen';

// A first-time visitor: no stored flag.
test.use({ storageState: { cookies: [], origins: [] } });

function dialog(page: Page) {
  return page.getByTestId('welcome-popup');
}

test.describe('welcome popup', () => {
  test('the owner has it switched on, with the wording from the canvas', () => {
    expect(popup.enabled).toBe(true);
    expect(popup.heading).not.toBe('');
    expect(popup.gameLabel).not.toBe('');
    expect(popup.softLabel).not.toBe('');
  });

  test('shows to a first-time visitor, once, and locks the page behind it', async ({ page }) => {
    await page.goto('./');
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: popup.heading })).toBeVisible();
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SEEN)).toBe('1');
    await expect(dialog(page).getByRole('button', { name: 'Close the popup' })).toBeFocused();

    await page.reload();
    await expect(page.getByTestId('track-page')).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('is not shown to a returning visitor, but ?popup=1 shows it again', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, '1'), SEEN);
    await page.goto('./');
    await expect(page.getByTestId('track-page')).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);

    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
  });

  test('Esc, the X and a click on the backdrop close it and give the page back', async ({ page }) => {
    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');

    await page.goto('./?popup=1');
    await dialog(page).getByRole('button', { name: 'Close the popup' }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).click({ position: { x: 2, y: 2 } });
    await expect(dialog(page)).toHaveCount(0);
  });

  test('keeps Tab inside the popup', async ({ page }) => {
    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="welcome-popup"]'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="welcome-popup"]'))).toBe(true);
  });

  test('the two buttons open the game page and the software page', async ({ page }) => {
    const game = content.getTrack('game');
    const soft = content.getTrack('softdev');

    await page.goto('./?popup=1');
    await dialog(page).locator('[data-popup-action="softdev"]').click();
    await expect(page).toHaveURL(new RegExp(`/${soft.route}$`));
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('track-page')).toHaveAttribute('data-track', 'softdev');

    await page.goto(`./${soft.route}?popup=1`);
    await dialog(page).locator('[data-popup-action="game"]').click();
    await expect(page).toHaveURL(new RegExp(`/${game.route}$`));
    await expect(page.getByTestId('track-page')).toHaveAttribute('data-track', 'game');
  });

  test('Resume follows the page that is open and Say hi writes to the site address', async ({ page }) => {
    const soft = content.getTrack('softdev');
    const site = content.getSite();
    await page.goto(`./${soft.route}?popup=1`);
    const resume = dialog(page).locator('[data-popup-resume]');
    const expected = content.getResume('softdev', soft.defaultTab).url;
    if (expected.trim() === '') await expect(resume).toHaveCount(0);
    else await expect(resume).toHaveAttribute('href', expected);
    await expect(dialog(page).locator('[data-popup-mail]')).toHaveAttribute('href', `mailto:${site.email}`);
  });

  test('the name tag sits behind the card and falls out of it', async ({ page }) => {
    await page.goto('./?popup=1');
    const tag = dialog(page).locator('[data-popup-tag]');
    await expect(tag).toBeAttached();
    // While the card is flipping in and the delay runs, the tag is hidden.
    const early = await tag.evaluate((element) => getComputedStyle(element).opacity);
    expect(early).toBe('0');
    const zCard = await dialog(page).locator('[data-popup-content] > div').nth(1).evaluate((element) => getComputedStyle(element).zIndex);
    const zTag = await tag.evaluate((element) => getComputedStyle(element).zIndex);
    expect(Number(zCard)).toBeGreaterThan(Number(zTag));
    // After the animations it rests below the card, fully visible.
    await expect(tag).toHaveCSS('opacity', '1', { timeout: 4000 });
    await page.waitForTimeout(1200);
    const cardBox = await dialog(page).locator('[data-popup-content] > div').nth(1).boundingBox();
    const tagBox = await tag.boundingBox();
    expect(tagBox!.y).toBeGreaterThanOrEqual(cardBox!.y + cardBox!.height - 2);
  });

  test('only transform and opacity are animated', async ({ page }) => {
    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    const props = await page.evaluate(() => {
      const found = new Set<string>();
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        if (!effect || !(effect.target instanceof Element) || !effect.target.closest('[data-testid="welcome-popup"]')) continue;
        for (const frame of effect.getKeyframes()) {
          for (const key of Object.keys(frame)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) found.add(key);
        }
      }
      return [...found].sort();
    });
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) expect(['opacity', 'transform']).toContain(prop);
  });

  test('with reduced motion everything is simply shown', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?popup=1');
    const tag = dialog(page).locator('[data-popup-tag]');
    await expect(tag).toBeVisible();
    await expect(tag).toHaveCSS('opacity', '1');
    await expect(dialog(page).locator('[data-popup-content] > div').nth(1)).toHaveCSS('opacity', '1');
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    await page.waitForTimeout(2200);
    const results = await new AxeBuilder({ page }).include('[data-testid="welcome-popup"]').analyze();
    expect(results.violations, JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
  });
});
