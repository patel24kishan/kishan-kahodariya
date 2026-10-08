import { expect, test, type Locator, type Page } from '@playwright/test';
import { assetHref, content, isExternal, normaliseSpace, paragraphsOf, routeOf, TRACK_IDS, withBase } from './support/content';
import { overrideContent } from './support/content-override';
import { cssVar, hexToRgb, openRoute, pathnameOf, scrollY, tabsNav, trackPage } from './support/page';

/** The hero (#about) on both pages, against the track profile, the summary and the resume of the open tab and the hero links. */
const site = content.getSite();
const tabs = content.getTabs();

/**
 * The hero's resume button is exactly this resume (getResume(track, tab)): the address, the
 * label ("Resume" when there is none), a new tab for a link to another site — or no button at
 * all when there is no address.
 */
async function expectResume(page: Page, expected: { url: string; label: string }): Promise<void> {
  const resume = page.locator('#about [data-hero-resume]');
  const url = expected.url.trim();
  if (!url) {
    await expect(resume).toHaveCount(0);
    return;
  }
  await expect(resume).toHaveCount(1);
  await expect(resume).toHaveAttribute('href', url);
  const label = expected.label.trim() || 'Resume';
  if (isExternal(url)) {
    await expect(resume).toHaveText(`${label} (opens in a new tab)`);
    await expect(resume).toHaveAttribute('target', '_blank');
    await expect(resume).toHaveAttribute('rel', 'noopener noreferrer');
  } else {
    await expect(resume).toHaveText(label);
    await expect(resume).not.toHaveAttribute('target', '_blank');
  }
}

function summaryBlock(page: Page): Locator {
  return page.locator('#about [data-hero-summary]');
}

/**
 * The hero's summary is exactly this text (getSummary(track, tab)): one <p> per paragraph, in
 * one block between the headline and the buttons — or no block at all when the text is blank.
 */
async function expectSummary(page: Page, text: string): Promise<void> {
  const block = summaryBlock(page);
  const paragraphs = paragraphsOf(text);
  if (paragraphs.length === 0) {
    await expect(block).toHaveCount(0);
    return;
  }
  await expect(block).toHaveCount(1);
  // innerText: a line break inside a paragraph (a <br>) reads as white space.
  await expect(block.locator('p')).toHaveText(paragraphs.map((paragraph) => normaliseSpace(paragraph)), { useInnerText: true });
}

async function chooseTab(page: Page, tabId: string): Promise<void> {
  const label = tabs.find((tab) => tab.id === tabId)!.label;
  await tabsNav(page).getByRole('link', { name: label, exact: true }).click();
  await expect(trackPage(page)).toHaveAttribute('data-tab', tabId);
}

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

      // No tab in the address: the summary is the one of the page's first tab.
      const summary = content.getSummary(trackId, track.defaultTab);
      const text = normaliseSpace(await hero.innerText());
      for (const paragraph of paragraphsOf(summary)) {
        expect(text).toContain(normaliseSpace(paragraph));
      }
      await expectSummary(page, summary);
    });

    test('has the resume button and the hero links, in order, as new-tab links', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // No tab in the address: the page's first tab is open, and the resume is that tab's.
      await expect(trackPage(page)).toHaveAttribute('data-tab', track.defaultTab);
      await expectResume(page, content.getResume(trackId, track.defaultTab));
      // The resume comes first, before the hero links.
      const order = await page.locator('#about [data-hero-resume], #about [data-hero-link]').evaluateAll((buttons) => buttons.map((button) => (button.hasAttribute('data-hero-resume') ? 'resume' : (button.getAttribute('data-hero-link') ?? ''))));
      const expectedOrder = [...(content.getResume(trackId, track.defaultTab).url.trim() ? ['resume'] : []), ...heroLinks.map((link) => link.slug)];
      expect(order).toEqual(expectedOrder);

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

    // The resume and the summary follow the open project tab: on every address of the page
    // the button is getResume(track, tab) and the text is getSummary(track, tab). (Today every
    // tab falls back to the page's own; the cases with a resume or a summary of its own are in
    // hero-fixture.spec.ts and in the last two groups of this file.)
    for (const tab of tabs) {
      test(`opened on ${routeOf(track, tab.id)}, the resume button and the summary are that tab's`, async ({ page }) => {
        await openRoute(page, routeOf(track, tab.id));
        await expect(trackPage(page)).toHaveAttribute('data-tab', tab.id);
        await expectResume(page, content.getResume(trackId, tab.id));
        await expectSummary(page, content.getSummary(trackId, tab.id));
      });
    }

    test('choosing a tab keeps the resume button and the summary on that tab\'s, without a reload', async ({ page }) => {
      await openRoute(page, routeOf(track));
      await page.evaluate(() => {
        (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
      });
      for (const tab of [...tabs].reverse()) {
        await chooseTab(page, tab.id);
        expect(pathnameOf(page)).toBe(withBase(routeOf(track, tab.id)));
        await expectResume(page, content.getResume(trackId, tab.id));
        await expectSummary(page, content.getSummary(trackId, tab.id));
      }
      expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
    });
  });
}

