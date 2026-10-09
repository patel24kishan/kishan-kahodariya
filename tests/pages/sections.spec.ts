import { expect, test } from '@playwright/test';
import { assetHref, content, isExternal, routeOf, TRACK_IDS } from './support/content';
import AxeBuilder from '@axe-core/playwright';
import { blockOtherOrigins, cssVar, hexToRgb, openRoute, presetTheme, THEMES, trackPage } from './support/page';
import { pendingReveals, revealAll } from './support/reveal';

/** Experience, Skills, Education & Certificates and the footer, per page, against the content API. */
const site = content.getSite();
const CONTACT_TITLE = site.contactLabel.trim() || 'Get in touch';

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);

  test.describe(`${track.route} experience`, () => {
    const entries = content.getExperience(trackId);

    test('lists every job in order with its company, role, date, bullets and tags', async ({ page }) => {
      await openRoute(page, routeOf(track));
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

        // The Motion board has no logo: the timeline is dot, date, company, role, bullets, tags.
        await expect(job.locator('img')).toHaveCount(0);
      }
    });

    test('the title is in the left column and the timeline on the right (desktop), stacked on phones', async ({ page, isMobile }) => {
      test.skip(entries.length === 0, 'no experience in the content');
      await openRoute(page, routeOf(track));
      await revealAll(page); // positions are compared at rest, not mid-entrance
      const title = page.locator('#experience').getByRole('heading', { level: 2 });
      await expect(title).toHaveAccessibleName('Experience');
      await expect(title).toHaveAttribute('id', 'experience-title');
      await expect(title).toHaveCSS('font-weight', '800');
      await expect(title).toHaveCSS('text-transform', 'uppercase');
      const [titleBox, timelineBox] = await Promise.all([title.boundingBox(), page.locator('#experience [data-timeline-line]').boundingBox()]);
      if (isMobile) expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(timelineBox!.y + 1);
      else expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(timelineBox!.x + 1);
    });

    test('an accent line draws down the timeline with scaleY, and each job has a dot, accent for a current job', async ({ page }) => {
      test.skip(entries.length === 0, 'no experience in the content');
      await openRoute(page, routeOf(track));
      const line = page.locator('#experience [data-timeline-line]');
      await expect(line).toHaveCount(1);
      await expect(line).toHaveAttribute('aria-hidden', 'true');
      await expect(line).toHaveCSS('background-color', hexToRgb(await cssVar(trackPage(page), '--color-accent-border')));
      // It starts collapsed (scaleY(0)) and moves only by transform: its layout height never changes.
      await expect(line).toHaveAttribute('data-reveal', 'draw-y');
      const heightBefore = await line.evaluate((element) => (element as HTMLElement).offsetHeight);
      await page.locator('#experience').scrollIntoViewIfNeeded();
      await expect(line).not.toHaveAttribute('data-reveal', /./, { timeout: 10_000 });
      await expect(line).toHaveCSS('transform', 'none');
      expect(await line.evaluate((element) => (element as HTMLElement).offsetHeight)).toBe(heightBefore);

      const dots = page.locator('#experience [data-experience-dot]');
      await expect(dots).toHaveCount(entries.length);
      const accent = hexToRgb(await cssVar(trackPage(page), '--color-accent-border'));
      for (const [index, entry] of entries.entries()) {
        await expect(dots.nth(index)).toHaveAttribute('data-experience-dot', entry.present ? 'present' : 'past');
        if (entry.present) await expect(dots.nth(index)).toHaveCSS('background-color', accent);
        else await expect(dots.nth(index)).not.toHaveCSS('background-color', accent);
      }
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
      // Rows, not cards: no surface fill; the lines are drawn by separate elements (scaleX).
      await expect(rows.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      // Square chips.
      if (groups[0]!.skills.length > 0) await expect(rows.first().locator('ul li').first()).toHaveCSS('border-top-left-radius', '0px');
    });

    test('the rows are numbered 01, 02, … in order, and every skill appears exactly once', async ({ page }) => {
      test.skip(groups.length === 0, 'no skills in the content');
      await openRoute(page, routeOf(track));
      const numbers = await page.locator('#skills [data-skill-number]').evaluateAll((list) => list.map((element) => element.textContent));
      expect(numbers).toEqual(groups.map((_, index) => String(index + 1).padStart(2, '0')));
      // Total chips = total skills, and each (group, skill) pair is one element: nothing is duplicated (no marquee copy).
      const all = groups.flatMap((group) => group.skills);
      await expect(page.locator('#skills [data-skill-group] ul li')).toHaveCount(all.length);
      const rendered = await page.locator('#skills [data-skill-group]').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('ul li')].map((chip) => chip.textContent)));
      expect(rendered).toEqual(groups.map((group) => group.skills));
      // No counter line ("4 groups · 20 skills") and nothing that moves by itself.
      expect(await page.locator('#skills').innerText()).not.toMatch(/d+s+(?:groups?|skills?)/i);
      const animated = await page.locator('#skills *').evaluateAll((list) => list.filter((element) => getComputedStyle(element).animationName !== 'none').length);
      expect(animated).toBe(0);
    });

    test('a line above each row (the first in the accent) and one under the last, drawn with scaleX', async ({ page }) => {
      test.skip(groups.length === 0, 'no skills in the content');
      await openRoute(page, routeOf(track));
      const rules = page.locator('#skills [data-skill-rule]');
      await expect(rules).toHaveCount(groups.length + 1);
      await expect(rules.first()).toHaveCSS('height', '2px');
      await expect(rules.first()).toHaveCSS('background-color', hexToRgb(await cssVar(trackPage(page), '--color-accent-border')));
      await expect(rules.nth(1)).toHaveCSS('height', groups.length > 1 ? '1px' : '1px');
      await expect(rules.first()).toHaveAttribute('data-reveal', 'draw-x');
      await page.locator('#skills').scrollIntoViewIfNeeded();
      await expect(rules.first()).not.toHaveAttribute('data-reveal', /./, { timeout: 10_000 });
      await expect(rules.first()).toHaveCSS('transform', 'none');
    });

    test('hovering a row lights its group up (pointer devices)', async ({ page, isMobile }) => {
      test.skip(isMobile || groups.length === 0, 'no hover on touch devices');
      await openRoute(page, routeOf(track));
      await revealAll(page);
      const plain = groups.findIndex((group) => !(group.emphasis === 'both' || group.emphasis === trackId) && group.skills.length > 0);
      test.skip(plain < 0, 'every group is emphasised on this page');
      const row = page.locator('#skills [data-skill-group]').nth(plain);
      const ink = hexToRgb(await cssVar(trackPage(page), '--color-ink'));
      await expect(row.getByRole('heading', { level: 3 })).toHaveCSS('color', ink);
      await row.getByRole('heading', { level: 3 }).hover();
      await expect(row.getByRole('heading', { level: 3 })).toHaveCSS('color', hexToRgb(await cssVar(trackPage(page), '--color-accent-ink')));
      await expect(row.locator('ul li').first()).toHaveCSS('border-top-color', hexToRgb(await cssVar(trackPage(page), '--color-accent-border')));
    });

    test('the group name sits beside the chips on desktop and above them on phones', async ({ page, isMobile }) => {
      test.skip(groups.length === 0 || groups[0]!.skills.length === 0, 'no skills in the content');
      await openRoute(page, routeOf(track));
      await revealAll(page);
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

    test('has the contact block and the credit lines, and no section links', async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track));
      const footer = page.getByRole('contentinfo');
      // No section links in the footer: the nav bar stays docked at the top of every page.
      await expect(footer.getByRole('navigation')).toHaveCount(0);
      await expect(footer.locator('a[href^="#"]')).toHaveCount(0);

      // The contact block: the title, the email address as one large link, the other links as
      // small outlined buttons in the footer order.
      await expect(footer.getByRole('heading', { level: 2, name: CONTACT_TITLE, exact: true })).toHaveCount(1);
      const emailLink = links.find((link) => link.url.trim().toLowerCase().startsWith('mailto:'));
      const others = links.filter((link) => link !== emailLink);
      const email = footer.locator('a[data-footer-email]');
      await expect(email).toHaveCount(emailLink ? 1 : 0);
      if (emailLink) {
        await expect(email).toHaveAttribute('href', emailLink.url);
        await expect(email).toHaveText(emailLink.url.trim().slice('mailto:'.length).split('?')[0]!);
        await expect(email).not.toHaveAttribute('target', '_blank');
        const emailBox = await email.boundingBox();
        expect(emailBox!.height).toBeGreaterThanOrEqual(44);
      }
      const connect = footer.locator('a[data-footer-link]');
      await expect(connect).toHaveCount(others.length);
      for (const [index, link] of others.entries()) {
        await expect(connect.nth(index)).toHaveAttribute('data-footer-link', link.slug);
        await expect(connect.nth(index)).toHaveAttribute('href', link.url);
        await expect(connect.nth(index)).toHaveText(new RegExp(`^${link.label.replace(/[.*+?^${}()|[]\]/g, '\$&')}`));
        if (isExternal(link.url)) await expect(connect.nth(index)).toHaveAttribute('target', '_blank');
        else await expect(connect.nth(index)).not.toHaveAttribute('target', '_blank');
        const box = await connect.nth(index).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      const titleBox = await footer.getByRole('heading', { level: 2, name: CONTACT_TITLE, exact: true }).boundingBox();
      const gutter = parseFloat(await cssVar(page.locator('html'), '--gutter'));
      expect(titleBox!.x, 'left-aligned with the page gutter').toBeLessThanOrEqual(gutter + 64);
      if (emailLink && others.length > 0) {
        const [emailBox, firstBox] = await Promise.all([email.boundingBox(), connect.first().boundingBox()]);
        expect(emailBox!.y + emailBox!.height, 'the buttons sit under the email').toBeLessThanOrEqual(firstBox!.y + 1);
      }

      // The accent band, with near-black text; the theme toggle is not in the footer.
      const band = footer.locator('[data-on-accent]');
      await expect(band).toHaveCount(1);
      await expect(band).toHaveCSS('background-color', hexToRgb(await cssVar(trackPage(page), '--color-accent')));
      await expect(band.getByRole('switch')).toHaveCount(0);
      // The one switch is in the bar; on phones it is in the menu instead (none on show until it opens).
      await expect(page.getByRole('switch')).toHaveCount(isMobile ? 0 : 1);

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

    test('the footer has no theme toggle; the one in the nav switches the theme', async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track), { theme: 'dark' });
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByRole('contentinfo').getByRole('switch')).toHaveCount(0);
      await expect(page.getByRole('contentinfo').locator('[data-theme-toggle]')).toHaveCount(0);
      // The header holds the only switch on the page: in the bar, or in its menu on phones.
      if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByRole('switch')).toHaveCount(1);
      await page.getByRole('banner').getByRole('switch').click();
      await expect(html).toHaveAttribute('data-theme', 'light');
      await page.getByRole('banner').getByRole('switch').click();
      await expect(html).toHaveAttribute('data-theme', 'dark');
    });

    test('the footer links follow the footer order from the content API; the hero has no link buttons any more', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // The footer buttons carry no short name: they are told apart by their address.
      const footerOnPage = await page.getByRole('contentinfo').locator('a[data-footer-email], a[data-footer-link]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('href')));
      expect(footerOnPage).toEqual(links.map((link) => link.url));
      // The motion hero shows no link buttons (the showInHero field stays in the content).
      await expect(page.locator('#about [data-hero-link]')).toHaveCount(0);
    });
  });
  test.describe(`${track.route} education layout`, () => {
    test('two columns on desktop, stacked on phones, with large uppercase column titles; cards are square', async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track));
      const columns = page.locator('#education [data-column]');
      await expect(columns).toHaveCount(2);
      const [first, second] = await Promise.all([columns.nth(0).boundingBox(), columns.nth(1).boundingBox()]);
      if (isMobile) {
        expect(first!.y + first!.height, 'stacked').toBeLessThanOrEqual(second!.y + 1);
      } else {
        expect(Math.abs(first!.y - second!.y), 'side by side').toBeLessThan(2);
        expect(first!.x + first!.width).toBeLessThanOrEqual(second!.x);
        expect(Math.abs(first!.width - second!.width), 'equal columns').toBeLessThan(2);
      }
      // certificatesFirst decides which one leads (also covered in structure.spec).
      await expect(columns.first()).toHaveAttribute('data-column', track.certificatesFirst ? 'certificates' : 'education');
      for (const column of await columns.all()) {
        const title = column.getByRole('heading', { level: 3 }).first();
        await expect(title).toHaveCSS('font-weight', '800');
        await expect(title).toHaveCSS('text-transform', 'uppercase');
        const size = parseFloat(await title.evaluate((element) => getComputedStyle(element).fontSize));
        expect(size).toBeGreaterThanOrEqual(isMobile ? 30 : 40);
      }
      await expect(columns.first().getByRole('heading', { level: 3 }).first()).toHaveText(track.certificatesFirst ? 'Certificates' : 'Education');
      // One h2 for the section, kept for assistive technology.
      await expect(page.locator('#education').getByRole('heading', { level: 2 })).toHaveText('Education & Certificates');
      const card = page.locator('#education [data-education], #education [data-certificate]').first();
      await expect(card).toHaveCSS('border-top-left-radius', '0px');
    });
  });

  test.describe(`${track.route} reveal on scroll`, () => {
    test('blocks below the fold are hidden by script, rise in once, and are left in their normal state', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // Nothing that is in view at load is hidden: the h1 (hero) carries no reveal mark.
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveAttribute('data-reveal', /./);
      const title = page.locator('#education [data-column] h3').first();
      await expect(title).toHaveAttribute('data-reveal-state', 'hidden');
      await expect(title).toHaveCSS('opacity', '0');
      await expect(title).not.toHaveCSS('transform', 'none');
      await title.scrollIntoViewIfNeeded();
      await expect(title).not.toHaveAttribute('data-reveal', /./, { timeout: 8000 });
      await expect(title).toHaveCSS('opacity', '1');
      await expect(title).toHaveCSS('transform', 'none');
      // Once: leaving and returning does not hide or replay it.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(200);
      await title.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await expect(title).not.toHaveAttribute('data-reveal', /./);
      await expect(title).toHaveCSS('opacity', '1');
    });

    test('only transform and opacity move while a block is entering', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const title = page.locator('#education [data-column] h3').first();
      await title.evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
      await expect(title).toHaveAttribute('data-reveal-state', 'shown');
      const property = await title.evaluate((element) => getComputedStyle(element).transitionProperty.split(',').map((part) => part.trim()).sort());
      expect(property).toEqual(['opacity', 'transform']);
    });

    test('nothing shifts the layout while the blocks arrive', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const measure = () =>
        page.evaluate(() => ({
          page: document.documentElement.scrollHeight,
          boxes: [...document.querySelectorAll<HTMLElement>('main > section, footer')].map((element) => [element.id || element.tagName, element.offsetTop, element.offsetHeight]),
        }));
      const before = await measure();
      expect(await pendingReveals(page)).toBeGreaterThan(0);
      await revealAll(page);
      expect(await measure()).toEqual(before);
    });
  });

  test.describe(`${track.route} small screen and contrast`, () => {
    test('no sideways scroll at 320px and every section title fits', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openRoute(page, routeOf(track, 'all'));
      await revealAll(page);
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(widths.scroll).toBeLessThanOrEqual(320);
      expect(widths.body).toBeLessThanOrEqual(320);
      const titles = await page
        .locator('main h2, main h3, footer h2')
        .evaluateAll((all) => all.filter((element) => element.getBoundingClientRect().width > 2).map((element) => ({ text: element.textContent, right: element.getBoundingClientRect().right, scroll: element.scrollWidth, client: element.clientWidth })));
      for (const title of titles) {
        expect(title.right, `${title.text} stays inside the screen`).toBeLessThanOrEqual(320);
        expect(title.scroll, `${title.text} does not overflow its box`).toBeLessThanOrEqual(title.client + 1);
      }
    });

    for (const theme of THEMES) {
      test(`axe finds nothing in any section or the footer — ${theme}`, async ({ page }) => {
        await openRoute(page, routeOf(track, 'all'), { theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await revealAll(page);
        for (const selector of ['#projects', '#experience', '#skills', '#education', 'footer']) {
          const results = await new AxeBuilder({ page }).include(selector).analyze();
          const summary = results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.slice(0, 4).map((node) => ({ target: node.target, summary: node.failureSummary })) }));
          expect(summary, `${selector}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
        }
      });
    }
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing is hidden and nothing moves', async ({ page }) => {
    const track = content.getTrack('game');
    await openRoute(page, routeOf(track, 'all'));
    await page.waitForTimeout(300);
    await expect(page.locator('[data-reveal]')).toHaveCount(0);
    for (const selector of ['#projects h2', '#experience h2', '#skills h2', '#education [data-column] h3', 'footer h2']) {
      const element = page.locator(selector).first();
      await expect(element, selector).toHaveCSS('opacity', '1');
      await expect(element, selector).toHaveCSS('transform', 'none');
    }
    const lastCell = page.locator('[data-testid="project-grid"] > li').last();
    await expect(lastCell).toHaveCSS('opacity', '1');
  });
});

test.describe('footer title', () => {
  const FIXTURE = 'tests/pages/support/footer-fixture.html';

  async function title(page: import('@playwright/test').Page, query: string) {
    await blockOtherOrigins(page);
    await page.goto(`${FIXTURE}${query}`);
    const heading = page.getByRole('contentinfo').getByRole('heading', { level: 2 });
    await heading.waitFor();
    return heading;
  }

  test('shows contactLabel when it is set', async ({ page }) => {
    await expect(await title(page, '?label=Say%20hello')).toHaveText('Say hello');
  });

  for (const [name, query] of [
    ['missing', ''],
    ['empty', '?label='],
    ['blank', '?label=%20%20'],
  ] as const) {
    test(`falls back to "Get in touch" when it is ${name}`, async ({ page }) => {
      await expect(await title(page, query)).toHaveText('Get in touch');
    });
  }

  test('is large, 800 and uppercase, on the accent band, with the credit strip below', async ({ page }) => {
    const heading = await title(page, '');
    await expect(heading).toHaveCSS('font-weight', '800');
    await expect(heading).toHaveCSS('text-transform', 'uppercase');
    const footer = page.getByRole('contentinfo');
    const [band, credit] = await Promise.all([footer.locator('[data-on-accent]').boundingBox(), footer.getByText('Fixture credit.').boundingBox()]);
    expect(band!.y + band!.height).toBeLessThanOrEqual(credit!.y + 1);
  });
});
