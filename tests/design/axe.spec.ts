import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openKit, presetTheme, THEMES, TRACKS } from './helpers';

/**
 * axe-core over the whole kit in all four theme × track combinations. The kit shows every
 * primitive in every state, so a clean run here means the primitives are clean in context.
 * Colour contrast is included (it is one of the rules that matter most here).
 */
for (const theme of THEMES) {
  for (const track of TRACKS) {
    test(`kit has no axe violations — ${theme} / ${track}`, async ({ page }) => {
      await presetTheme(page, theme);
      await openKit(page, track);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target, summary: n.failureSummary })),
      }));
      expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
    });

    test(`kit's own contrast table reports every pair passing — ${theme} / ${track}`, async ({ page }) => {
      await presetTheme(page, theme);
      await openKit(page, track);
      const rows = page.locator('[data-testid="contrast-table"] tbody tr');
      await expect(rows.first()).toBeVisible();
      const failing = await page.locator('[data-testid="contrast-table"] tbody tr[data-contrast-pass="false"]').allTextContents();
      expect(failing, failing.join('\n')).toEqual([]);
      expect(await rows.count()).toBeGreaterThanOrEqual(16);
    });
  }
}