test.describe('home page', () => {
  test('"/" shows the game page with the resume of its first tab', async ({ page }) => {
    const game = content.getTrack('game');
    await openRoute(page, '/');
    await expect(trackPage(page)).toHaveAttribute('data-track', 'game');
    await expect(trackPage(page)).toHaveAttribute('data-tab', game.defaultTab);
    await expectResume(page, content.getResume('game', game.defaultTab));
    await expectSummary(page, content.getSummary('game', game.defaultTab));
  });
});

/**
 * The real page over content in which one tab has a resume of its own. The owner has not
 * pasted such a link yet, so the dev server's content module is answered with one changed
 * value (support/content-override.ts); the router, the page and the selectors are the real ones.
 */
test.describe('a tab with its own resume, on the real page', () => {
  const game = content.getTrack('game');
  const softdev = content.getTrack('softdev');
  const OWN_TAB = 'unreal';
  const OWN = { url: 'https://example.com/resume/unreal-only.pdf', label: 'Unreal Resume' };
  const main = { url: game.resumeUrl, label: game.resumeLabel };
  const otherTabs = tabs.filter((tab) => tab.id !== OWN_TAB).map((tab) => tab.id);

  test.beforeEach(async ({ page }) => {
    expect(tabs.map((tab) => tab.id)).toContain(OWN_TAB);
    expect(main.url.trim(), 'the game page has a main resume to fall back to').not.toBe('');
    await overrideContent(page, (bundle) => {
      const track = bundle.tracks.find((candidate) => candidate.id === 'game');
      if (!track) throw new Error('The content has no game track.');
      track.tabResumes = [{ tab: OWN_TAB, ...OWN, summary: '' }];
    });
  });

  test(`a link straight to /${game.route}/${OWN_TAB} shows that tab's resume; the other addresses show the page's own`, async ({ page }) => {
    await openRoute(page, routeOf(game, OWN_TAB));
    await expect(trackPage(page)).toHaveAttribute('data-tab', OWN_TAB);
    await expectResume(page, OWN);

    for (const address of ['/', routeOf(game), ...otherTabs.map((tabId) => routeOf(game, tabId))]) {
      await page.goto(`.${address === '/' ? '/' : address}`);
      await expect(trackPage(page)).toHaveAttribute('data-track', 'game');
      await expect(trackPage(page), address).not.toHaveAttribute('data-tab', OWN_TAB);
      await expectResume(page, main);
    }
  });

  test('switching to the tab and away again swaps the resume in place and keeps the scroll position', async ({ page }) => {
    await openRoute(page, routeOf(game));
    await expectResume(page, main);
    const resume = page.locator('#about [data-hero-resume]');
    await resume.evaluate((button) => button.setAttribute('data-test-mark', 'same-element'));

    await tabsNav(page).scrollIntoViewIfNeeded();
    for (const [tabId, expected] of [
      [OWN_TAB, OWN],
      [otherTabs[0]!, main],
      [OWN_TAB, OWN],
    ] as const) {
      const before = await scrollY(page);
      await chooseTab(page, tabId);
      expect(pathnameOf(page)).toBe(withBase(routeOf(game, tabId)));
      await expectResume(page, expected);
      await expect(resume, `after choosing ${tabId}`).toHaveAttribute('data-test-mark', 'same-element');
      expect(await scrollY(page), 'the tab change does not scroll the page').toBe(before);
    }
  });

  test('the other page is not affected: the same tab there shows that page\'s own resume', async ({ page }) => {
    await openRoute(page, routeOf(softdev, OWN_TAB));
    await expect(trackPage(page)).toHaveAttribute('data-track', 'softdev');
    await expect(trackPage(page)).toHaveAttribute('data-tab', OWN_TAB);
    await expectResume(page, { url: softdev.resumeUrl, label: softdev.resumeLabel });
  });
});

