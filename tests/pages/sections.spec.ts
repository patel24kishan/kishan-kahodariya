import { expect, test } from '@playwright/test';
import { assetHref, content, isExternal, routeOf, SECTION_IDS, SECTION_LABELS, TRACK_IDS } from './support/content';
import { cssVar, hexToRgb, openRoute, trackPage } from './support/page';

/** Experience, Skills, Education & Certificates and the footer, per page, against the content API. */
const site = content.getSite();

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);

  test.describe(`${track.route} experience`, () => {
    const entries = content.getExperience(trackId);
    const logos = entries.map((entry) => assetHref(entry.logo)).filter((url) => url !== '' && isExternal(url));

    test('lists every job in order with its company, role, date, bullets and tags', async ({ page }) => {
      await openRoute(page, routeOf(track), { serveImages: logos });
      const jobs = page.locator('#experience [data-experience]');
      await expect(jobs).toHaveCount(entries.length);
      expect(await jobs.evaluateAll((list) => list.map((job) => job.getAttribute('data-experience')))).toEqual(entries.map((entry) => entry.slug));

      for (const entry of entries) {
        const job = page.locator(`#experience [data-experience="${entry.slug}"]`);
        await expect(job.getByRole('heading', { level: 3 })).toHaveText(entry.company);
        const text = await job.evaluate((element) => element.textContent ?? '');
        if (entry.role) expect(text).toContain(entry.role);
        if (entry.dateDisplay) expect(text).toContain(entry.dateDisplay);
        if (entry.location) expect(text).toContain(entry.location);

        const bullets = job.locator('ul:not([aria-label]) li');
        await expect(bullets, `${entry.slug} bullets`).toHaveCount(entry.resolvedBullets.length);
        for (const [index, bullet] of entry.resolvedBullets.entries()) {
          expect(await bullets.nth(index).evaluate((element) => element.textContent)).toBe(bullet);
        }

        const tags = job.locator('ul[aria-label="Technologies"] li');
        await expect(tags, `${entry.slug} tags`).toHaveCount(entry.tags.length);
        if (entry.tags.length > 0) await expect(tags).toHaveText(entry.tags);

        const remote = job.locator('[data-experience-remote]');
        await expect(remote).toHaveCount(entry.remote ? 1 : 0);
        if (entry.remote) await expect(remote).toHaveText('Remote');

        const logo = job.locator('img[data-experience-logo]');
        if (entry.logo) {
          await expect(logo).toHaveCount(1);
          await expect(logo).toHaveAttribute('src', assetHref(entry.logo));
          await expect(logo).toHaveAttribute('alt', '');
          const box = await logo.boundingBox();
          expect(box!.width).toBeLessThanOrEqual(64);
        } else {
          await expect(logo).toHaveCount(0);
        }
      }
    });

    test('a logo that does not load disappears instead of showing a broken image', async ({ page }) => {
      const external = entries.filter((entry) => entry.logo && isExternal(entry.logo));
      test.skip(external.length === 0, 'no hot-linked logo in the content');
      // Other origins are blocked, so every hot-linked logo fails — once it is asked for (they load lazily).
      await openRoute(page, routeOf(track));
      await page.locator('#experience').scrollIntoViewIfNeeded();
      for (const entry of external) {
        await page.locator(`#experience [data-experience="${entry.slug}"]`).scrollIntoViewIfNeeded();
        await expect(page.locator(`#experience [data-experience="${entry.slug}"] img[data-experience-logo]`)).toHaveCount(0);
      }
      await expect(page.locator('#experience [data-experience]')).toHaveCount(entries.length);
    });
  });

  test.describe(`${track.route} skills`, () => {
    const groups = content.getSkillGroups(trackId);

    test('shows the groups as rows in order, emphasised ones in the accent', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const rows = page.locator('#skills [data-skill-group]');
      await expect(rows).toHaveCount(groups.length);
      expect(await rows.evaluateAll((list) => list.map((row) => row.getAttribute('data-skill-group')))).toEqual(groups.map((group) => group.slug));

      const accentInk = hexToRgb(await cssVar(trackPage(page), '--color-accent-ink'));
      const accentBorder = hexToRgb(await cssVar(trackPage(page), '--color-accent-border'));
      const ink = hexToRgb(await cssVar(trackPage(page), '--color-ink'));
      const hairlineStrong = hexToRgb(await cssVar(trackPage(page), '--color-hairline-strong'));

      for (const group of groups) {
        const row = page.locator(`#skills [data-skill-group="${group.slug}"]`);
        const title = row.getByRole('heading', { level: 3 });
        await expect(title).toHaveText(group.title);
        const chips = row.locator('ul li');
        await expect(chips, group.slug).toHaveCount(group.skills.length);
        if (group.skills.length > 0) await expect(chips).toHaveText(group.skills);

        const emphasised = group.emphasis === 'both' || group.emphasis === trackId;
        if (emphasised) {
          await expect(row).toHaveAttribute('data-emphasised', 'true');
          await expect(title).toHaveCSS('color', accentInk);
          if (group.skills.length > 0) await expect(chips.first()).toHaveCSS('border-top-color', accentBorder);
        } else {
          await expect(row).not.toHaveAttribute('data-emphasised', /./);
          await expect(title).toHaveCSS('color', ink);
          if (group.skills.length > 0) await expect(chips.first()).toHaveCSS('border-top-color', hairlineStrong);
        }
      }
      // Rows, not cards: a hairline between rows, no surface fill.
      await expect(rows.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(rows.first()).toHaveCSS('border-bottom-width', '1px');
    });

    test('the group name sits beside the chips on desktop and above them on phones', async ({ page, isMobile }) => {
      test.skip(groups.length === 0 || groups[0]!.skills.length === 0, 'no skills in the content');
      await openRoute(page, routeOf(track));
      const row = page.locator(`#skills [data-skill-group="${groups[0]!.slug}"]`);
      const [title, chips] = await Promise.all([row.getByRole('heading', { level: 3 }).boundingBox(), row.locator('ul').boundingBox()]);
      if (isMobile) expect(title!.y + title!.height).toBeLessThanOrEqual(chips!.y + 1);
      else expect(title!.x + title!.width).toBeLessThanOrEqual(chips!.x + 1);
    });
  });

  test.describe(`${track.route} education and certificates`, () => {
    const education = content.getEducation();
    const certificates = content.getCertificates(trackId);
    const badges = certificates.map((certificate) => assetHref(certificate.image)).filter((url) => url !== '' && isExternal(url));

    test('lists the schools with degree, dates, grade and description', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const items = page.locator('#education [data-education]');
      await expect(items).toHaveCount(education.length);
      expect(await items.evaluateAll((list) => list.map((item) => item.getAttribute('data-education')))).toEqual(education.map((entry) => entry.slug));
      for (const entry of education) {
        const item = page.locator(`#education [data-education="${entry.slug}"]`);
        await expect(item.getByRole('heading', { level: 4 })).toHaveText(entry.school);
        const text = await item.evaluate((element) => element.textContent ?? '');
        for (const value of [entry.degree, entry.dateDisplay, entry.grade]) if (value) expect(text).toContain(value);
        for (const paragraph of entry.description.split(/\r?\n\s*\r?\n/)) if (paragraph.trim()) expect(text).toContain(paragraph.trim());
      }
    });

    test('lists the certificates with badge, linked title, date and description', async ({ page }) => {
      await openRoute(page, routeOf(track), { serveImages: badges });
      const items = page.locator('#education [data-certificate]');
      await expect(items).toHaveCount(certificates.length);
      expect(await items.evaluateAll((list) => list.map((item) => item.getAttribute('data-certificate')))).toEqual(certificates.map((entry) => entry.slug));
      for (const certificate of certificates) {
        const item = page.locator(`#education [data-certificate="${certificate.slug}"]`);
        const title = item.getByRole('heading', { level: 4 });
        await expect(title).toContainText(certificate.title);
        if (certificate.url.trim()) {
          const link = title.getByRole('link');
          await expect(link).toHaveAttribute('href', certificate.url.trim());
          await expect(link).toContainText(certificate.title);
          if (isExternal(certificate.url)) {
            await expect(link).toHaveAttribute('target', '_blank');
            await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
          }
        } else {
          await expect(title.getByRole('link')).toHaveCount(0);
        }
        const text = await item.evaluate((element) => element.textContent ?? '');
        if (certificate.dateDisplay) expect(text).toContain(certificate.dateDisplay);
        if (certificate.description) expect(text).toContain(certificate.description.trim());
        if (certificate.image) {
          const badge = item.locator('img');
          await expect(badge).toHaveCount(1);
          await expect(badge).toHaveAttribute('src', assetHref(certificate.image));
          await expect(badge).toHaveAttribute('alt', certificate.imageAlt);
        }
      }
    });

    test('a badge that does not load is replaced by a labelled fallback', async ({ page }) => {
      const external = certificates.filter((certificate) => certificate.image && isExternal(certificate.image));
      test.skip(external.length === 0, 'no hot-linked badge in the content');
      await openRoute(page, routeOf(track));
      for (const certificate of external) {
        const item = page.locator(`#education [data-certificate="${certificate.slug}"]`);
        await item.scrollIntoViewIfNeeded(); // badges load lazily; in view, the blocked request fails at once
        await expect(item.locator('img')).toHaveCount(0);
        await expect(item.getByRole('img')).toHaveCount(1);
        await expect(item.getByRole('img')).toHaveAccessibleName(certificate.imageAlt || /badge/);
      }
    });
  });

  test.describe(`${track.route} footer`, () => {
    const links = content.getLinks(trackId, 'footer');

    test('has the Navigate links, the Connect buttons, a theme toggle and the credit lines', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const footer = page.getByRole('contentinfo');
      const navigate = footer.getByRole('navigation', { name: 'Footer' });
      await expect(navigate.getByRole('heading', { level: 2 })).toHaveText('Navigate');
      const navLinks = navigate.getByRole('link');
      await expect(navLinks).toHaveCount(SECTION_IDS.length);
      for (const [index, id] of SECTION_IDS.entries()) {
        await expect(navLinks.nth(index)).toHaveAttribute('href', `#${id}`);
        await expect(navLinks.nth(index)).toHaveText(SECTION_LABELS[index]!);
      }
      // Stacked.
      if (SECTION_IDS.length > 1) {
        const [first, second] = await Promise.all([navLinks.nth(0).boundingBox(), navLinks.nth(1).boundingBox()]);
        expect(first!.y + first!.height).toBeLessThanOrEqual(second!.y + 1);
      }

      await expect(footer.getByRole('heading', { level: 2, name: 'Connect' })).toHaveCount(1);
      const connect = footer.locator('a[data-variant="onAccent"]');
      await expect(connect).toHaveCount(links.length);
      for (const [index, link] of links.entries()) {
        await expect(connect.nth(index)).toHaveAttribute('href', link.url);
        await expect(connect.nth(index)).toHaveText(new RegExp(`^${link.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        await expect(connect.nth(index).locator(`svg[data-icon="${link.icon}"]`)).toHaveCount(1);
        if (isExternal(link.url)) await expect(connect.nth(index)).toHaveAttribute('target', '_blank');
        else await expect(connect.nth(index)).not.toHaveAttribute('target', '_blank');
      }

      // The accent band, with near-black text and the toggle at the bottom right.
      const band = footer.locator('[data-on-accent]');
      await expect(band).toHaveCount(1);
      await expect(band).toHaveCSS('background-color', hexToRgb(await cssVar(trackPage(page), '--color-accent')));
      const toggle = band.getByRole('switch');
      await expect(toggle).toHaveCount(1);
      await expect(page.getByRole('switch')).toHaveCount(2);
      const [bandBox, toggleBox, connectBox] = await Promise.all([band.boundingBox(), toggle.boundingBox(), connect.first().boundingBox()]);
      expect(toggleBox!.x + toggleBox!.width).toBeGreaterThan(bandBox!.x + bandBox!.width - 80);
      expect(toggleBox!.y).toBeGreaterThan(connectBox!.y);

      // The credit strip: one line each, accent on near-black.
      const credit = footer.locator('p').filter({ hasText: site.credit[0] ?? '' }).first();
      await expect(credit).toHaveCount(site.credit.length > 0 ? 1 : 0);
      const footerText = await footer.innerText();
      for (const line of site.credit) expect(footerText).toContain(line);
      if (site.credit.length > 0) {
        const accent = hexToRgb(await cssVar(trackPage(page), '--color-accent'));
        await expect(credit).toHaveCSS('color', accent);
      }
    });

    test('the footer toggle switches the theme like the one in the nav', async ({ page }) => {
      await openRoute(page, routeOf(track), { theme: 'dark' });
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'dark');
      const footerToggle = page.getByRole('contentinfo').getByRole('switch');
      await footerToggle.scrollIntoViewIfNeeded();
      await footerToggle.click();
      await expect(html).toHaveAttribute('data-theme', 'light');
      for (const toggle of await page.getByRole('switch').all()) await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('banner').getByRole('switch').click();
      await expect(html).toHaveAttribute('data-theme', 'dark');
    });
  });
}
