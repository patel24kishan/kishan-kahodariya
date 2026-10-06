/**
 * Records what <html data-theme> was at two moments of a page load:
 *   atBody   — when <body> first exists. The inline theme script sits in <head>, so by then
 *              it must have run: nothing has been painted yet.
 *   atRender — when #root first holds the app's markup with React attached (first render on
 *              the dev server, hydration on a prerendered page).
 * Install with page.addInitScript(installThemeProbe) BEFORE page.goto(); read with readThemeProbe().
 */
import type { Page } from '@playwright/test';

export interface ThemeProbe {
  atBody: string | null;
  atRender: string | null;
  /** The theme-color meta content when <body> first existed. */
  themeColorAtBody: string | null;
}

/** Runs in the browser, before any page script. Must be self-contained. */
export function installThemeProbe(): void {
  const probe: { atBody: string | null; atRender: string | null; themeColorAtBody: string | null } = {
    atBody: null,
    atRender: null,
    themeColorAtBody: null,
  };
  Reflect.set(window, '__kkThemeProbe', probe);
  let sawBody = false;

  const check = (): void => {
    const theme = document.documentElement.getAttribute('data-theme');
    if (!sawBody && document.body) {
      sawBody = true;
      probe.atBody = theme;
      probe.themeColorAtBody = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
    }
    const app = document.querySelector('#root > *');
    if (probe.atRender === null && app && Object.keys(app).some((key) => key.startsWith('__reactFiber$'))) {
      probe.atRender = theme;
      observer.disconnect();
    }
  };
  // DOM changes catch <body> appearing and a client render; hydration changes no DOM, so a
  // per-frame check catches React attaching to markup that was already there.
  const observer = new MutationObserver(check);
  observer.observe(document, { childList: true, subtree: true });
  const everyFrame = (): void => {
    check();
    if (probe.atRender === null) requestAnimationFrame(everyFrame);
  };
  requestAnimationFrame(everyFrame);
}

export async function readThemeProbe(page: Page): Promise<ThemeProbe> {
  await page.waitForFunction(() => {
    const probe: unknown = Reflect.get(window, '__kkThemeProbe');
    return typeof probe === 'object' && probe !== null && Reflect.get(probe, 'atRender') !== null;
  });
  return page.evaluate(() => Reflect.get(window, '__kkThemeProbe') as ThemeProbe);
}

/** The part of the probe that does not need the app to have rendered. */
export async function readThemeAtBody(page: Page): Promise<Pick<ThemeProbe, 'atBody' | 'themeColorAtBody'>> {
  await page.waitForFunction(() => document.body !== null && Reflect.get(window, '__kkThemeProbe') !== undefined);
  return page.evaluate(() => {
    const probe = Reflect.get(window, '__kkThemeProbe') as ThemeProbe;
    return { atBody: probe.atBody, themeColorAtBody: probe.themeColorAtBody };
  });
}