/**
 * The same for the summary: the real page over content in which the Unreal tab has a summary
 * of its own and no resume of its own (the owner has not written one yet, so the text below is
 * test-only and never reaches a content file).
 */
test.describe('a tab with its own summary, on the real page', () => {
  const game = content.getTrack('game');
  const softdev = content.getTrack('softdev');
  const OWN_TAB = 'unreal';
  const OWN_SUMMARY = 'Test-only Unreal summary, first paragraph.\n\nTest-only Unreal summary, second paragraph.';
  const mainResume = { url: game.resumeUrl, label: game.resumeLabel };
  const otherTabs = tabs.filter((tab) => tab.id !== OWN_TAB).map((tab) => tab.id);

  test.beforeEach(async ({ page }) => {
    expect(tabs.map((tab) => tab.id)).toContain(OWN_TAB);
    expect(game.summary.trim(), 'the game page has a main summary to fall back to').not.toBe('');
    expect(normaliseSpace(game.summary)).not.toBe(normaliseSpace(OWN_SUMMARY));
    await overrideContent(page, (bundle) => {
      const track = bundle.tracks.find((candidate) => candidate.id === 'game');
      if (!track) throw new Error('The content has no game track.');
      track.tabResumes = [{ tab: OWN_TAB, url: '', label: '', summary: OWN_SUMMARY }];
    });
  });

  test(`a link straight to /${game.route}/${OWN_TAB} shows that tab's summary; the other addresses show the page's own`, async ({ page }) => {
    await openRoute(page, routeOf(game, OWN_TAB));
    await expect(trackPage(page)).toHaveAttribute('data-tab', OWN_TAB);
    await expectSummary(page, OWN_SUMMARY);
    // The row has no resume link: the button is still the page's main resume.
    await expectResume(page, mainResume);
    // Between the headline and the buttons, like the main summary.
    const around = await summaryBlock(page).evaluate((block) => ({
      before: block.previousElementSibling?.textContent ?? '',
      afterHasButtons: block.nextElementSibling?.querySelector('[data-hero-resume], [data-hero-link]') !== null,
    }));
    expect(around).toEqual({ before: game.headline, afterHasButtons: true });

    for (const address of ['/', routeOf(game), ...otherTabs.map((tabId) => routeOf(game, tabId))]) {
      await page.goto(`.${address === '/' ? '/' : address}`);
      await expect(trackPage(page)).toHaveAttribute('data-track', 'game');
      await expect(trackPage(page), address).not.toHaveAttribute('data-tab', OWN_TAB);
      await expectSummary(page, game.summary);
    }
  });

  test('switching to the tab and away again swaps the summary in place and keeps the scroll position', async ({ page }) => {
    await openRoute(page, routeOf(game));
    await expectSummary(page, game.summary);
    const block = summaryBlock(page);
    await block.evaluate((element) => element.setAttribute('data-test-mark', 'same-element'));

    await tabsNav(page).scrollIntoViewIfNeeded();
    for (const [tabId, expected] of [
      [OWN_TAB, OWN_SUMMARY],
      [otherTabs[0]!, game.summary],
      [OWN_TAB, OWN_SUMMARY],
    ] as const) {
      const before = await scrollY(page);
      await chooseTab(page, tabId);
      expect(pathnameOf(page)).toBe(withBase(routeOf(game, tabId)));
      await expectSummary(page, expected);
      await expect(block, `after choosing ${tabId}`).toHaveAttribute('data-test-mark', 'same-element');
      await expectResume(page, mainResume);
      expect(await scrollY(page), 'the tab change does not scroll the page').toBe(before);
    }
  });

  test('the other page is not affected: every tab there, this one included, shows that page\'s own summary', async ({ page }) => {
    await openRoute(page, routeOf(softdev, OWN_TAB));
    await expect(trackPage(page)).toHaveAttribute('data-track', 'softdev');
    await expect(trackPage(page)).toHaveAttribute('data-tab', OWN_TAB);
    await expectSummary(page, softdev.summary);
    for (const tabId of otherTabs) {
      await chooseTab(page, tabId);
      await expectSummary(page, softdev.summary);
    }
  });
});
