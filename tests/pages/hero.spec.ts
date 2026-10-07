import { expect, test } from '@playwright/test';
import { assetHref, content, isExternal, normaliseSpace, paragraphsOf, routeOf, TRACK_IDS } from './support/content';
import { cssVar, hexToRgb, openRoute, trackPage } from './support/page';

/** The hero (#about) on both pages, against the track profile and the hero links. */
const site = content.getSite();

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);
  const heroLinks = content.getLinks(trackId, 'hero');

  test.describe(`${track.route} hero`, () => {
    test('shows the name, the headline in the accent and the summary verbatim', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const hero = page.locator('#about');
      await expect(hero.getByRole('heading', { level: 1 })).toHaveText(site.name);

      if (track.headline) {
        const headline = hero.getByText(track.headline, { exact: true });
        await expect(headline).toBeVisible();
        const accentInk = await cssVar(trackPage(page), '--color-accent-ink');
        await expect(headline).toHaveCSS('color', hexToRgb(accentInk));
      }

      const text = normaliseSpace(await hero.innerText());
      for (const paragraph of paragraphsOf(track.summary)) {
        expect(text).toContain(normaliseSpace(paragraph));
      }
    });

    test('has the resume button and the hero links, in order, as new-tab links', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const resume = page.locator('[data-hero-resume]');
      if (track.resumeUrl.trim()) {
        await expect(resume).toHaveCount(1);
        await expect(resume).toHaveAttribute('href', track.resumeUrl.trim());
        await expect(resume).toHaveText(new RegExp(`^${track.resumeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        if (isExternal(track.resumeUrl)) {
          await expect(resume).toHaveAttribute('target', '_blank');
          await expect(resume).toHaveAttribute('rel', 'noopener noreferrer');
        }
      } else {
        await expect(resume).toHaveCount(0);
      }

      const links = page.locator('[data-hero-link]');
      await expect(links).toHaveCount(heroLinks.length);
      for (const [index, link] of heroLinks.entries()) {
        await expect(links.nth(index)).toHaveAttribute('data-hero-link', link.slug);
        await expect(links.nth(index)).toHaveAttribute('href', link.url);
        await expect(links.nth(index)).toHaveText(new RegExp(`^${link.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        await expect(links.nth(index).locator(`svg[data-icon="${link.icon}"]`)).toHaveCount(1);
        if (isExternal(link.url)) await expect(links.nth(index)).toHaveAttribute('target', '_blank');
        else await expect(links.nth(index)).not.toHaveAttribute('target', '_blank');
      }
    });

    test('the photo is sized, eager and high priority, and it loads', async ({ page }) => {
      test.skip(!track.photo, 'this track has no photo');
      await openRoute(page, routeOf(track));
      const photo = page.locator('img[data-hero-photo]');
      await expect(photo).toHaveCount(1);
      await expect(photo).toHaveAttribute('src', assetHref(track.photo));
      await expect(photo).toHaveAttribute('alt', track.photoAlt);
      await expect(photo).toHaveAttribute('width', /\d+/);
      await expect(photo).toHaveAttribute('height', /\d+/);
      await expect(photo).toHaveAttribute('fetchpriority', 'high');
      await expect(photo).toHaveAttribute('loading', 'eager');
      await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      // Drawn as a circle.
      await expect(photo).toHaveCSS('border-radius', '50%');
    });

    test('the photo sits on the right on desktop and on top on phones', async ({ page, isMobile }) => {
      test.skip(!track.photo, 'this track has no photo');
      await openRoute(page, routeOf(track));
      const [photo, name] = await Promise.all([
        page.locator('img[data-hero-photo]').boundingBox(),
        page.locator('#about').getByRole('heading', { level: 1 }).boundingBox(),
      ]);
      expect(photo).not.toBeNull();
      expect(name).not.toBeNull();
      if (isMobile) expect(photo!.y + photo!.height).toBeLessThanOrEqual(name!.y + 1);
      else expect(photo!.x).toBeGreaterThan(name!.x + name!.width - 1);
    });

    test('the reveal runs as a CSS animation (and leaves everything visible)', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const name = page.locator('#about').getByRole('heading', { level: 1 });
      expect(await name.evaluate((element) => getComputedStyle(element).animationName)).not.toBe('none');
      await page.waitForTimeout(900);
      await expect(name).toHaveCSS('opacity', '1');
      await expect(page.locator('[data-hero-resume], [data-hero-link]').first()).toHaveCSS('opacity', '1');
    });
  });
}
