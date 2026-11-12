import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';
import { content } from './support/content';

/**
 * The welcome popup (phones only for now): shown once to a first-time visitor (the rest of the
 * suite starts as a returning visitor, see playwright.config.ts). It opens on a foil pack that
 * is torn open (drag, tap or keyboard); the card back rises out, flips, and the buttons and
 * the name tag follow. Closable by Esc / the X / the backdrop at any moment.
 */
// The first visit loads the popup's code, the shader and the fonts on demand; on a cold dev server that
// can take a few seconds, so give the assertions more room than the default 5s.
const expect = baseExpect.configure({ timeout: 15_000 });

const popup = content.getSite().popup;
const SEEN = 'kk-welcome-seen';

// A first-time visitor: no stored flag.
// The test browser draws WebGL in software: render the pack at 1x so parallel workers do not starve each other.
test.use({ storageState: { cookies: [], origins: [] }, deviceScaleFactor: 1 });

function dialog(page: Page) {
  return page.getByTestId('welcome-popup');
}

function tear(page: Page): Locator {
  return dialog(page).locator('[data-popup-tear]');
}

async function expectStage(page: Page, stage: string, timeout = 10_000): Promise<void> {
  await expect(dialog(page)).toHaveAttribute('data-popup-stage', stage, { timeout });
}

/** Tear the pack open with a tap and wait until the card, buttons and tag are all in. */
/**
 * While nobody touches it, the finger slides along the line and back on its own (an idle demo).
 * Wait for it to be back at the start of the line, so a tap or a drag aims at where it really is.
 */
async function fingerAtRest(page: Page): Promise<void> {
  await expect(tear(page)).toBeVisible();
  await expect
    .poll(() => tear(page).evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41), { timeout: 10_000, intervals: [50] })
    .toBeLessThan(0.5);
}

async function tearOpen(page: Page): Promise<void> {
  await expect(tear(page)).toBeVisible();
  await fingerAtRest(page);
  await tear(page).click();
  await expectStage(page, 'done');
}

test.describe('on a desktop screen', () => {
  test.beforeEach(({ page }, info) => {
    test.skip(page.isClosed() || info.project.name !== 'desktop', 'desktop only');
  });

  test('shows to a first-time visitor too, once, sized to the window', async ({ page }) => {
    await page.goto('./');
    await expect(dialog(page)).toBeVisible();
    await expectStage(page, 'pack');
    // 1280 x 800: 800 / 860.
    await expect(dialog(page).locator('[data-popup-content]')).toHaveAttribute('data-popup-scale', '0.93');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SEEN)).toBe('1');
    await page.reload();
    await expect(page.getByTestId('track-page')).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('on a big monitor it is bigger, drawn sharp, and the finger can still be dragged to tear it', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page).locator('[data-popup-content]')).toHaveAttribute('data-popup-scale', '1.256');
    const pack = dialog(page).locator('[data-popup-pack]');
    await expect(pack).toHaveAttribute('data-ready', 'true');
    // The pack is drawn at the size it is shown, not stretched.
    const size = await pack.evaluate((canvas: HTMLCanvasElement) => ({ shown: canvas.getBoundingClientRect().width, drawn: canvas.width }));
    expect(size.shown).toBeGreaterThan(300 * 1.2);
    expect(size.drawn).toBeGreaterThanOrEqual(Math.floor(size.shown) - 1);
    await fingerAtRest(page);
    const box = (await tear(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 + i * 30, y);
    await page.mouse.up();
    await expectStage(page, 'done');
  });

  test('resizing the window resizes the popup, within its limits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('./?popup=1');
    const content = dialog(page).locator('[data-popup-content]');
    await expect(content).toHaveAttribute('data-popup-scale', '1.047');
    await page.setViewportSize({ width: 1366, height: 600 });
    await expect(content).toHaveAttribute('data-popup-scale', '0.85');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await expect(content).toHaveAttribute('data-popup-scale', '1.35');
  });
});

