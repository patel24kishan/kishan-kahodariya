import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectToggleGeometry } from '../design/helpers';
import { content, routeOf, SECTION_IDS, SECTION_LABELS } from './support/content';
import { cssVar, hexToRgb, openRoute, scrollTo, scrollY, THEMES, waitForScrollToSettle } from './support/page';

/**
 * The motion header and the phone menu, on the real page: see-through over the hero and solid
 * once scrolled, the section in view, the "Get in touch" button, what the phone bar holds, and
 * the full-screen menu as a real modal dialog.
 */
const site = content.getSite();
const track = content.getTrack('game');

function header(page: Page): Locator {
  return page.getByRole('banner');
}

function menu(page: Page): Locator {
  return page.locator('dialog[data-phone-menu]');
}

/** Opacity of the header's solid layer (its ::before): "0" over the hero, "1" once scrolled. */
function solidOpacity(page: Page): Promise<string> {
  return header(page).evaluate((element) => getComputedStyle(element, '::before').opacity);
}

async function landOn(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => document.getElementById(target)!.scrollIntoView({ behavior: 'instant' }), id);
}

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-menu-button]').click();
  const dialog = menu(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('header over the hero and once scrolled', () => {
  for (const theme of THEMES) {
    test(`see-through with white text at the top, a solid bar in the theme's colours once scrolled — ${theme}`, async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track), { theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const bar = header(page);

      // At the top: no background, an on-dark region (white text) in both themes.
      await expect(bar).not.toHaveAttribute('data-scrolled', /.*/);
      await expect(bar).toHaveAttribute('data-on-dark', '');
      expect(await solidOpacity(page)).toBe('0');
      await expect(bar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(bar).toHaveCSS('color', 'rgb(255, 255, 255)');
      if (!isMobile) await expect(bar.locator('nav a').first()).toHaveCSS('color', 'rgb(204, 204, 204)');
      // The hero starts under it: the bar takes no room in the page.
      expect(await page.locator('#about').evaluate((hero) => Math.round(hero.getBoundingClientRect().top))).toBe(0);
      const before = await bar.boundingBox();
      expect(before!.y).toBe(0);
      expect(before!.width).toBe(page.viewportSize()!.width);

      await scrollTo(page, 400);
      await expect(bar).toHaveAttribute('data-scrolled', '');
      await expect(bar).not.toHaveAttribute('data-on-dark', /.*/);
      await expect.poll(() => solidOpacity(page)).toBe('1');
      const solid = await bar.evaluate((element) => {
        const layer = getComputedStyle(element, '::before');
        return { background: layer.backgroundColor, line: layer.borderBottomColor, lineWidth: layer.borderBottomWidth };
      });
      const html = page.locator('html');
      expect(solid.background).toBe(hexToRgb(await cssVar(html, '--color-canvas')));
      expect(solid.line).toBe(hexToRgb(await cssVar(html, '--color-hairline')));
      expect(solid.lineWidth).toBe('1px');
      // The text follows the theme now.
      await expect(bar).toHaveCSS('color', hexToRgb(await cssVar(html, '--color-ink')));
      expect(await cssVar(html, '--color-ink')).toBe(theme === 'light' ? '#0a0a0a' : '#ffffff');
      // Still at the top of the viewport, and the same box: the change moved nothing.
      const after = await bar.boundingBox();
      expect(after).toEqual(before);

      // Back at the top it is see-through again.
      await scrollTo(page, 0);
      await expect(bar).not.toHaveAttribute('data-scrolled', /.*/);
      await expect.poll(() => solidOpacity(page)).toBe('0');
    });
  }

  test('the solid bar is shorter: 13 + 48 + 13 from 768px, 10 + 48 + 10 on phones, and the row moves with a transform only', async ({ page, isMobile }) => {
    await openRoute(page, routeOf(track));
    const bar = header(page);
    const row = bar.locator('> *').first();
    const logo = bar.locator('a[data-nav-brand]');
    expect((await bar.boundingBox())!.height).toBe(isMobile ? 68 : 74);

    // At the top the logo sits where the board's taller padding puts it (16px / 22px).
    await expect.poll(async () => Math.round((await logo.boundingBox())!.y)).toBe(isMobile ? 16 : 22);
    await scrollTo(page, 400);
    await expect.poll(async () => Math.round((await logo.boundingBox())!.y)).toBe(isMobile ? 10 : 13);
    expect((await bar.boundingBox())!.height).toBe(isMobile ? 68 : 74);

    const transitions = await bar.evaluate((element) => {
      const own = getComputedStyle(element);
      const layer = getComputedStyle(element, '::before');
      const inner = getComputedStyle(element.firstElementChild!);
      return [own.transitionProperty, own.transitionDuration, layer.transitionProperty, inner.transitionProperty];
    });
    // The header itself transitions nothing; its layer fades, its row slides.
    expect(transitions[1]).toBe('0s');
    expect(transitions[2]).toBe('opacity');
    expect(transitions[3]).toBe('transform');
    await expect(row).toBeVisible();
  });

  test('going from one state to the other shifts nothing on the page', async ({ page }) => {
    await page.addInitScript(() => {
      const shifts: number[] = [];
      (window as unknown as { __shifts: number[] }).__shifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) shifts.push((entry as unknown as { value: number }).value);
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await openRoute(page, routeOf(track));
    // Let the page come to rest (reveal, fonts, images), then count from here.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      (window as unknown as { __shifts: number[] }).__shifts.length = 0;
    });
    const mainTop = () => page.locator('main').evaluate((main) => Math.round(main.getBoundingClientRect().top + window.scrollY));
    const top = await mainTop();
    for (const y of [60, 300, 0, 200, 0]) {
      await scrollTo(page, y);
      await page.waitForTimeout(350);
      expect(await mainTop(), `main after scrolling to ${y}`).toBe(top);
    }
    expect(await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts)).toEqual([]);
  });

  test('opened in the middle of the page, the bar is solid as soon as the page is interactive', async ({ page }) => {
    await openRoute(page, routeOf(track), { suffix: '#skills' });
    await expect(header(page)).toHaveAttribute('data-scrolled', '');
    await expect.poll(() => solidOpacity(page)).toBe('1');
  });
});

