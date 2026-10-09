import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadContent, publishedOnly } from '../../scripts/lib/load-content';
import { createContentApi } from '../../src/content/selectors';
import { content, isExternal, normaliseSpace, paragraphsOf, routeOf, TRACK_IDS, withBase } from './support/content';
import { overrideContent } from './support/content-override';
import { cssVar, hexToRgb, openRoute, pathnameOf, scrollY, tabsNav, THEMES, trackPage } from './support/page';

/**
 * The hero (#about) on both pages, against the track profile, the summary and the resume of the
 * open tab, the badge and the stats. Other origins are blocked (openRoute), so the background
 * video never loads here: what these tests see is the gradient fallback. The video itself, the
 * pause button and the cases the real content cannot produce are in hero-video.spec.ts and
 * hero-fixture.spec.ts.
 */
const site = content.getSite();
const tabs = content.getTabs();

/** The same published content with "now" fixed, for the stats (see the stats test). */
const BUILD_MONTH = '2026-10';
const loaded = loadContent(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content'));
if (!loaded.ok) throw new Error('The content under /content is not valid.');
const statsApi = createContentApi(publishedOnly(loaded.content), { buildMonth: BUILD_MONTH });

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
 * one block between the name and the buttons — or no block at all when the text is blank.
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
    test('shows the tagline with the crown, the name one word per line and the summary verbatim', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const hero = page.locator('#about');
      const heading = hero.getByRole('heading', { level: 1 });
      // The text is the name as written; each word is drawn on a line of its own, in capitals.
      await expect(heading).toHaveText(site.name);
      const words = site.name.split(/\s+/).filter(Boolean);
      const lines = await heading.locator('span').evaluateAll((spans) => spans.map((span) => ({ text: span.textContent, top: Math.round(span.getBoundingClientRect().top) })));
      expect(lines.map((line) => line.text)).toEqual(words);
      for (let index = 1; index < lines.length; index += 1) expect(lines[index]!.top, `"${lines[index]!.text}" is under "${lines[index - 1]!.text}"`).toBeGreaterThan(lines[index - 1]!.top);
      await expect(heading).toHaveCSS('text-transform', 'uppercase');
      await expect(heading).toHaveCSS('font-weight', '800');
      await expect(heading).toHaveCSS('color', 'rgb(255, 255, 255)');
      // The name is not cut or spilled: it ends inside the page.
      const [headingBox, viewport] = [await heading.boundingBox(), page.viewportSize()!];
      expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(viewport.width);

      if (track.headline) {
        const tagline = hero.locator('[data-hero-tagline]');
        await expect(tagline).toHaveText(track.headline);
        await expect(tagline.locator('svg[data-icon="crown"]')).toHaveCount(1);
        await expect(tagline.locator('svg')).toHaveAttribute('aria-hidden', 'true');
        // Above the name.
        expect((await tagline.boundingBox())!.y).toBeLessThan(headingBox!.y);
      } else {
        await expect(hero.locator('[data-hero-tagline]')).toHaveCount(0);
      }

      // No tab in the address: the summary is the one of the page's first tab.
      const summary = content.getSummary(trackId, track.defaultTab);
      const text = normaliseSpace(await hero.evaluate((section) => section.textContent ?? ''));
      for (const paragraph of paragraphsOf(summary)) {
        expect(text).toContain(normaliseSpace(paragraph));
      }
      await expectSummary(page, summary);
    });

    test('has "See my work" and the resume button; the photo and the hero link buttons are not rendered any more', async ({ page }) => {
      await openRoute(page, routeOf(track));
      // No tab in the address: the page's first tab is open, and the resume is that tab's.
      await expect(trackPage(page)).toHaveAttribute('data-tab', track.defaultTab);
      const resume = content.getResume(trackId, track.defaultTab);
      await expectResume(page, resume);

      const work = page.locator('#about [data-hero-work]');
      if (site.workLabel.trim()) {
        await expect(work).toHaveText(site.workLabel.trim());
        await expect(work).toHaveAttribute('href', '#projects');
        await expect(work).not.toHaveAttribute('target', /.*/);
      } else {
        await expect(work).toHaveCount(0);
      }
      // "See my work" first, then the resume.
      const order = await page.locator('#about [data-hero-work], #about [data-hero-resume]').evaluateAll((buttons) => buttons.map((button) => (button.hasAttribute('data-hero-resume') ? 'resume' : 'work')));
      expect(order).toEqual([...(site.workLabel.trim() ? ['work'] : []), ...(resume.url.trim() ? ['resume'] : [])]);
      // Square buttons, each a 44px target; "See my work" is the accent outline, the resume the accent fill.
      for (const button of await page.locator('#about [data-hero-work], #about [data-hero-resume]').all()) {
        await expect(button).toHaveCSS('border-radius', '0px');
        await expect(button).toHaveCSS('text-transform', 'uppercase');
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const accent = hexToRgb(await cssVar(trackPage(page), '--color-accent'));
      const onAccent = hexToRgb(await cssVar(trackPage(page), '--color-on-accent'));
      if (site.workLabel.trim()) {
        const outlined = page.locator('#about [data-hero-work]');
        await expect(outlined).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(outlined).toHaveCSS('border-top-width', '1px');
        await expect(outlined).toHaveCSS('border-top-style', 'solid');
        await expect(outlined).toHaveCSS('border-top-color', accent);
        await expect(outlined).toHaveCSS('color', accent);
      }
      if (resume.url.trim()) {
        const filled = page.locator('#about [data-hero-resume]');
        await expect(filled).toHaveCSS('background-color', accent);
        await expect(filled).toHaveCSS('border-top-color', accent);
        await expect(filled).toHaveCSS('color', onAccent);
      }

      // Gone from the hero (the fields stay in the content): the photo and the link buttons.
      await expect(page.locator('[data-hero-link]')).toHaveCount(0);
      await expect(page.locator('[data-hero-photo]')).toHaveCount(0);
      await expect(page.locator('#about img')).toHaveCount(track.heroPoster ? 1 : 0);
      for (const link of heroLinks) await expect(page.locator(`#about a[href="${link.url}"]`)).toHaveCount(0);
    });

    test('shows the badge and the stats of this page (getHeroStats), or neither when there is none', async ({ page, isMobile }) => {
      // The "years" stat counts up to the month of the build: give the page a fixed one, and
      // work out what to expect with the same.
      await overrideContent(page, (bundle) => {
        bundle.buildMonth = BUILD_MONTH;
      });
      await openRoute(page, routeOf(track));
      const stats = statsApi.getHeroStats(trackId);
      expect(stats.length, 'the content has hero stats to show').toBeGreaterThan(0);
      const items = page.locator('#about [data-hero-stats] > li');
      if (stats.length === 0) {
        await expect(page.locator('#about [data-hero-stats]')).toHaveCount(0);
      } else {
        await expect(items).toHaveCount(stats.length);
        for (const [index, stat] of stats.entries()) await expect(items.nth(index)).toHaveText(`${stat.value} ${stat.label}`);
        // Side by side on a desktop screen.
        if (!isMobile && stats.length > 1) {
          const [first, second] = await Promise.all([items.nth(0).boundingBox(), items.nth(1).boundingBox()]);
          expect(second!.x).toBeGreaterThan(first!.x + first!.width);
          expect(second!.y).toBeCloseTo(first!.y, 0);
        }
      }

      const lines = [track.badgeLine1.trim(), track.badgeLine2.trim()].filter(Boolean);
      const badges = page.locator('#about [data-hero-badge]');
      if (lines.length === 0) {
        await expect(badges).toHaveCount(0);
      } else {
        // In the button row from 640px, under the stats below that; one of the two is displayed.
        const shown = page.locator(`#about [data-hero-badge="${isMobile ? 'below' : 'row'}"]`);
        await expect(shown).toBeVisible();
        await expect(page.locator(`#about [data-hero-badge="${isMobile ? 'row' : 'below'}"]`)).toBeHidden();
        for (const line of lines) await expect(shown).toContainText(line);
        await expect(shown.locator('svg[data-icon="award"]')).toHaveCount(1);
      }
    });

    for (const theme of THEMES) {
      test(`is one viewport tall, starts at the top of the page and is dark — ${theme}`, async ({ page }) => {
        await openRoute(page, routeOf(track), { theme });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const hero = page.locator('#about');
        await expect(hero).toHaveAttribute('data-on-dark', /.*/);
        const box = await hero.evaluate((section) => {
          const rect = section.getBoundingClientRect();
          return { top: Math.round(rect.top + window.scrollY), left: rect.left, width: rect.width, height: rect.height, client: document.documentElement.clientWidth, viewport: window.innerHeight };
        });
        expect(box.top).toBe(0);
        expect(box.left).toBe(0);
        expect(box.width).toBe(box.client);
        expect(box.height).toBeGreaterThanOrEqual(Math.max(560, box.viewport) - 1);
        // Its own dark fill and white text, whatever the theme.
        await expect(hero).toHaveCSS('background-color', 'rgb(5, 7, 11)');
        await expect(hero).toHaveCSS('color', 'rgb(255, 255, 255)');
        await expect(hero.getByRole('heading', { level: 1 })).toHaveCSS('color', 'rgb(255, 255, 255)');
      });
    }

    test('never needs the video address: with it unreachable the gradient shows, with no video element and no pause button left', async ({ page }) => {
      const requested: string[] = [];
      page.on('request', (request) => {
        if (request.resourceType() === 'media') requested.push(request.url());
      });
      // openRoute() blocks every other origin, the video's among them.
      await openRoute(page, routeOf(track));
      const hero = page.locator('#about');
      if (isExternal(track.heroVideo)) {
        await expect(hero.locator('video')).toHaveCount(0);
        await expect(hero.locator('[data-hero-pause]')).toHaveCount(0);
        // It did try the address from the content, and nothing else.
        expect([...new Set(requested)]).toEqual([track.heroVideo]);
      } else if (!track.heroVideo) {
        await expect(hero.locator('video')).toHaveCount(0);
        expect(requested).toEqual([]);
      }
      expect(await hero.evaluate((section) => getComputedStyle(section).backgroundImage)).toContain('radial-gradient');
      await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(hero.locator('[data-hero-scrim]')).toHaveCount(1);
    });

    test('the reveal runs as a CSS animation, block after block, and leaves everything visible', async ({ page }) => {
      await openRoute(page, routeOf(track));
      const blocks = page.locator('#about [data-hero-tagline], #about h1, #about [data-hero-summary], #about [data-hero-actions], #about [data-hero-stats]');
      const animations = await blocks.evaluateAll((list) => list.map((block) => ({ name: getComputedStyle(block).animationName, delay: parseFloat(getComputedStyle(block).animationDelay) })));
      expect(animations.length).toBeGreaterThanOrEqual(3);
      for (const animation of animations) expect(animation.name).not.toBe('none');
      for (let index = 1; index < animations.length; index += 1) expect(animations[index]!.delay).toBeGreaterThan(animations[index - 1]!.delay);
      for (const block of await blocks.all()) {
        await expect(block).toHaveCSS('opacity', '1');
        await expect(block).toHaveCSS('transform', /none|matrix\(1, 0, 0, 1, 0, 0\)/);
      }
      await expect(page.locator('#about [data-hero-resume], #about [data-hero-work]').first()).toBeVisible();
    });

    test('fits at 320px: nothing in the hero or the header pokes out sideways', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openRoute(page, routeOf(track));
      await expect(page.locator('#about h1')).toHaveCSS('opacity', '1');
      await page.waitForTimeout(1200);
      const poking = await page.locator('header *, #about *').evaluateAll((all) =>
        all
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.right > 320.5 || rect.left < -0.5);
          })
          .slice(0, 8)
          .map((element) => `${element.tagName.toLowerCase()}.${String(element.getAttribute('class'))}`),
      );
      expect(poking, poking.join('\n')).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
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
    // Between the name and the buttons, like the main summary.
    const around = await summaryBlock(page).evaluate((block) => ({
      before: block.previousElementSibling?.tagName ?? '',
      beforeText: block.previousElementSibling?.textContent ?? '',
      afterHasButtons: block.nextElementSibling?.querySelector('[data-hero-resume]') !== null,
    }));
    expect(around).toEqual({ before: 'H1', beforeText: site.name, afterHasButtons: true });

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
