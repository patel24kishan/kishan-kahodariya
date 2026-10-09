import { expect, test } from '@playwright/test';
import type { ProjectLink } from '../../src/content/types';
import { assetHref, content, isExternal, routeOf, TRACK_IDS, withBase } from './support/content';
import { card, cards, cssVar, hexToRgb, mediaButton, openRoute, scrollY, tabsNav, THEMES, trackPage, waitForBoxToSettle, waitForScrollToSettle } from './support/page';
import { revealAll } from './support/reveal';

/** The Projects section: the tab control, the grid and the cards, against getProjects(). */
const tabs = content.getTabs();
const allTab = tabs.find((tab) => tab.id === 'all');

async function cardSlugs(page: Parameters<typeof cards>[0]): Promise<string[]> {
  return cards(page).evaluateAll((list) => list.map((element) => element.getAttribute('data-project') ?? ''));
}

/** The rule in ProjectCard.linkIcon(): "View Code" always the one code icon, "Play" always the game controller, the rest by host. */
function expectedLinkIcon(link: ProjectLink): string {
  if (link.kind === 'code') return 'gitlab';
  if (link.kind === 'play') return 'itchio';
  let host = '';
  try {
    host = new URL(link.url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = '';
  }
  if (host === 'github.com') return 'github';
  if (host === 'gitlab.com') return 'gitlab';
  if (host === 'itch.io' || host.endsWith('.itch.io')) return 'itchio';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host.endsWith('steampowered.com') || host.endsWith('steamcommunity.com')) return 'steam';
  return 'external';
}

/** Play links are accent buttons (like Gameplay); everything else is outline. */
function expectedLinkVariant(link: ProjectLink): string {
  return link.kind === 'play' ? 'accent' : 'outline';
}

