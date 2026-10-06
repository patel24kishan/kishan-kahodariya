import { expect, test, type Locator, type Page } from '@playwright/test';
import { openKit, presetTheme, THEMES } from './helpers';

/** Every interactive element in the kit (links, buttons, the switch, the radio inputs). */
function interactive(page: Page): Locator {
  return page.locator('main a[href], main button, header a[href], header button, header input, a[href][class*="skip"]');
}

async function outlineOf(locator: Locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, focused: el === document.activeElement };
  });
}

test.describe('focus', () => {
  for (const theme of THEMES) {
    test(`keyboard focus is visible on every interactive primitive — ${theme}`, async ({ page }) => {
      await presetTheme(page, theme);
      await openKit(page);
      const elements = await interactive(page).all();
      expect(elements.length).toBeGreaterThan(40);

      const failures: string[] = [];
      for (const el of elements) {
        const enabled = await el.evaluate((node) => !(node as HTMLButtonElement).disabled);
        if (!enabled) continue;
        // Focus via the keyboard so :focus-visible matches (a programmatic focus() alone may not).
        await el.evaluate((node) => {
          const prev = node.previousElementSibling as HTMLElement | null;
          (node as HTMLElement).focus();
          void prev;
        });
        await page.keyboard.press('Shift');
        const ring = await outlineOf(el);
        if (!ring.focused) continue; // not focusable in this project (e.g. hidden radio) — skipped, not failed
        if (ring.style === 'none' || ring.width < 2) {
          failures.push(`${await el.evaluate((n) => n.tagName)} "${(await el.getAttribute('aria-label')) ?? (await el.innerText()).slice(0, 30)}" → ${ring.style} ${ring.width}px`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }

  test('the skip link appears on focus and targets the main landmark', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    const box = await skip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(page.locator('main#kit-main')).toBeFocused();
  });
});

test.describe('media overlay button', () => {
  test('shows the overlay on hover and on keyboard focus (pointer devices)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch devices show a permanent badge instead');
    await presetTheme(page, 'dark');
    await openKit(page);
    const media = page.getByTestId('media-overlay');
    const label = media.locator('[data-media-label]');
    await media.scrollIntoViewIfNeeded();

    await expect(label).toHaveCSS('opacity', '0');
    await media.hover();
    await expect(label).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(label).toHaveCSS('opacity', '0');

    await media.focus();
    await page.keyboard.press('Shift'); // keeps :focus-visible on
    await expect(label).toHaveCSS('opacity', '1');
    await expect(media).toHaveAccessibleName(/Scarfall cover image.*View Gameplay & Screenshots/);
  });

  test('shows a permanent badge on touch devices', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'desktop project uses the hover overlay');
    await presetTheme(page, 'dark');
    await openKit(page);
    const media = page.getByTestId('media-overlay');
    const label = media.locator('[data-media-label]');
    await media.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS('opacity', '1');
    const [m, l] = await Promise.all([media.boundingBox(), label.boundingBox()]);
    expect(l!.height).toBeLessThan(m!.height / 2); // a badge, not a full scrim
    expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + m!.width);
  });

  test('image carries alt, width, height and lazy loading by default', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const img = page.locator('[data-media-overlay] img').nth(1);
    await expect(img).toHaveAttribute('alt', /cover image/);
    await expect(img).toHaveAttribute('width', '1600');
    await expect(img).toHaveAttribute('height', '900');
    await expect(img).toHaveAttribute('loading', 'lazy');
  });
});

test.describe('buttons and links', () => {
  test('external links open safely in a new tab and say so; internal ones do not', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const external = page.getByRole('link', { name: /^Software Resume/ });
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(external).toHaveAccessibleName('Software Resume (opens in a new tab)');

    const internal = page.getByRole('link', { name: 'Jump to colours' });
    await expect(internal).not.toHaveAttribute('target', '_blank');

    const mail = page.getByRole('link', { name: /^Email$/ }).first();
    await expect(mail).not.toHaveAttribute('target', '_blank');
  });

  test('icon buttons have an accessible name and aria-hidden icons', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const close = page.getByRole('button', { name: 'Close viewer' });
    await expect(close).toBeVisible();
    await expect(close.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('segmented tabs are links with aria-current on the open tab', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const nav = page.getByRole('navigation', { name: 'Project categories' });
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(4);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Unity3D');
    await links.filter({ hasText: 'Web Apps' }).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Web Apps');
    const accent = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).getPropertyValue('--color-accent').trim());
    const bg = await nav.locator('[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    const hex = accent.replace('#', '');
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    expect(bg).toBe(rgb);
  });

  test('the accent follows data-track', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page, 'softdev');
    const accent = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).getPropertyValue('--color-accent').trim());
    expect(accent).toBe('#7cb2ff');
    await page.getByLabel('Game', { exact: true }).check();
    await expect(page.locator('main[data-track="game"]')).toBeVisible();
    const game = await page.evaluate(() => getComputedStyle(document.querySelector('main')!).getPropertyValue('--color-accent').trim());
    expect(game).toBe('#faff69');
    expect(page.url()).toContain('track=game');
  });
});

test.describe('touch targets', () => {
  test('every interactive element is at least 44px in both dimensions', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      const nodes = document.querySelectorAll<HTMLElement>('main a[href], main button, header a[href], header button, header input');
      for (const el of nodes) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        if (r.width < 44 || r.height < 44) {
          out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return out;
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('transitions are instant and the toggle still switches', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const durations = await page.evaluate(() => {
      const pick = (sel: string) => getComputedStyle(document.querySelector(sel)!).transitionDuration;
      return {
        knob: pick('#kit-theme-toggle span span:last-child'),
        sky: pick('#kit-theme-toggle span span:first-child'),
        overlay: pick('[data-testid="media-overlay"] [data-media-label]'),
        button: getComputedStyle(document.querySelector('#buttons button')!, '::before').transitionDuration,
        token: getComputedStyle(document.documentElement).getPropertyValue('--duration-slow').trim(),
      };
    });
    expect(durations.knob).toBe('0s');
    expect(durations.sky).toBe('0s');
    expect(durations.overlay).toBe('0s');
    expect(durations.button).toBe('0s');
    expect(durations.token).toBe('0ms');

    await page.locator('#kit-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('motion', () => {
  test('the toggle animates only transform and opacity', async ({ page }) => {
    await presetTheme(page, 'dark');
    await openKit(page);
    const props = await page.evaluate(() => {
      const all = document.querySelectorAll<HTMLElement>('#kit-theme-toggle *');
      const set = new Set<string>();
      for (const el of all) {
        const p = getComputedStyle(el).transitionProperty;
        if (p && p !== 'all' && getComputedStyle(el).transitionDuration !== '0s') p.split(',').forEach((x) => set.add(x.trim()));
      }
      return [...set];
    });
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(['transform', 'opacity']).toContain(p);
  });
});
