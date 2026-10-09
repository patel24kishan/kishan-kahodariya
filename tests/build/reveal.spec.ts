import { expect, test } from '@playwright/test';
import { content, routeOf, TRACK_IDS } from '../pages/support/content';
import { relative } from '../infra/support/site-map';

/**
 * Reveal-on-scroll in the production build: the prerendered HTML carries no hidden start state,
 * and a visitor without JavaScript sees every block (nothing at opacity 0, nothing moved).
 */
for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);
  const route = routeOf(track, 'all');

  test.describe(`${track.route} without JavaScript`, () => {
    test('the raw HTML has no reveal marks', async ({ request }) => {
      const html = await (await request.get(relative(route))).text();
      expect(html).not.toContain('data-reveal');
    });

    test.describe('page', () => {
      test.use({ javaScriptEnabled: false });

      test('every section, title, card, job, skill and footer line is visible', async ({ page }) => {
        await page.goto(relative(route));
        await expect(page.locator('#experience h2')).toBeVisible();
        const hidden = await page.evaluate(() => {
          const out: string[] = [];
          for (const element of document.querySelectorAll<HTMLElement>('main > section:not(#about) *, footer *')) {
            const style = getComputedStyle(element);
            if (style.opacity !== '1' && !element.closest('[data-media-label], [aria-hidden="true"]')) out.push(`${element.tagName.toLowerCase()} opacity ${style.opacity}`);
            if (style.transform !== 'none' && !element.closest('[data-media-track], [data-media-label]')) out.push(`${element.tagName.toLowerCase()} transform ${style.transform}`);
          }
          return out;
        });
        expect(hidden.slice(0, 10)).toEqual([]);
        const text = await page.locator('main').innerText();
        for (const group of content.getSkillGroups(trackId)) for (const skill of group.skills) expect(text).toContain(skill);
        for (const entry of content.getExperience(trackId)) expect(text).toContain(entry.company);
        await expect(page.getByRole('contentinfo').getByRole('heading', { level: 2 })).toBeVisible();
      });
    });
  });
}
