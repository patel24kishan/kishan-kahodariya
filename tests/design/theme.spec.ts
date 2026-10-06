import { expect, test } from '@playwright/test';
import { headerToggle, openKit, presetTheme } from './helpers';

test.describe('theme toggle', () => {
  test('is a named switch that flips data-theme, aria-checked and its name', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const html = page.locator('html');
    const toggle = headerToggle(page);

    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveRole('switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toHaveAccessibleName('Switch to light mode');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');

    // Every toggle on the page reflects the same state (one source of truth).
    const switches = page.getByRole('switch');
    for (const sw of await switches.all()) await expect(sw).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('persists the choice in localStorage["kk-theme"] across a reload', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    await headerToggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBe('light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(headerToggle(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('keeps <meta name="theme-color"> and color-scheme in sync with the theme', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const read = () =>
      page.evaluate(() => ({
        meta: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')?.content,
        canvas: getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim(),
        scheme: getComputedStyle(document.documentElement).colorScheme,
      }));

    const dark = await read();
    expect(dark.meta).toBe(dark.canvas);
    expect(dark.scheme).toBe('dark');

    await headerToggle(page).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const light = await read();
    expect(light.meta).toBe(light.canvas);
    expect(light.meta).not.toBe(dark.meta);
    expect(light.scheme).toBe('light');
  });

  test.describe('without a stored choice', () => {
    test.use({ colorScheme: 'light' });

    test('follows the system setting, live, until the user chooses', async ({ page }) => {
      await presetTheme(page, null);
      await openKit(page);
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'light');
      expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBeNull();

      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(html).toHaveAttribute('data-theme', 'dark');
      expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBeNull();

      await page.emulateMedia({ colorScheme: 'light' });
      await expect(html).toHaveAttribute('data-theme', 'light');

      // An explicit choice wins over later system changes.
      await headerToggle(page).click();
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForTimeout(100);
      await expect(html).toHaveAttribute('data-theme', 'dark');
    });
  });

  test.describe('with the system set to dark', () => {
    test.use({ colorScheme: 'dark' });

    test('starts dark when nothing is stored', async ({ page }) => {
      await presetTheme(page, null);
      await openKit(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(headerToggle(page)).toHaveAttribute('aria-checked', 'false');
    });
  });

  test('is keyboard operable (Space and Enter) and has a 44px hit area', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const toggle = headerToggle(page);
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });
});