test.describe('welcome popup', () => {
  test.beforeEach(({ page }, info) => {
    test.skip(page.isClosed() || info.project.name !== 'mobile', 'the popup is shown on phones only');
  });

  test('the owner has it switched on, with the pack, and the wording from the canvas', () => {
    expect(popup.enabled).toBe(true);
    expect(popup.packEnabled).toBe(true);
    expect(popup.heading).not.toBe('');
    expect(popup.packHeading).not.toBe('');
    expect(popup.gameLabel).not.toBe('');
    expect(popup.softLabel).not.toBe('');
  });

  test('shows to a first-time visitor on the sealed pack, once, and locks the page behind it', async ({ page }) => {
    await page.goto('./');
    await expect(dialog(page)).toBeVisible();
    await expectStage(page, 'pack');
    await expect(dialog(page).getByRole('heading', { name: popup.packHeading })).toBeVisible();
    await expect(dialog(page)).toBeFocused();
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), SEEN)).toBe('1');

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

  test('the card, the buttons and the tag are out of reach until they arrive', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page).locator('[data-popup-card]')).toHaveAttribute('inert', '');
    await expect(dialog(page).locator('[data-popup-tag]')).toHaveAttribute('inert', '');
    await expect(dialog(page).locator('[data-popup-action="game"]')).toBeHidden();
    await tearOpen(page);
    await expect(dialog(page).locator('[data-popup-card]')).not.toHaveAttribute('inert', '');
    await expect(dialog(page).locator('[data-popup-action="game"]')).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: popup.heading })).toBeVisible();
  });

  test('a finger slides along the dotted line on its own, the pack stays shut, and no instruction text is shown', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    const offset = () => tear(page).evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
    // The finger moves by itself, a good way along the line...
    await expect.poll(offset, { timeout: 8_000 }).toBeGreaterThan(80);
    // ...but nothing is torn, and no instruction is written on screen (a screen reader still gets it).
    await expectStage(page, 'pack');
    await expect(dialog(page).getByText(popup.packHint, { exact: true })).toHaveCount(0);
    await expect(tear(page)).toHaveAttribute('aria-label', new RegExp(popup.packHint));
  });

  test('snow falls over the pack and is gone once the pack is torn', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    // The snow is drawn in the pack's own canvas (a second, tiny shader), so it drops away with it.
    await expect(dialog(page).locator('[data-popup-pack][data-ready="true"]')).toHaveAttribute('data-popup-snow', 'on');
    await tearOpen(page);
    await expect(dialog(page).locator('[data-popup-pack]')).toHaveCount(0);
  });

  test('touching the finger stops the idle demo', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(tear(page)).toBeVisible();
    const offset = () => tear(page).evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
    await fingerAtRest(page);
    const box = await tear(page).boundingBox();
    if (!box) throw new Error('the handle has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const held = await offset();
    await page.waitForTimeout(700);
    expect(await offset()).toBeCloseTo(held, 0);
    await page.mouse.up();
  });

  test('tapping the finger tears the pack: the stages follow in order and the pack goes', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page).locator('[data-popup-pack]')).toHaveAttribute('data-ready', 'true');
    // Record every stage the dialog goes through (a stage can be shorter than a poll).
    await page.evaluate(() => {
      const target = document.querySelector('[data-testid="welcome-popup"]')!;
      const log: string[] = [target.getAttribute('data-popup-stage') ?? ''];
      (window as unknown as { __stages: string[] }).__stages = log;
      new MutationObserver(() => log.push(target.getAttribute('data-popup-stage') ?? '')).observe(target, { attributes: true, attributeFilter: ['data-popup-stage'] });
    });
    await fingerAtRest(page);
    await tear(page).click();
    await expectStage(page, 'done');
    const seen = await page.evaluate(() => (window as unknown as { __stages: string[] }).__stages);
    expect(seen.filter((name) => name !== 'pack')).toEqual(['torn', 'rise', 'out', 'flip', 'done']);
    await expect(dialog(page).locator('[data-popup-pack]')).toHaveCount(0);
    await expect(tear(page)).toHaveCount(0);
  });

  test('dragging the finger along the line tears the pack', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page).locator('[data-popup-pack]')).toHaveAttribute('data-ready', 'true');
    await fingerAtRest(page);
    const box = (await tear(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, y);
    await page.mouse.up();
    await expectStage(page, 'done');
  });

  test('letting go halfway puts the strip back', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page).locator('[data-popup-pack]')).toHaveAttribute('data-ready', 'true');
    await fingerAtRest(page);
    const box = (await tear(page).boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) await page.mouse.move(box.x + box.width / 2 + i * 20, y);
    await page.mouse.up();
    await page.waitForTimeout(600);
    await expectStage(page, 'pack');
    await expect(tear(page)).toBeVisible();
    // and it still tears afterwards
    await tearOpen(page);
  });

  test('the finger works from the keyboard', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await expect(dialog(page)).toBeFocused();
    for (let step = 0; step < 4 && !(await tear(page).evaluate((element) => element === document.activeElement)); step++) await page.keyboard.press('Tab');
    await expect(tear(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expectStage(page, 'done');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="welcome-popup"]'))).toBe(true);
  });

  test('without WebGL the card is shown straight away', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('./?popup=1');
    await expectStage(page, 'done');
    await expect(tear(page)).toHaveCount(0);
    await expect(dialog(page).locator('[data-popup-action="game"]')).toBeVisible();
  });

  test('with reduced motion there is no pack: everything is simply shown', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./?popup=1');
    await expectStage(page, 'done', 3000);
    await expect(tear(page)).toHaveCount(0);
    await expect(dialog(page).locator('[data-popup-tag]')).toHaveCSS('opacity', '1');
    await expect(dialog(page).locator('[data-popup-card]')).toHaveCSS('opacity', '1');
  });

  test('the X, Esc and a click on the black around it all close it, even on the pack', async ({ page }) => {
    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    // The X is there from the start: no need to open the pack to leave.
    await expectStage(page, 'pack');
    await expect(dialog(page).getByRole('button', { name: 'Close the popup' })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Close the popup' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');

    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    await expectStage(page, 'pack');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');

    await page.goto('./?popup=1');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).click({ position: { x: 2, y: 2 } });
    await expect(dialog(page)).toHaveCount(0);

    await page.goto('./?popup=1');
    await tearOpen(page);
    await expect(dialog(page).getByRole('button', { name: 'Close the popup' })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Close the popup' }).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('keeps Tab inside the popup, on the pack and after it', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    for (let step = 0; step < 5; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="welcome-popup"]'))).toBe(true);
    }
    await tearOpen(page);
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
    await tearOpen(page);
    await dialog(page).locator('[data-popup-action="softdev"]').click();
    await expect(page).toHaveURL(new RegExp(`/${soft.route}$`));
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('track-page')).toHaveAttribute('data-track', 'softdev');

    await page.goto(`./${soft.route}?popup=1`);
    await tearOpen(page);
    await dialog(page).locator('[data-popup-action="game"]').click();
    await expect(page).toHaveURL(new RegExp(`/${game.route}$`));
    await expect(page.getByTestId('track-page')).toHaveAttribute('data-track', 'game');
  });

  test('Discord copies the username, Say hi writes to the site address, and Resume is gone', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const site = content.getSite();
    await page.goto('./?popup=1');
    await tearOpen(page);
    await expect(dialog(page).locator('[data-popup-resume]')).toHaveCount(0);
    const discord = dialog(page).locator('[data-popup-discord]');
    await expect(discord).toContainText(site.popup.discordHandle);
    await discord.click();
    await expect(discord).toContainText('Copied!');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(site.popup.discordHandle);
    await expect(dialog(page).locator('[data-popup-mail]')).toHaveAttribute('href', `mailto:${site.email}`);
  });

  test('the name tag waits behind the card and falls out of it once the card is open', async ({ page }) => {
    await page.goto('./?popup=1');
    const tag = dialog(page).locator('[data-popup-tag]');
    const card = dialog(page).locator('[data-popup-card]');
    await expectStage(page, 'pack');
    expect(await tag.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
    await tearOpen(page);
    expect(Number(await card.evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThan(Number(await tag.evaluate((element) => getComputedStyle(element).zIndex)));
    await expect(tag).toHaveCSS('opacity', '1', { timeout: 4000 });
    await page.waitForTimeout(1500);
    const cardBox = (await card.boundingBox())!;
    const tagBox = (await tag.boundingBox())!;
    expect(tagBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height - 2);
  });

  test('only transform and opacity are animated', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await fingerAtRest(page);
    await tear(page).click();
    const props = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const found = await page.evaluate(() => {
        const names: string[] = [];
        for (const animation of document.getAnimations()) {
          const effect = animation.effect as KeyframeEffect | null;
          if (!effect || !(effect.target instanceof Element) || !effect.target.closest('[data-testid="welcome-popup"]')) continue;
          for (const frame of effect.getKeyframes()) {
            for (const key of Object.keys(frame)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(key)) names.push(key);
          }
        }
        return names;
      });
      found.forEach((name) => props.add(name));
      await page.waitForTimeout(150);
    }
    expect(props.size).toBeGreaterThan(0);
    for (const prop of props) expect(['opacity', 'transform']).toContain(prop);
  });

  test('has no accessibility violations, on the pack and on the card', async ({ page }) => {
    await page.goto('./?popup=1');
    await expectStage(page, 'pack');
    await page.waitForTimeout(400);
    const first = await new AxeBuilder({ page }).include('[data-testid="welcome-popup"]').analyze();
    expect(first.violations, JSON.stringify(first.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
    await tearOpen(page);
    await page.waitForTimeout(1500);
    const second = await new AxeBuilder({ page }).include('[data-testid="welcome-popup"]').analyze();
    expect(second.violations, JSON.stringify(second.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))).toEqual([]);
  });
});
