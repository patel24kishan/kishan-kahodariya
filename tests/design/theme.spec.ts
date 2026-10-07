import { expect, test } from '@playwright/test';
import { expectToggleGeometry, focusRingOf, headerToggle, openKit, presetTheme, THEMES, TOGGLE, TRACKS } from './helpers';

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

  for (const theme of THEMES) {
    test(`draws a 48 × 22 pill in a 44px hit area with the knob inside it, by night and by day — starting ${theme}`, async ({ page }) => {
      await presetTheme(page, theme);
      await openKit(page);
      // The header, the canvas, the surface, the accent cell and the footer band sample.
      const switches = await page.getByRole('switch').all();
      expect(switches.length).toBeGreaterThanOrEqual(5);

      const first = theme === 'light' ? 'day' : 'night';
      for (const [index, toggle] of switches.entries()) await expectToggleGeometry(toggle, first, `toggle ${index + 1}`);

      // Switched from the keyboard, so no pointer rests on a knob while it is measured.
      await headerToggle(page).focus();
      await page.keyboard.press('Space');
      const second = first === 'day' ? 'night' : 'day';
      await expect(page.locator('html')).toHaveAttribute('data-theme', second === 'day' ? 'light' : 'dark');
      for (const [index, toggle] of switches.entries()) await expectToggleGeometry(toggle, second, `toggle ${index + 1}`);
    });
  }

  test('the knob stays inside the pill while the pointer rests on it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no hover on touch devices');
    await presetTheme(page, 'dark');
    await openKit(page);
    const toggle = headerToggle(page);
    await toggle.hover();
    // The hover state enlarges the knob a little: wait for that, then measure both states.
    await expect
      .poll(() => toggle.locator('[data-theme-toggle-knob]').evaluate((knob) => knob.getBoundingClientRect().width))
      .toBeGreaterThan(TOGGLE.knobSize + 0.5);
    await expectToggleGeometry(toggle, 'night');
    await toggle.click();
    await expectToggleGeometry(toggle, 'day');
  });

  for (const theme of THEMES) {
    test(`the ring separates the pill from what is behind it — ${theme}`, async ({ page }) => {
      await presetTheme(page, theme);
      await openKit(page);
      const ringOf = (selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((pill) => {
            const ring = getComputedStyle(pill, '::after');
            return { color: ring.borderTopColor, style: ring.borderTopStyle, width: parseFloat(ring.borderTopWidth) };
          });
      const onCanvas = await ringOf('#kit-theme-toggle [data-theme-toggle-pill]');
      const onAccent = await ringOf('[data-on-accent] [data-theme-toggle-pill]');
      const nearBlack = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-on-accent)';
        document.querySelector('[data-on-accent]')!.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      for (const ring of [onCanvas, onAccent]) {
        expect(ring.style).toBe('solid');
        // Browsers snap border widths to whole device pixels: 1.5px is drawn 1px to 1.5px wide.
        expect(ring.width).toBeGreaterThanOrEqual(1);
        expect(ring.width).toBeLessThanOrEqual(TOGGLE.ring);
      }
      // Inside an accent band the ring is near-black; on the canvas it is the theme's own blue.
      expect(onAccent.color).toBe(nearBlack);
      expect(onCanvas.color).not.toBe(nearBlack);
    });
  }

  for (const track of TRACKS) {
    test(`keyboard focus draws one ring, around the pill — ${track}`, async ({ page }) => {
      await presetTheme(page, 'dark');
      await openKit(page, track);
      for (const toggle of await page.getByRole('switch').all()) {
        await toggle.focus();
        await page.keyboard.press('Shift'); // keeps :focus-visible on
        const ring = await focusRingOf(toggle);
        expect(ring.focused).toBe(true);
        expect(ring.onChild, 'the ring is drawn on the pill').toBe(true);
        expect(ring.style).toBe('solid');
        expect(ring.width).toBeGreaterThanOrEqual(2);
        expect(ring.ownStyle, 'no second ring around the hit area').toBe('none');
        // The ring uses the focus colour of the region it is in (near-black inside an accent band).
        const colours = await toggle.evaluate((button) => {
          const pill = button.querySelector('[data-focus-ring]')!;
          const probe = document.createElement('span');
          probe.style.color = 'var(--color-focus)';
          button.append(probe);
          const token = getComputedStyle(probe).color;
          probe.remove();
          return { ring: getComputedStyle(pill).outlineColor, token };
        });
        expect(colours.ring).toBe(colours.token);
      }
      // Without keyboard focus there is no ring.
      await page.locator('main#kit-main').focus();
      const idle = await focusRingOf(headerToggle(page));
      expect(idle.style).toBe('none');
    });
  }
});
