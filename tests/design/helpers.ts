import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The design kit, served by the Vite dev server from the design agent's own entry
 * (src/dev/kit.html) so these specs do not depend on the /__kit route owned by infra.
 * Relative to the Playwright baseURL (http://localhost:<PW_PORT>/kishan-kahodariya/).
 */
export const KIT_PATH = 'src/dev/kit.html';

export type Theme = 'dark' | 'light';
export type Track = 'game' | 'softdev';

export const THEMES: Theme[] = ['dark', 'light'];
export const TRACKS: Track[] = ['game', 'softdev'];

/**
 * Stores an explicit theme choice before any page script runs (same key as the app).
 * Init scripts run on every navigation, so a sessionStorage flag limits the preset to the
 * first load — later reloads must see whatever the page itself stored.
 */
export async function presetTheme(page: Page, theme: Theme | null): Promise<void> {
  await page.addInitScript((value) => {
    if (window.sessionStorage.getItem('kk-test-preset')) return;
    window.sessionStorage.setItem('kk-test-preset', '1');
    if (value) window.localStorage.setItem('kk-theme', value);
    else window.localStorage.removeItem('kk-theme');
  }, theme);
}

export async function openKit(page: Page, track: Track = 'game'): Promise<void> {
  await page.goto(`${KIT_PATH}?track=${track}`);
  await page.locator(`main[data-testid="kit"][data-track="${track}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

/** The theme toggle in the kit header (the first of several on the page). */
export function headerToggle(page: Page) {
  return page.locator('#kit-theme-toggle');
}

/** The theme toggle's drawn size and the knob's place in it, in CSS px (src/theme/ThemeToggle.module.css). */
export const TOGGLE = {
  pillWidth: 48,
  pillHeight: 22,
  minHitArea: 44,
  knobSize: 16,
  /** Width of the ring drawn inside the pill's edge; the knob must stay clear of it. */
  ring: 1.5,
  /** Knob centre, measured from the pill's left edge: on the left by day, on the right by night. */
  knobCentre: { day: 11, night: 37 },
} as const;

export type ToggleState = keyof typeof TOGGLE.knobCentre;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Boxes of a theme toggle's button (the hit area), its pill and its knob, as laid out right now. */
export function toggleBoxes(toggle: Locator): Promise<{ button: Box; pill: Box; knob: Box; skies: Box[] }> {
  return toggle.evaluate((button) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const pill = button.querySelector('[data-theme-toggle-pill]');
    const knob = button.querySelector('[data-theme-toggle-knob]');
    if (!pill || !knob) throw new Error('The theme toggle has no pill or no knob.');
    const skies = [...pill.children].filter((child) => child !== knob).map(box);
    return { button: box(button), pill: box(pill), knob: box(knob), skies };
  });
}

/**
 * The theme toggle's geometry in one state: a 48 × 22 pill centred in a hit area of at least
 * 44 × 44, both skies covering the pill exactly, and the 16px knob at rest on the right side for
 * that state, vertically centred and wholly inside the pill's ring. Waits for the knob's slide.
 */
export async function expectToggleGeometry(toggle: Locator, state: ToggleState, label = 'theme toggle'): Promise<void> {
  await expect(toggle, label).toHaveAttribute('aria-checked', String(state === 'day'));
  // The knob slides with a transform; its centre does not depend on the hover scale.
  await expect
    .poll(async () => {
      const { pill, knob } = await toggleBoxes(toggle);
      return Math.round(((knob.left + knob.right) / 2 - pill.left) * 10) / 10;
    }, { message: `${label}: knob centre from the pill's left edge (${state})` })
    .toBe(TOGGLE.knobCentre[state]);

  const { button, pill, knob, skies } = await toggleBoxes(toggle);
  expect(pill.width, `${label}: pill width`).toBeCloseTo(TOGGLE.pillWidth, 1);
  expect(pill.height, `${label}: pill height`).toBeCloseTo(TOGGLE.pillHeight, 1);

  expect(button.width, `${label}: hit area width`).toBeGreaterThanOrEqual(TOGGLE.minHitArea);
  expect(button.height, `${label}: hit area height`).toBeGreaterThanOrEqual(TOGGLE.minHitArea);
  // The pill is inside the hit area and centred in it.
  expect(pill.left, `${label}: pill inside the hit area (left)`).toBeGreaterThanOrEqual(button.left - 0.05);
  expect(pill.right, `${label}: pill inside the hit area (right)`).toBeLessThanOrEqual(button.right + 0.05);
  expect((pill.left + pill.right) / 2, `${label}: pill centred horizontally`).toBeCloseTo((button.left + button.right) / 2, 1);
  expect((pill.top + pill.bottom) / 2, `${label}: pill centred vertically`).toBeCloseTo((button.top + button.bottom) / 2, 1);

  // Both skies fill the pill edge to edge (nothing clipped short, nothing off-centre).
  expect(skies, `${label}: night and day sky`).toHaveLength(2);
  for (const sky of skies) {
    expect(sky.left, `${label}: sky left`).toBeCloseTo(pill.left, 1);
    expect(sky.top, `${label}: sky top`).toBeCloseTo(pill.top, 1);
    expect(sky.width, `${label}: sky width`).toBeCloseTo(pill.width, 1);
    expect(sky.height, `${label}: sky height`).toBeCloseTo(pill.height, 1);
  }

  // The knob: round, vertically centred, and clear of the ring on every side.
  expect(knob.width, `${label}: knob is as wide as it is tall`).toBeCloseTo(knob.height, 1);
  expect(knob.width, `${label}: knob size`).toBeGreaterThanOrEqual(TOGGLE.knobSize - 0.05);
  expect((knob.top + knob.bottom) / 2, `${label}: knob centred vertically`).toBeCloseTo((pill.top + pill.bottom) / 2, 1);
  expect(knob.left - pill.left, `${label}: knob clear of the ring (left)`).toBeGreaterThanOrEqual(TOGGLE.ring);
  expect(pill.right - knob.right, `${label}: knob clear of the ring (right)`).toBeGreaterThanOrEqual(TOGGLE.ring);
  expect(knob.top - pill.top, `${label}: knob clear of the ring (top)`).toBeGreaterThanOrEqual(TOGGLE.ring);
  expect(pill.bottom - knob.bottom, `${label}: knob clear of the ring (bottom)`).toBeGreaterThanOrEqual(TOGGLE.ring);
}

/**
 * Where an element draws its keyboard focus ring: on itself, or on the descendant it marks with
 * `data-focus-ring` (the theme toggle rings its small pill, not its taller hit area). Returns the
 * outline of that element while `locator` is focused.
 */
export function focusRingOf(locator: Locator): Promise<{ focused: boolean; style: string; width: number; onChild: boolean; ownStyle: string }> {
  return locator.evaluate((node) => {
    const marked = node.querySelector<HTMLElement>('[data-focus-ring]');
    const target = marked ?? node;
    const style = getComputedStyle(target);
    const visible = target.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    return {
      focused: node === document.activeElement,
      style: visible ? style.outlineStyle : 'none',
      width: visible ? parseFloat(style.outlineWidth) : 0,
      onChild: marked !== null,
      ownStyle: getComputedStyle(node).outlineStyle,
    };
  });
}
