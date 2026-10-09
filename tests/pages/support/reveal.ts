/**
 * Helpers for the reveal-on-scroll (src/components/motion). Blocks below the fold start hidden
 * (opacity 0, moved down) once JavaScript has run, and a block that has finished its entrance
 * has its marks removed again (`data-reveal`, `data-reveal-state`).
 */
import { expect, type Page } from '@playwright/test';

/** Marked blocks that have not finished their entrance. */
export function pendingReveals(page: Page): Promise<number> {
  return page.locator('[data-reveal]').count();
}

/**
 * Scroll through the whole page so that every block enters the view, wait until every entrance
 * is over (no marks left), and return to the top. Use it before measuring colours (axe) or
 * positions on a page whose lower blocks would otherwise still be waiting or mid-flight.
 */
export async function revealAll(page: Page): Promise<void> {
  const { height, step } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, step: Math.max(200, Math.floor(window.innerHeight * 0.6)) }));
  for (let y = 0; y <= height; y += step) {
    await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: 'instant' }), y);
    await page.waitForTimeout(40);
  }
  await expect.poll(() => pendingReveals(page), { timeout: 15_000 }).toBe(0);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
}