for (const trackId of TRACK_IDS) {
  const track = content.getTrack(trackId);
  const otherTab = tabs.find((tab) => tab.id !== track.defaultTab && tab.id !== 'all') ?? allTab;

  test.describe(`${track.route} projects`, () => {
    test('the tabs are links to every tab, the open one marked', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const links = tabsNav(page).getByRole('link');
      await expect(links).toHaveCount(tabs.length);
      for (const [index, tab] of tabs.entries()) {
        await expect(links.nth(index)).toHaveText(tab.label);
        await expect(links.nth(index)).toHaveAttribute('href', withBase(routeOf(track, tab.id)));
      }
      const current = tabsNav(page).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(tabs.find((tab) => tab.id === track.defaultTab)?.label ?? '');
      await expect(page.locator('#projects').getByRole('heading', { level: 2 })).toHaveText('Projects');
    });

    test('the title is on the left and the square tabs on the right (desktop); the open tab is filled with the accent', async ({ page, isMobile }) => {
      await openRoute(page, routeOf(track));
      // Under the one-viewport hero the section is below the fold: let its entrance finish first.
      await revealAll(page);
      const title = page.locator('#projects').getByRole('heading', { level: 2 });
      await expect(title).toHaveCSS('font-weight', '800');
      await expect(title).toHaveCSS('text-transform', 'uppercase');
      const nav = tabsNav(page);
      const [titleBox, navBox] = await Promise.all([title.boundingBox(), nav.locator('ul').boundingBox()]);
      if (isMobile) {
        expect(titleBox!.y + titleBox!.height, 'tabs under the title').toBeLessThanOrEqual(navBox!.y + 1);
        const viewportWidth = page.viewportSize()!.width;
        expect(navBox!.width, 'tabs fill the width').toBeGreaterThan(viewportWidth - 2 * 24);
      } else {
        expect(titleBox!.x + titleBox!.width, 'title left of the tabs').toBeLessThanOrEqual(navBox!.x);
        expect(titleBox!.x).toBeLessThan(navBox!.x);
      }
      const open = nav.locator('[aria-current="page"]');
      await expect(open).toHaveCSS('background-color', hexToRgb(await cssVar(trackPage(page), '--color-accent')));
      await expect(open).toHaveCSS('border-top-left-radius', '0px');
      await expect(nav.locator('ul')).toHaveCSS('border-top-left-radius', '0px');
      for (const link of await nav.getByRole('link').all()) await expect(link).toHaveJSProperty('tagName', 'A');
    });

    test('the cards are square and rise in once as they come into view', async ({ page }) => {
      await openRoute(page, routeOf(track, 'all'));
      const last = cards(page).last();
      await expect(last).toHaveCSS('border-top-left-radius', '0px');
      // The last card is far below the fold: hidden by script until it is reached, then shown, then left alone.
      const cell = page.locator('[data-testid="project-grid"] > li').last();
      await expect(cell).toHaveAttribute('data-reveal-state', 'hidden');
      await expect(cell).toHaveCSS('opacity', '0');
      await cell.scrollIntoViewIfNeeded();
      await expect(cell).not.toHaveAttribute('data-reveal', /./, { timeout: 8000 });
      await expect(cell).toHaveCSS('opacity', '1');
      await expect(cell).toHaveCSS('transform', 'none');
      // Scrolling away and back does not hide it again.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(150);
      await cell.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await expect(cell).not.toHaveAttribute('data-reveal', /./);
      await expect(cell).toHaveCSS('opacity', '1');
    });

    for (const tab of tabs) {
      test(`the ${tab.id} tab shows getProjects() in order`, async ({ page }) => {
        await openRoute(page, routeOf(track, tab.id));
        const expected = content.getProjects(trackId, tab.id).map((project) => project.slug);
        await expect(trackPage(page)).toHaveAttribute('data-tab', tab.id);
        await expect(tabsNav(page).locator('[aria-current="page"]')).toHaveText(tab.label);
        if (expected.length === 0) {
          await expect(page.getByTestId('projects-empty')).toBeVisible();
          await expect(cards(page)).toHaveCount(0);
        } else {
          await expect(cards(page)).toHaveCount(expected.length);
          expect(await cardSlugs(page)).toEqual(expected);
          await expect(page.getByTestId('projects-empty')).toHaveCount(0);
        }
      });
    }

    test('changing the tab changes the address and the cards, keeps the scroll position, and Back returns', async ({ page }) => {
      test.skip(!otherTab, 'only one tab exists');
      await openRoute(page, routeOf(track));
      // The tabs themselves in view: the click that follows must not have to scroll to reach them.
      await tabsNav(page).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const before = await scrollY(page);
      expect(before).toBeGreaterThan(0);

      await tabsNav(page).getByRole('link', { name: otherTab!.label, exact: true }).click();
      await expect(trackPage(page)).toHaveAttribute('data-tab', otherTab!.id);
      await expect.poll(() => new URL(page.url()).pathname).toBe(withBase(routeOf(track, otherTab!.id)));
      await expect(tabsNav(page).locator('[aria-current="page"]')).toHaveText(otherTab!.label);
      const expected = content.getProjects(trackId, otherTab!.id).map((project) => project.slug);
      await expect(cards(page)).toHaveCount(expected.length);
      expect(await cardSlugs(page)).toEqual(expected);
      expect(await scrollY(page)).toBe(before);

      await page.goBack();
      await expect(trackPage(page)).toHaveAttribute('data-tab', track.defaultTab);
      await expect.poll(() => new URL(page.url()).pathname).toBe(withBase(routeOf(track)));
      expect(await cardSlugs(page)).toEqual(content.getProjects(trackId, track.defaultTab).map((project) => project.slug));
    });

    test('every card shows its project exactly as stored', async ({ page }) => {
      test.slow(); // every field, link, icon and variant of every published project: 20+ cards
      const projects = content.getProjects(trackId, 'all');
      expect(projects.length).toBeGreaterThan(0);
      // A card slides only through the screenshots that load, and a hot-linked one is blocked by
      // default (it fails at once, which is the right behaviour). Let every screenshot load, so
      // the card shows what is stored and the expectations below come from the content.
      await openRoute(page, routeOf(track, 'all'), { serveImages: projects.flatMap((project) => project.screenshots.map((shot) => assetHref(shot.src))).filter(isExternal) });
      for (const project of projects) {
        const article = card(page, project.slug);
        await expect(article, project.slug).toHaveCount(1);
        await expect(article.getByRole('heading', { level: 3 })).toHaveText(project.title);

        const text = await article.evaluate((element) => element.textContent ?? '');
        if (project.dateDisplay) expect(text, `${project.slug} date`).toContain(project.dateDisplay);
        if (project.shortDescription) expect(text, `${project.slug} description`).toContain(project.shortDescription);

        const tags = article.locator('ul[aria-label="Tags"] li');
        await expect(tags, `${project.slug} tags`).toHaveCount(project.tags.length);
        if (project.tags.length > 0) await expect(tags).toHaveText(project.tags);

        const expectedLinks = project.links.filter((link) => link.url.trim() !== '');
        const links = article.locator('[data-project-link]');
        await expect(links, `${project.slug} links`).toHaveCount(expectedLinks.length);
        for (const [index, link] of expectedLinks.entries()) {
          await expect(links.nth(index)).toHaveAttribute('href', link.url);
          await expect(links.nth(index)).toHaveText(new RegExp(`^${link.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
          if (isExternal(link.url)) await expect(links.nth(index)).toHaveAttribute('target', '_blank');
          await expect(links.nth(index), `${project.slug} "${link.label}" variant`).toHaveAttribute('data-variant', expectedLinkVariant(link));
          await expect(links.nth(index).locator('svg[data-icon]'), `${project.slug} "${link.label}" icon`).toHaveAttribute('data-icon', expectedLinkIcon(link));
        }
        for (const link of project.links.filter((candidate) => candidate.url.trim() === '')) {
          await expect(article.getByRole('link', { name: new RegExp(`^${link.label}`) }), `${project.slug}: "${link.label}" has no URL`).toHaveCount(0);
        }

        await expect(article.locator('[data-project-gameplay]'), `${project.slug} gameplay`).toHaveCount(project.videoUrl.trim() ? 1 : 0);
        if (project.videoUrl.trim()) {
          // The video button reads "Demo" and carries the video-camera glyph.
          await expect(article.locator('[data-project-gameplay]'), `${project.slug} demo label`).toHaveText('Demo');
          await expect(article.locator('[data-project-gameplay] svg[data-icon="video"]'), `${project.slug} demo icon`).toHaveCount(1);
        }
        if (project.featured) await expect(article).toHaveAttribute('data-featured', 'true');
        else await expect(article).not.toHaveAttribute('data-featured', /./);

        await expect(mediaButton(article)).toHaveAccessibleName(new RegExp(content.getHoverText(project).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        // The slideshow exists only for a project with two or more screenshots.
        const slideshow = project.screenshots.length >= 2;
        await expect(mediaButton(article).locator('[data-media-dots]'), `${project.slug} dots`).toHaveCount(slideshow ? 1 : 0);
        await expect(mediaButton(article).locator('[data-media-slide]'), `${project.slug} slides`).toHaveCount(slideshow ? project.screenshots.length : 0);
        if (!slideshow) await expect(mediaButton(article), `${project.slug} is not a slideshow`).not.toHaveAttribute('data-media-current', /./);
      }
    });

    test('every View Code button shows the same code icon and every Play button is filled with the accent', async ({ page }) => {
      await openRoute(page, routeOf(track, 'all'));
      const codeLinks = page.locator('[data-testid="project-grid"] [data-project-link="code"]');
      const playLinks = page.locator('[data-testid="project-grid"] [data-project-link="play"]');
      const projects = content.getProjects(trackId, 'all');
      const expectedCode = projects.flatMap((project) => project.links.filter((link) => link.kind === 'code' && link.url.trim() !== ''));
      const expectedPlay = projects.flatMap((project) => project.links.filter((link) => link.kind === 'play' && link.url.trim() !== ''));
      await expect(codeLinks).toHaveCount(expectedCode.length);
      await expect(playLinks).toHaveCount(expectedPlay.length);
      await expect(codeLinks.locator('svg[data-icon="gitlab"]')).toHaveCount(expectedCode.length);
      await expect(codeLinks.locator('svg[data-icon="github"]')).toHaveCount(0);
      for (let index = 0; index < expectedPlay.length; index += 1) await expect(playLinks.nth(index)).toHaveAttribute('data-variant', 'accent');
      await expect(page.locator('[data-testid="project-grid"] [data-project-link]:not([data-project-link="play"])[data-variant="accent"]')).toHaveCount(0);
    });

    for (const theme of THEMES) {
      test(`a Play button has the accent fill and dark text — ${theme}`, async ({ page }) => {
        const withPlay = content.getProjects(trackId, 'all').find((project) => project.links.some((link) => link.kind === 'play' && link.url.trim() !== ''));
        test.skip(!withPlay, 'no project with a Play link on this page');
        await openRoute(page, routeOf(track, 'all'), { theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const play = card(page, withPlay!.slug).locator('[data-project-link="play"]').first();
        const accent = await cssVar(trackPage(page), '--color-accent');
        expect(accent).toBe(trackId === 'game' ? '#faff69' : '#7cb2ff');
        await expect(play).toHaveCSS('background-color', hexToRgb(accent));
        await expect(play).toHaveCSS('color', hexToRgb(await cssVar(trackPage(page), '--color-on-accent')));
      });
    }

    test('a featured card gets the accent border', async ({ page }) => {
      const featured = content.getProjects(trackId, 'all').find((project) => project.featured);
      test.skip(!featured, 'no featured project in the content');
      await openRoute(page, routeOf(track, 'all'));
      const article = card(page, featured!.slug);
      const accentBorder = await trackPage(page).evaluate((element) => getComputedStyle(element).getPropertyValue('--color-accent-border').trim());
      const hex = accentBorder.replace('#', '');
      await expect(article).toHaveCSS('border-top-color', `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`);
    });

    test('the card image is a button showing the first screenshot', async ({ page }) => {
      const project = content.getProjects(trackId, 'all').find((candidate) => candidate.screenshots.length > 0);
      test.skip(!project, 'no project with a screenshot');
      const shot = project!.screenshots[0]!;
      await openRoute(page, routeOf(track, 'all'), { serveImages: [assetHref(shot.src)].filter(isExternal) });
      const button = mediaButton(card(page, project!.slug));
      await expect(button).toHaveJSProperty('tagName', 'BUTTON');
      const image = button.locator('img').first();
      await expect(image).toHaveAttribute('src', assetHref(shot.src));
      await expect(image).toHaveAttribute('alt', shot.alt);
      await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect(button.locator('img')).toHaveCount(project!.screenshots.length);
    });
  });
}

test.describe('card media states', () => {
  const track = content.getTrack('game');
  const projects = content.getProjects('game', 'all');
  const withShot = projects.find((project) => project.screenshots.length > 0);

  test('shows the hover text on hover and on keyboard focus (pointer devices)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'touch devices show a permanent badge');
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, routeOf(track, 'all'));
    const button = mediaButton(card(page, withShot!.slug));
    const label = button.locator('[data-media-label]');
    await button.scrollIntoViewIfNeeded();
    // Below the one-viewport hero the card arrives with a (smooth) scroll and its entrance:
    // hover it once it has come to rest, or it moves away from under the pointer.
    await waitForScrollToSettle(page);
    await waitForBoxToSettle(button);
    await expect(label).toHaveText(content.getHoverText(withShot!));

    await expect(label).toHaveCSS('opacity', '0');
    await button.hover();
    await expect(label).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await expect(label).toHaveCSS('opacity', '0');

    await button.focus();
    await page.keyboard.press('Shift');
    await expect(label).toHaveCSS('opacity', '1');
  });

  test('shows the hover text as a permanent badge on touch devices', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'pointer devices use the hover scrim');
    test.skip(!withShot, 'no project with a screenshot');
    await openRoute(page, routeOf(track, 'all'));
    const button = mediaButton(card(page, withShot!.slug));
    const label = button.locator('[data-media-label]');
    await button.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
    await expect(label).toHaveCSS('opacity', '1');
    await expect(label).toHaveText(content.getHoverText(withShot!));
    const [buttonBox, labelBox] = await Promise.all([button.boundingBox(), label.boundingBox()]);
    expect(labelBox!.height).toBeLessThan(buttonBox!.height / 2);
  });

  test('a screenshot that fails to load is replaced by the placeholder, and the button still works', async ({ page }) => {
    // One screenshot only: a card with several skips a broken one and shows the next instead.
    const external = projects.find((project) => project.screenshots.length === 1 && isExternal(project.screenshots[0]!.src));
    test.skip(!external, 'no project with a hot-linked screenshot');
    // Other origins are blocked, so the image fails at once.
    await openRoute(page, routeOf(track, 'all'));
    const button = mediaButton(card(page, external!.slug));
    await button.scrollIntoViewIfNeeded();
    await expect(button.locator('[data-media-placeholder]')).toBeVisible();
    await expect(button.locator('img')).toHaveCount(0);
    await expect(button).toHaveAttribute('data-media-fallback', 'true');
    await expect(button.locator('[data-media-label]')).toHaveText(content.getHoverText(external!));
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('a project without a screenshot shows the placeholder', async ({ page }) => {
    const withoutShot = projects.find((project) => project.screenshots.length === 0);
    test.skip(!withoutShot, 'every project has a screenshot in the content');
    await openRoute(page, routeOf(track, 'all'));
    await expect(mediaButton(card(page, withoutShot!.slug)).locator('[data-media-placeholder]')).toBeVisible();
  });
});