test.describe('section in view', () => {
  test('no link is marked at the top; once scrolled, the link of the section in view is aria-current', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the links are in the menu on phones (see the menu tests)');
    await openRoute(page, routeOf(track));
    const links = header(page).locator('nav[aria-label="Sections"] a');
    await expect(links).toHaveCount(SECTION_IDS.length);
    await expect(header(page).locator('[aria-current]')).toHaveCount(0);

    // A little way into the hero: About.
    await scrollTo(page, 120);
    await expect(header(page).locator('[aria-current="true"]')).toHaveText('About');

    for (const [index, id] of SECTION_IDS.entries()) {
      if (id === 'about') continue;
      await landOn(page, id);
      const current = header(page).locator('[aria-current="true"]');
      await expect(current, `landed on #${id}`).toHaveCount(1);
      await expect(current).toHaveText(SECTION_LABELS[index]!);
      await expect(current).toHaveAttribute('href', `#${id}`);
      // Highlighted: the ink colour, where the others are the body colour.
      const html = page.locator('html');
      await expect(current).toHaveCSS('color', hexToRgb(await cssVar(html, '--color-ink')));
      const others = links.filter({ hasNotText: SECTION_LABELS[index]! });
      await expect(others.first()).toHaveCSS('color', hexToRgb(await cssVar(html, '--color-body')));
    }

    // The very end of the page is the last section, however short it is.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(header(page).locator('[aria-current="true"]')).toHaveText(SECTION_LABELS[SECTION_LABELS.length - 1]!);

    await scrollTo(page, 0);
    await expect(header(page).locator('[aria-current]')).toHaveCount(0);
  });

  test('clicking a link marks that section when the scroll has settled', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the links are in the menu on phones');
    await openRoute(page, routeOf(track));
    await header(page).getByRole('link', { name: 'Experience', exact: true }).click();
    await waitForScrollToSettle(page);
    await expect(header(page).locator('[aria-current="true"]')).toHaveText('Experience');
  });
});

