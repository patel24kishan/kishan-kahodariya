import { expect, test } from '@playwright/test';
import { assetHref, content, isExternal, routeOf, TRACK_IDS, withBase } from './support/content';
import { card, cards, mediaButton, openRoute, scrollY, tabsNav, trackPage } from './support/page';

/** The Projects section: the tab control, the grid and the cards, against getProjects(). */
const tabs = content.getTabs();
const allTab = tabs.find((tab) => tab.id === 'all');

async function cardSlugs(page: Parameters<typeof cards>[0]): Promise<string[]> {
  return cards(page).evaluateAll((list) => list.map((element) => element.getAttribute('data-project') ?? ''));
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
      await page.locator('#projects').scrollIntoViewIfNeeded();
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
      await openRoute(page, routeOf(track, 'all'));
      const projects = content.getProjects(trackId, 'all');
      expect(projects.length).toBeGreaterThan(0);
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
        }
        for (const link of project.links.filter((candidate) => candidate.url.trim() === '')) {
          await expect(article.getByRole('link', { name: new RegExp(`^${link.label}`) }), `${project.slug}: "${link.label}" has no URL`).toHaveCount(0);
        }

        await expect(article.locator('[data-project-gameplay]'), `${project.slug} gameplay`).toHaveCount(project.videoUrl.trim() ? 1 : 0);
        if (project.featured) await expect(article).toHaveAttribute('data-featured', 'true');
        else await expect(article).not.toHaveAttribute('data-featured', /./);

        await expect(mediaButton(article)).toHaveAccessibleName(new RegExp(content.getHoverText(project).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    });

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
      const image = button.locator('img');
      await expect(image).toHaveAttribute('src', assetHref(shot.src));
      await expect(image).toHaveAttribute('alt', shot.alt);
      await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
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
    const external = projects.find((project) => project.screenshots.length > 0 && isExternal(project.screenshots[0]!.src));
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