test.describe('header contents', () => {
  test('desktop: logo and name, the links, then "Get in touch" and the theme toggle at the far right', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop layout');
    await openRoute(page, routeOf(track));
    const bar = header(page);
    const name = bar.locator('[data-nav-name]');
    await expect(name).toBeVisible();
    await expect(name).toHaveText(site.name);
    await expect(name).toHaveCSS('text-transform', 'uppercase');
    // The link already carries the name for assistive technology.
    await expect(name).toHaveAttribute('aria-hidden', 'true');

    const contact = bar.locator('a[data-nav-contact]');
    await expect(contact).toBeVisible();
    await expect(contact).toHaveText(site.contactLabel);
    await expect(contact).toHaveAttribute('href', `mailto:${site.email}`);
    await expect(contact).not.toHaveAttribute('target', /.*/);
    await expect(contact.locator('svg[data-icon="external"]')).toHaveCount(1);

    const toggle = bar.getByRole('switch');
    await expect(toggle).toBeVisible();
    await expect(bar.locator('[data-menu-button]')).toBeHidden();

    const boxes = await Promise.all([bar.locator('a[data-nav-brand]'), name, bar.locator('nav[aria-label="Sections"]'), contact, toggle].map((part) => part.boundingBox()));
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.x, `part ${index} starts after part ${index - 1}`).toBeGreaterThanOrEqual(boxes[index - 1]!.x + boxes[index - 1]!.width);
    }
    expect(boxes[3]!.height).toBeGreaterThanOrEqual(44);

    // Tab order is the visual order: the last link, the button, the toggle.
    await bar.getByRole('link', { name: 'Education', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(contact).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
  });

  test('phone: only the logo and the menu button; no theme toggle, no links, no contact button in the bar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone layout');
    await openRoute(page, routeOf(track));
    const bar = header(page);
    await expect(bar.locator('a[data-nav-brand]')).toBeVisible();
    const button = bar.locator('[data-menu-button]');
    await expect(button).toBeVisible();
    await expect(bar.getByRole('switch')).toHaveCount(0);
    await expect(bar.locator('[data-theme-toggle]')).toBeHidden();
    await expect(bar.locator('nav[aria-label="Sections"]')).toBeHidden();
    await expect(bar.locator('[data-nav-contact]')).toBeHidden();
    await expect(bar.locator('[data-nav-name]')).toBeHidden();
    // Nothing else is drawn in the bar.
    const drawn = await bar.locator('a[href], button').evaluateAll((controls) => controls.filter((control) => control.getClientRects().length > 0).length);
    expect(drawn).toBe(2);

    const [logoBox, buttonBox] = await Promise.all([bar.locator('a[data-nav-brand]').boundingBox(), button.boundingBox()]);
    const gutter = parseFloat(await cssVar(page.locator('html'), '--gutter'));
    expect(logoBox!.x).toBeCloseTo(gutter, 0);
    expect(buttonBox!.x + buttonBox!.width).toBeCloseTo(page.viewportSize()!.width - gutter, 0);
    expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  });

  for (const width of [768, 900, 1024, 1280, 1440]) {
    test(`at ${width}px everything in the bar fits on one line without overlapping`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'desktop widths');
      await page.setViewportSize({ width, height: 800 });
      await openRoute(page, routeOf(track));
      const boxes = await header(page)
        .locator('a[data-nav-brand], [data-nav-name], nav a, a[data-nav-contact], [role="switch"]')
        .evaluateAll((parts) =>
          parts
            .filter((part) => part.getClientRects().length > 0)
            .map((part) => {
              const rect = part.getBoundingClientRect();
              return { left: rect.left, right: rect.right, middle: rect.top + rect.height / 2, label: (part.textContent ?? '').trim() || part.tagName };
            }),
        );
      expect(boxes.length).toBeGreaterThanOrEqual(8);
      for (let index = 1; index < boxes.length; index += 1) {
        expect(boxes[index]!.left, `"${boxes[index]!.label}" after "${boxes[index - 1]!.label}"`).toBeGreaterThanOrEqual(boxes[index - 1]!.right - 0.5);
        expect(Math.abs(boxes[index]!.middle - boxes[0]!.middle)).toBeLessThanOrEqual(1);
      }
      expect(boxes[0]!.left).toBeGreaterThanOrEqual(0);
      expect(boxes[boxes.length - 1]!.right).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      // The name beside the logo is shown where there is room for it.
      await expect(header(page).locator('[data-nav-name]')).toBeVisible({ visible: width >= 1280 });
    });
  }
});

test.describe('phone menu', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'the menu is the phone layout');
  });

  test('closed, there is nothing to focus or announce; open, it is a full-screen modal dialog with the links, the button and the theme toggle', async ({ page }) => {
    await openRoute(page, routeOf(track));
    const button = page.locator('[data-menu-button]');
    await expect(button).toHaveAccessibleName('Open menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const dialog = await openMenu(page);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(button).toHaveAttribute('aria-controls', await dialog.evaluate((element) => element.id));
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(1);
    expect(await dialog.evaluate((element) => (element as HTMLDialogElement).open && element.matches(':modal'))).toBe(true);
    // Full screen, above everything.
    const viewport = page.viewportSize()!;
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    const onTop = await page.evaluate(() => document.elementFromPoint(20, window.innerHeight - 20)?.closest('dialog[data-phone-menu]') !== null);
    expect(onTop).toBe(true);
    // Dark in both themes.
    await expect(dialog).toHaveAttribute('data-on-dark', /.*/);
    await expect(dialog).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.96)');

    const links = dialog.locator('a[data-menu-link]');
    await expect(links).toHaveCount(SECTION_IDS.length);
    for (const [index, id] of SECTION_IDS.entries()) {
      await expect(links.nth(index)).toHaveText(SECTION_LABELS[index]!);
      await expect(links.nth(index)).toHaveAttribute('href', `#${id}`);
    }
    await expect(links.first()).toHaveCSS('font-weight', '800');
    await expect(links.first()).toHaveCSS('text-transform', 'uppercase');
    expect(parseFloat(await links.first().evaluate((link) => getComputedStyle(link).fontSize))).toBeGreaterThanOrEqual(32);

    const contact = dialog.locator('a[data-menu-contact]');
    await expect(contact).toHaveText(site.contactLabel);
    await expect(contact).toHaveAttribute('href', `mailto:${site.email}`);
    const themeRow = dialog.locator('[data-menu-theme]');
    await expect(themeRow).toContainText('Theme');
    const toggle = themeRow.getByRole('switch');
    await expect(toggle).toBeVisible();

    // Top to bottom: the links, the button, the theme row.
    await expect(themeRow).toHaveCSS('opacity', '1');
    const tops = await Promise.all([...Array.from({ length: SECTION_IDS.length }, (_, index) => links.nth(index)), contact, themeRow].map(async (part) => (await part.boundingBox())!.y));
    for (let index = 1; index < tops.length; index += 1) expect(tops[index]!).toBeGreaterThan(tops[index - 1]!);
    // Every control is a 44px target.
    for (const control of [...(await dialog.locator('a[href], button').all())]) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    // The close button is exactly where the menu button is.
    const [closeBox, buttonBox] = await Promise.all([dialog.locator('[data-menu-close]').boundingBox(), button.boundingBox()]);
    expect(closeBox).toEqual(buttonBox);
  });

  test('focus moves in, Tab and Shift+Tab stay inside, Esc closes and gives focus back to the menu button', async ({ page }) => {
    await openRoute(page, routeOf(track));
    const button = page.locator('[data-menu-button]');
    const dialog = await openMenu(page);
    const close = dialog.getByRole('button', { name: 'Close menu' });
    await expect(close).toBeFocused();

    const inside = () => page.evaluate(() => document.activeElement?.closest('dialog[data-phone-menu]') !== null);
    const count = await dialog.locator('a[href], button').count();
    expect(count).toBe(SECTION_IDS.length + 3);
    const seen = new Set<string>();
    for (let step = 0; step < count * 2; step += 1) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${step + 1}`).toBe(true);
      seen.add(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''));
    }
    expect(seen.size, 'every control was reached').toBe(count);
    // From the first control, Shift+Tab wraps to the last one (the theme toggle).
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('switch')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();

    // The close button does the same.
    await button.click();
    await menu(page).getByRole('button', { name: 'Close menu' }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('the page behind does not scroll while it is open, and is as it was afterwards', async ({ page }) => {
    await openRoute(page, routeOf(track));
    await scrollTo(page, 300);
    const dialog = await openMenu(page);
    // Read after opening: Playwright's own tap may nudge the page while it aims at the button.
    const position = await scrollY(page);
    expect(Math.abs(position - 300)).toBeLessThanOrEqual(16);
    await expect(dialog).toHaveCSS('overscroll-behavior-y', 'contain');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');

    const box = (await dialog.boundingBox())!;
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.wheel(0, 600);
    await page.touchscreen.tap(box.width / 2, box.height - 30);
    await page.waitForTimeout(300);
    expect(await scrollY(page)).toBe(position);
    // A tap on the empty part of the menu does not close it.
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(await scrollY(page)).toBe(position);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(position);
  });

  test('choosing a link closes it and lands that section just below the bar', async ({ page }) => {
    await openRoute(page, routeOf(track));
    const dialog = await openMenu(page);
    await dialog.getByRole('link', { name: 'Skills', exact: true }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator('[data-menu-button]')).toHaveAttribute('aria-expanded', 'false');
    expect(new URL(page.url()).hash).toBe('#skills');
    const barHeight = (await header(page).boundingBox())!.height;
    await expect
      .poll(async () => Math.round(await page.locator('#skills').evaluate((section) => section.getBoundingClientRect().top)), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(barHeight - 1);
    await waitForScrollToSettle(page);
    const top = await page.locator('#skills').evaluate((section) => section.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(barHeight - 1);
    expect(top).toBeLessThanOrEqual(barHeight + 24);
    // The page scrolls again, and the menu marks the section in view next time.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    const again = await openMenu(page);
    await expect(again.locator('[aria-current="true"]')).toHaveText('Skills');
  });

  test('the theme toggle inside it switches the theme, keeps the choice, and the menu stays open', async ({ page }) => {
    await openRoute(page, routeOf(track), { theme: 'dark' });
    const dialog = await openMenu(page);
    const toggle = dialog.getByRole('switch');
    await expect(toggle).toHaveAccessibleName('Switch to light mode');
    await expect(dialog.locator('[data-menu-theme]')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(700);
    await expectToggleGeometry(toggle, 'night', 'menu toggle');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleName('Switch to dark mode');
    expect(await page.evaluate(() => localStorage.getItem('kk-theme'))).toBe('light');
    await expect(dialog).toBeVisible();
    await expectToggleGeometry(toggle, 'day', 'menu toggle');
    // The menu itself stays dark.
    await expect(dialog).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.96)');
    await expect(dialog.locator('a[data-menu-link]').first()).toHaveCSS('color', 'rgb(255, 255, 255)');

    // From the keyboard too, and the choice survives a reload.
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Space');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the rows slide up in turn, with opacity and transform only', async ({ page }) => {
    await openRoute(page, routeOf(track));
    await page.locator('[data-menu-button]').click();
    const rows = await menu(page)
      .locator('li, div')
      .evaluateAll((list) =>
        list
          .filter((row) => getComputedStyle(row).animationName !== 'none')
          .map((row) => {
            const style = getComputedStyle(row);
            return { delay: parseFloat(style.animationDelay), duration: parseFloat(style.animationDuration) };
          }),
      );
    expect(rows).toHaveLength(SECTION_IDS.length + 2);
    for (let index = 1; index < rows.length; index += 1) expect(rows[index]!.delay).toBeGreaterThan(rows[index - 1]!.delay);
    for (const row of rows) expect(row.duration).toBeGreaterThan(0);
    // When they have arrived everything is fully there.
    await expect(menu(page).locator('[data-menu-theme]')).toHaveCSS('opacity', '1');
    await expect(menu(page).locator('[data-menu-theme]')).toHaveCSS('transform', /none|matrix\(1, 0, 0, 1, 0, 0\)/);
    const transitions = await menu(page)
      .locator('*')
      .evaluateAll((all) => [...new Set(all.filter((element) => getComputedStyle(element).transitionDuration !== '0s').flatMap((element) => getComputedStyle(element).transitionProperty.split(',').map((name) => name.trim())))]);
    for (const property of transitions) expect(['opacity', 'transform']).toContain(property);
  });

  test('fits at 320px with nothing poking out sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openRoute(page, routeOf(track));
    const dialog = await openMenu(page);
    await expect(dialog.locator('[data-menu-theme]')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(600);
    const poking = await dialog.locator('*').evaluateAll((all) =>
      all
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.right > 320.5 || rect.left < -0.5);
        })
        .map((element) => `${element.tagName.toLowerCase()}.${String(element.getAttribute('class'))}`),
    );
    expect(poking, poking.join('\n')).toEqual([]);
    expect(await dialog.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320);
    // A short screen scrolls inside the menu, so the theme toggle can always be reached.
    await dialog.getByRole('switch').scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('switch')).toBeInViewport();
  });

  test('it closes by itself when the window becomes wide enough for the inline links', async ({ page }) => {
    await openRoute(page, routeOf(track));
    await openMenu(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(menu(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    await expect(header(page).locator('nav[aria-label="Sections"]')).toBeVisible();
  });

  for (const theme of THEMES) {
    test(`open, the page has no axe violations — ${theme}`, async ({ page }) => {
      await openRoute(page, routeOf(track), { theme });
      const dialog = await openMenu(page);
      await expect(dialog.locator('[data-menu-theme]')).toHaveCSS('opacity', '1');
      await page.waitForTimeout(700);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((violation) => ({ id: violation.id, help: violation.help, nodes: violation.nodes.slice(0, 5).map((node) => node.target) }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
      // And the menu on its own, so nothing is skipped as "behind a modal".
      const own = await new AxeBuilder({ page }).include('dialog[data-phone-menu]').analyze();
      expect(own.violations.map((violation) => violation.id)).toEqual([]);
    });
  }
});

test.describe('phone menu under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('opens at once: nothing animates and everything is visible', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the menu is the phone layout');
    await openRoute(page, routeOf(track));
    await page.locator('[data-menu-button]').click();
    const states = await menu(page)
      // The dialog, its rows and its controls (not the insides of the theme toggle, whose
      // hidden sky is at opacity 0 by design).
      .locator('xpath=descendant-or-self::*[self::dialog or self::div or self::ul or self::li or self::a or self::button]')
      .evaluateAll((all) => all.map((element) => ({ animation: getComputedStyle(element).animationName, opacity: getComputedStyle(element).opacity })));
    expect(states.length).toBeGreaterThan(15);
    for (const state of states) expect(state).toEqual({ animation: 'none', opacity: '1' });
    // The header's own change is instant as well.
    await page.keyboard.press('Escape');
    expect(await header(page).evaluate((element) => getComputedStyle(element.firstElementChild!).transitionDuration)).toBe('0s');
  });
});

test.describe('desktop', () => {
  test('there is no menu button and no menu', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop layout');
    await openRoute(page, routeOf(track));
    await expect(page.locator('[data-menu-button]')).toBeHidden();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveCount(1);
  });
});
