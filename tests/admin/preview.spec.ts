/**
 * The per-page content preview.
 *
 * 1. Its rules (public/admin/preview-logic.js) are a second copy of the site's rules
 *    (src/content/selectors.ts), because the dashboard is a static page that cannot import the
 *    site's code. Here the copy is run in the browser, as served, for every content item and
 *    compared with the site's own selectors. A difference fails the test.
 * 2. The preview pane of the real dashboard shows both pages with those results, follows the
 *    form while the owner types, and says plainly that it is a content preview.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadContent } from '../../scripts/lib/load-content';
import type { ContentBundle } from '../../src/content/bundle';
import { createContentApi } from '../../src/content/selectors';
import type { SocialLink, TrackId } from '../../src/content/types';
import { Dashboard, cdnSkipMessage, cdnStatus } from './support/dashboard';
import { contentDir, contentTree } from './support/env';

const PAGE_IDS: readonly TrackId[] = ['game', 'softdev'];

/** One page's links in each place (short names, in order) and its resume for every tab. */
interface LinksAndResumes {
  hero: string[];
  footer: string[];
  resumes: Array<{ url: string; label: string }>;
}

function content() {
  const loaded = loadContent(contentDir);
  if (!loaded.ok) throw new Error('the content does not validate');
  return loaded.content;
}

test.describe('preview rules equal the site rules', () => {
  test('for every item under /content', async ({ page }) => {
    const bundle = content();
    // Published copies: the site's selectors only ever see published items.
    const published = {
      ...bundle,
      projects: bundle.projects.map((item) => ({ ...item, published: true })),
      experience: bundle.experience.map((item) => ({ ...item, published: true })),
      skills: bundle.skills.map((item) => ({ ...item, published: true })),
      links: bundle.links.map((item) => ({ ...item, published: true })),
    };
    const api = createContentApi(published);

    await page.goto('admin/preview-logic.js');
    const fromPreview = await page.evaluate(
      async ({ data, pages }) => {
        const logic = (await import(window.location.href)) as Record<string, (...args: unknown[]) => unknown>;
        const call = (name: string, ...args: unknown[]): unknown => {
          const fn = logic[name];
          if (typeof fn !== 'function') throw new Error(`preview-logic.js does not export ${name}`);
          return fn(...args);
        };
        return {
          pages: (logic.PAGES as unknown as Array<{ id: string }>).map((entry) => entry.id),
          allTab: logic.ALL_TAB_ID as unknown as string,
          tabs: call('tabs', data.site),
          hover: data.projects.map((project) => (call('hoverText', project, data.site) as { text: string }).text),
          bullets: pages.map((id) => data.experience.map((job) => (call('resolvedBullets', job, id) as { bullets: string[] }).bullets)),
          belongs: pages.map((id) => data.projects.map((project) => call('belongsTo', project.audience, id))),
          hero: pages.map((id) => data.links.filter((link) => (call('linkOnPage', link, id) as { hero: boolean }).hero).map((link) => link.slug)),
          footer: pages.map((id) => data.links.filter((link) => (call('linkOnPage', link, id) as { footer: boolean }).footer).map((link) => link.slug)),
          emphasis: pages.map((id) => data.skills.map((group) => call('isEmphasised', group, id))),
          positions: pages.map((id) => data.projects.map((project) => call('positionOn', project, id))),
          buttons: data.projects.map((project) => {
            const result = call('projectButtons', project) as { shown: Array<{ url: string }>; hidden: unknown[]; gameplay: boolean };
            return { shown: result.shown.map((link) => link.url), hidden: result.hidden.length, gameplay: result.gameplay };
          }),
        };
      },
      { data: JSON.parse(JSON.stringify(published)) as typeof published, pages: [...PAGE_IDS] },
    );

    expect(fromPreview.pages).toEqual([...PAGE_IDS]);
    expect(fromPreview.allTab).toBe('all');
    expect(fromPreview.tabs).toEqual(api.getTabs());
    expect(fromPreview.hover).toEqual(published.projects.map((project) => api.getHoverText(project)));

    PAGE_IDS.forEach((id, index) => {
      const jobs = api.getExperience(id);
      expect(fromPreview.bullets[index], `bullet points on the ${id} page`).toEqual(
        published.experience.map((job) => jobs.find((candidate) => candidate.slug === job.slug)?.resolvedBullets),
      );
      expect(fromPreview.hero[index]?.slice().sort(), `links next to the name on the ${id} page`).toEqual(
        api.getLinks(id, 'hero').map((link) => link.slug).sort(),
      );
      expect(fromPreview.footer[index]?.slice().sort(), `footer links on the ${id} page`).toEqual(
        api.getLinks(id, 'footer').map((link) => link.slug).sort(),
      );
      expect(fromPreview.belongs[index]).toEqual(published.projects.map((project) => project.audience === 'both' || project.audience === id));
      expect(fromPreview.emphasis[index]).toEqual(published.skills.map((group) => group.emphasis === 'both' || group.emphasis === id));
      expect(fromPreview.positions[index]).toEqual(published.projects.map((project) => (id === 'game' ? project.orderGame : project.orderSoftdev)));
    });
    expect(fromPreview.buttons).toEqual(
      published.projects.map((project) => ({
        shown: project.links.filter((link) => link.url.trim() !== '').map((link) => link.url),
        hidden: project.links.filter((link) => link.url.trim() === '').length,
        gameplay: project.videoUrl !== '',
      })),
    );
  });

  test('for half-filled items (what a form looks like while it is being typed)', async ({ page }) => {
    await page.goto('admin/preview-logic.js');
    const result = await page.evaluate(async () => {
      const logic = (await import(window.location.href)) as Record<string, (...args: unknown[]) => unknown>;
      const site = { allTabLabel: 'All', categories: [{ id: 'unity', label: 'Unity3D', order: 20, hoverWithVideo: 'Watch It', hoverWithoutVideo: 'See It' }] };
      return {
        emptyProject: logic.hoverText?.({}, site),
        own: logic.hoverText?.({ hoverText: 'Mine', category: 'unity' }, site),
        withVideo: logic.hoverText?.({ category: 'unity', videoUrl: 'https://youtu.be/x' }, site),
        withoutVideo: logic.hoverText?.({ category: 'unity', videoUrl: '' }, site),
        blankRows: logic.cleanList?.(['a', '', '  ', null, 'b ']),
        noBullets: logic.resolvedBullets?.({}, 'game'),
        pageSet: logic.resolvedBullets?.({ bullets: ['d'], bulletsGame: ['', 'g'] }, 'game'),
        fallBack: logic.resolvedBullets?.({ bullets: ['d'], bulletsGame: [''] }, 'game'),
        rows: logic.cleanScreenshots?.([{ src: '', alt: 'x' }, { src: '/uploads/a.webp' }, null]),
        links: logic.projectButtons?.({ links: [{ label: '', url: '' }, { label: 'Code', url: '' }, { label: 'Play', url: 'https://x.y' }] }),
        noAddress: logic.linkOnPage?.({ url: '', audience: 'both', showInHero: true }, 'game'),
        otherPage: logic.linkOnPage?.({ url: 'https://x.y', audience: 'softdev', showInHero: true }, 'game'),
        words: [logic.countWords?.(''), logic.countWords?.('  a  b '), logic.countWords?.(undefined)],
        tabs: logic.tabs?.({}),
      };
    });
    expect(result.emptyProject).toEqual({ text: 'View Screenshots', from: 'fallback' });
    expect(result.own).toEqual({ text: 'Mine', from: 'project' });
    expect(result.withVideo).toEqual({ text: 'Watch It', from: 'tab' });
    expect(result.withoutVideo).toEqual({ text: 'See It', from: 'tab' });
    expect(result.blankRows).toEqual(['a', 'b ']);
    expect(result.noBullets).toEqual({ bullets: [], from: 'default' });
    expect(result.pageSet).toEqual({ bullets: ['g'], from: 'page' });
    expect(result.fallBack).toEqual({ bullets: ['d'], from: 'default' });
    expect(result.rows).toEqual([{ src: '/uploads/a.webp', alt: '' }]);
    expect(result.links).toEqual({ shown: [{ label: 'Play', url: 'https://x.y', kind: 'other' }], hidden: [{ label: 'Code', url: '', kind: 'other' }], gameplay: false });
    expect(result.noAddress).toMatchObject({ shown: false, reason: 'no-address' });
    expect(result.otherPage).toMatchObject({ shown: false, reason: 'other-page' });
    expect(result.words).toEqual([0, 2, 0]);
    expect(result.tabs).toEqual([{ id: 'all', label: '' }]);
  });

  /** The preview's answers for the links of each place and the resume of each tab, per page. */
  async function previewLinksAndResumes(page: Page, data: ContentBundle): Promise<LinksAndResumes[]> {
    await page.goto('admin/preview-logic.js');
    return page.evaluate(
      async ({ data: bundle, pages }) => {
        const logic = (await import(window.location.href)) as Record<string, (...args: unknown[]) => unknown>;
        const call = (name: string, ...args: unknown[]): unknown => {
          const fn = logic[name];
          if (typeof fn !== 'function') throw new Error(`preview-logic.js does not export ${name}`);
          return fn(...args);
        };
        const tabIds = (call('tabs', bundle.site) as Array<{ id: string }>).map((tab) => tab.id);
        return pages.map((id) => {
          const track = bundle.tracks.find((candidate) => candidate.id === id);
          return {
            hero: (call('linksInPlace', bundle.links, id, 'hero') as Array<{ slug: string }>).map((link) => link.slug),
            footer: (call('linksInPlace', bundle.links, id, 'footer') as Array<{ slug: string }>).map((link) => link.slug),
            resumes: tabIds.map((tab) => {
              const resume = call('resumeForTab', track, tab) as { url: string; label: string };
              return { url: resume.url, label: resume.label };
            }),
          };
        });
      },
      { data: JSON.parse(JSON.stringify(data)) as ContentBundle, pages: [...PAGE_IDS] },
    );
  }

  /** The site's own answers to the same questions. */
  function siteLinksAndResumes(data: ContentBundle): LinksAndResumes[] {
    const api = createContentApi(data);
    return PAGE_IDS.map((id) => ({
      hero: api.getLinks(id, 'hero').map((link) => link.slug),
      footer: api.getLinks(id, 'footer').map((link) => link.slug),
      resumes: api.getTabs().map((tab) => api.getResume(id, tab.id)),
    }));
  }

  test('link order in each place and the resume of each tab, for the real content', async ({ page }) => {
    const bundle = content();
    const fromSite = siteLinksAndResumes(bundle);
    expect(await previewLinksAndResumes(page, bundle)).toEqual(fromSite);
    // Not vacuous: there are links in both places and a resume answer for every tab.
    expect(fromSite.some((entry) => entry.footer.length > 1)).toBe(true);
    expect(fromSite.every((entry) => entry.resumes.length === bundle.site.categories.length + 1)).toBe(true);
  });

  test('link order in each place and the resume of each tab, for awkward cases', async ({ page }) => {
    const bundle = content();
    const template = bundle.links[0];
    const [first, second] = bundle.site.categories;
    test.skip(!template || !first || !second, 'the content has no link or fewer than two project tabs');
    if (!template || !first || !second) return;
    const link = (overrides: Partial<SocialLink>): SocialLink => ({
      ...template,
      url: 'https://example.com/x',
      audience: 'both',
      showInHero: true,
      showInFooter: true,
      published: true,
      ...overrides,
    });
    const withoutFooterOrder = (overrides: Partial<SocialLink>): SocialLink => {
      const { orderFooter: _unset, ...rest } = link(overrides);
      return rest as SocialLink;
    };
    const awkward: ContentBundle = {
      ...bundle,
      links: [
        // Ties: footer by orderFooter, then order, then short name; hero by order, label, short name.
        link({ slug: 'zeta', label: 'alpha', order: 20, orderFooter: 10 }),
        link({ slug: 'beta', label: 'Zulu', order: 20, orderFooter: 10 }),
        link({ slug: 'alpha', label: 'Alpha', order: 20, orderFooter: 10 }),
        link({ slug: 'late-hero-early-footer', label: 'M', order: 90, orderFooter: 1 }),
        link({ slug: 'early-hero-late-footer', label: 'M', order: 1, orderFooter: 90 }),
        link({ slug: 'negative', label: 'N', order: -5, orderFooter: -5 }),
        // A link stored without a footer order sorts by its order there.
        withoutFooterOrder({ slug: 'no-footer-order', label: 'O', order: 15 }),
        // Not everywhere: one page only, one place only, no address, a draft.
        link({ slug: 'game-only', label: 'G', audience: 'game', order: 30, orderFooter: 30 }),
        link({ slug: 'softdev-only', label: 'S', audience: 'softdev', order: 30, orderFooter: 5 }),
        link({ slug: 'hero-only', label: 'H', showInFooter: false, order: 40, orderFooter: 0 }),
        link({ slug: 'footer-only', label: 'F', showInHero: false, order: 0, orderFooter: 40 }),
        link({ slug: 'no-address', label: 'X', url: '', order: 2, orderFooter: 2 }),
        link({ slug: 'spaces-only', label: 'X', url: '   ', order: 2, orderFooter: 2 }),
        link({ slug: 'draft', label: 'D', published: false, order: 3, orderFooter: 3 }),
      ],
      tracks: bundle.tracks.map((track) => ({
        ...track,
        tabResumes:
          track.id === 'game'
            ? [
                { tab: first.id, url: 'https://example.com/first', label: '' },
                { tab: second.id, url: '   ', label: 'Never Used' },
                { tab: 'all', url: 'https://example.com/everything', label: 'Full Resume' },
              ]
            : [{ tab: first.id, url: 'https://example.com/software-first', label: '   ' }],
      })),
    };
    const fromSite = siteLinksAndResumes(awkward);
    expect(await previewLinksAndResumes(page, awkward)).toEqual(fromSite);
    // The cases really differ between the two places and between the two pages.
    expect(fromSite[0]?.hero).not.toEqual(fromSite[0]?.footer);
    expect(fromSite[0]?.footer).not.toEqual(fromSite[1]?.footer);
    expect(fromSite[0]?.resumes.map((resume) => resume.url)).toContain('https://example.com/everything');
    expect(fromSite[1]?.resumes[0]).toEqual({ url: 'https://example.com/software-first', label: awkward.tracks[1]?.resumeLabel });
  });

  test('links and resumes of half-filled items', async ({ page }) => {
    await page.goto('admin/preview-logic.js');
    const result = await page.evaluate(async () => {
      const logic = (await import(window.location.href)) as Record<string, (...args: unknown[]) => unknown>;
      const page2 = { resumeUrl: 'https://example.com/main', resumeLabel: 'Main Resume' };
      return {
        positions: [
          logic.linkPosition?.({}, 'hero'),
          logic.linkPosition?.({}, 'footer'),
          logic.linkPosition?.({ order: 30 }, 'footer'),
          logic.linkPosition?.({ order: 30, orderFooter: null }, 'footer'),
          logic.linkPosition?.({ order: 30, orderFooter: 0 }, 'footer'),
          logic.linkPosition?.({ order: 30, orderFooter: 10 }, 'hero'),
          logic.linkPosition?.(undefined, 'footer'),
        ],
        noLinks: [logic.linksInPlace?.(undefined, 'game', 'footer'), logic.linksInPlace?.([null, {}, { published: true }], 'game', 'hero')],
        rows: logic.cleanTabResumes?.([{ tab: 'unity' }, { tab: '', url: 'https://x.y' }, { url: 'https://x.y' }, null, { tab: null }, { tab: 'unreal', url: 'https://x.y/u', label: 'U' }]),
        notAList: logic.cleanTabResumes?.(undefined),
        noRows: logic.resumeForTab?.(page2, 'unity'),
        emptyPage: logic.resumeForTab?.({}, 'unity'),
        noPage: logic.resumeForTab?.(undefined, 'unity'),
        // A row whose tab is still unselected (the form holds null) is not a row yet.
        unselected: logic.resumeForTab?.({ ...page2, tabResumes: [{ tab: null, url: 'https://x.y/never', label: '' }] }, 'unity'),
        noLinkYet: logic.resumeForTab?.({ ...page2, tabResumes: [{ tab: 'unity', url: '', label: 'Unity Resume' }] }, 'unity'),
        own: logic.resumeForTab?.({ ...page2, tabResumes: [{ tab: 'unity', url: 'https://x.y/unity', label: 'Unity Resume' }] }, 'unity'),
        ownNoLabel: logic.resumeForTab?.({ ...page2, tabResumes: [{ tab: 'unity', url: 'https://x.y/unity' }] }, 'unity'),
        otherTab: logic.resumeForTab?.({ ...page2, tabResumes: [{ tab: 'unity', url: 'https://x.y/unity', label: 'Unity Resume' }] }, 'unreal'),
      };
    });
    expect(result.positions).toEqual([0, 0, 30, 30, 0, 30, 0]);
    expect(result.noLinks).toEqual([[], []]);
    expect(result.rows).toEqual([
      { tab: 'unity', url: '', label: '' },
      { tab: 'unreal', url: 'https://x.y/u', label: 'U' },
    ]);
    expect(result.notAList).toEqual([]);
    const main = { url: 'https://example.com/main', label: 'Main Resume', from: 'main' };
    expect(result.noRows).toEqual(main);
    expect(result.emptyPage).toEqual({ url: '', label: '', from: 'main' });
    expect(result.noPage).toEqual({ url: '', label: '', from: 'main' });
    expect(result.unselected).toEqual(main);
    expect(result.noLinkYet).toEqual(main);
    expect(result.own).toEqual({ url: 'https://x.y/unity', label: 'Unity Resume', from: 'tab' });
    expect(result.ownNoLabel).toEqual({ url: 'https://x.y/unity', label: 'Main Resume', from: 'tab' });
    expect(result.otherTab).toEqual(main);
  });
});

test.describe('the preview pane of the dashboard', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The dashboard is driven once, in the desktop project: these checks are about content, not layout.');
    const cdn = await cdnStatus(request);
    test.skip(!cdn.ok, cdnSkipMessage(cdn));
  });

  test('a project: both pages side by side, the hover text of its tab, hidden buttons named, and it follows the form', async ({ page }) => {
    const bundle = content();
    const api = createContentApi(bundle);
    const project = bundle.projects.find((item) => item.published && item.hoverText === '' && item.links.some((link) => link.url === ''));
    test.skip(!project, 'no published project with a tab default and a button without an address in the content');
    if (!project) return;

    const dashboard = await Dashboard.start(page, contentTree());
    await dashboard.openEntry('projects', project.slug);
    const preview = dashboard.preview;
    await expect(preview.locator('.kk-note')).toContainText('Content preview.');
    await expect(preview.locator('.kk-note')).toContainText('the live site is the final look');
    await expect(preview.locator('.kk-page')).toHaveCount(2);
    await expect(preview.locator('.kk-page[data-track="game"] .kk-page__title')).toHaveText(/game page/i);
    await expect(preview.locator('.kk-page[data-track="softdev"] .kk-page__title')).toHaveText(/software page/i);
    await expect(preview.locator('.kk-draft')).toHaveCount(0);

    const expectedHover = api.getHoverText(project);
    for (const id of PAGE_IDS) {
      const panel = preview.locator(`.kk-page[data-track="${id}"]`);
      await expect(panel.locator('.kk-card__title')).toHaveText(project.title);
      await expect(panel.locator('.kk-card__hover')).toHaveText(expectedHover);
      await expect(panel.locator('.kk-facts')).toContainText('the default of the tab');
      await expect(panel.locator('.kk-facts')).toContainText('no address yet');
      await expect(panel.locator('.kk-where')).toContainText(api.getTabs().find((tab) => tab.id === project.category)?.label ?? '???');
    }
    const own = project.audience === 'softdev' ? 'softdev' : 'game';
    if (project.audience !== 'both') {
      const other = own === 'game' ? 'softdev' : 'game';
      await expect(preview.locator(`.kk-page[data-track="${own}"] .kk-facts`)).toContainText('among this page’s own projects');
      await expect(preview.locator(`.kk-page[data-track="${other}"] .kk-facts`)).toContainText('after this page’s own projects');
    }

    // Typing a hover text of its own replaces the tab's default in both panels at once.
    await dashboard.fill('Card hover text', 'Play It Now');
    for (const id of PAGE_IDS) await expect(preview.locator(`.kk-page[data-track="${id}"] .kk-card__hover`)).toHaveText('Play It Now');
    // Switching "Published" off shows the draft notice.
    await dashboard.flip('Published');
    await expect(preview.locator('.kk-draft')).toContainText('not on the site');
  });

  test('a job: a bullet set for one page shows on that page only', async ({ page }) => {
    const bundle = content();
    const job = bundle.experience.find((item) => item.bulletsGame.length === 0 && item.bulletsSoftdev.length === 0 && item.bullets.length > 0);
    test.skip(!job, 'every job already has a page-specific bullet set');
    if (!job) return;

    const dashboard = await Dashboard.start(page, contentTree());
    await dashboard.openEntry('experience', job.slug);
    const preview = dashboard.preview;
    for (const id of PAGE_IDS) {
      await expect(preview.locator(`.kk-page[data-track="${id}"] .kk-bullets li`)).toHaveText(job.bullets);
      await expect(preview.locator(`.kk-page[data-track="${id}"] .kk-facts`)).toContainText('The default set');
    }
    const softwareSet = await dashboard.shown('Bullet points for the software page only');
    await softwareSet.getByRole('textbox').first().fill('Shipped a backend service.');
    await expect(preview.locator('.kk-page[data-track="softdev"] .kk-bullets li')).toHaveText(['Shipped a backend service.']);
    await expect(preview.locator('.kk-page[data-track="softdev"] .kk-facts')).toContainText('This page’s own set (1)');
    await expect(preview.locator('.kk-page[data-track="game"] .kk-bullets li')).toHaveText(job.bullets);
  });

  test('a link set to one page is shown as hidden on the other', async ({ page }) => {
    const bundle = content();
    const link = bundle.links.find((item) => item.audience !== 'both' && item.url !== '' && (item.showInHero || item.showInFooter));
    test.skip(!link, 'no link in the content is limited to one page');
    if (!link) return;
    const other = link.audience === 'game' ? 'softdev' : 'game';

    const dashboard = await Dashboard.start(page, contentTree());
    await dashboard.openEntry('links', link.slug);
    await expect(dashboard.preview.locator(`.kk-page[data-track="${link.audience}"] .kk-button`).first()).toHaveText(link.label);
    await expect(dashboard.preview.locator(`.kk-page[data-track="${other}"]`)).toContainText('Not shown — the link is set to the other page only.');
  });

  test('a page and the site settings get a single panel', async ({ page }) => {
    const bundle = content();
    const dashboard = await Dashboard.start(page, contentTree());
    const softdev = bundle.tracks.find((track) => track.id === 'softdev');
    await dashboard.openEntry('pages', 'softdev');
    await expect(dashboard.preview.locator('.kk-page')).toHaveCount(1);
    await expect(dashboard.preview.locator('.kk-page[data-track="softdev"] .kk-hero__name')).toHaveText(bundle.site.name);
    await expect(dashboard.preview.locator('.kk-hero__headline')).toHaveText(softdev?.headline ?? '');
    await expect(dashboard.preview.locator('.kk-facts')).toContainText(
      createContentApi(bundle).getTabs().find((tab) => tab.id === softdev?.defaultTab)?.label ?? '???',
    );

    await dashboard.openEntry('_singletons', 'site');
    await expect(dashboard.preview.locator('.kk-tabs li')).toHaveText(createContentApi(bundle).getTabs().map((tab) => tab.label));
    await expect(dashboard.preview.locator('.kk-credit p')).toHaveText(bundle.site.credit);
  });

  /** The answer of one "label: answer" line of a preview panel (the line starts with its label). */
  const fact = (scope: Locator, label: string): Locator =>
    scope
      .locator('.kk-fact')
      .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
      .locator('dd');

  /** The real content with one file's keys replaced (key order kept). */
  function treeWith(repoPath: string, change: Record<string, unknown>): Record<string, string> {
    const files = contentTree();
    const data = JSON.parse(files[repoPath] ?? '{}') as Record<string, unknown>;
    for (const key of Object.keys(change)) if (!(key in data)) throw new Error(`${repoPath} has no key "${key}"`);
    files[repoPath] = `${JSON.stringify({ ...data, ...change }, null, 2)}\n`;
    return files;
  }

  test('a link: its position next to the name and in the footer, each following its own field', async ({ page }) => {
    const bundle = content();
    const link = bundle.links.find((item) => item.published && item.url !== '' && item.showInHero && item.showInFooter);
    test.skip(!link, 'no published link is shown in both places');
    if (!link) return;
    const own = link.audience === 'softdev' ? 'softdev' : 'game';

    const dashboard = await Dashboard.start(page, contentTree());
    await dashboard.openEntry('links', link.slug);
    const panel = dashboard.preview.locator(`.kk-page[data-track="${own}"]`);
    await expect(fact(panel, 'Position next to your name')).toHaveText(String(link.order));
    await expect(fact(panel, 'Position in the footer')).toHaveText(String(link.orderFooter));

    const footerBox = await dashboard.reveal(dashboard.editor.getByRole('spinbutton', { name: 'Footer order', exact: true }));
    await footerBox.fill(String(link.orderFooter + 7));
    await expect(fact(panel, 'Position in the footer')).toHaveText(String(link.orderFooter + 7));
    await expect(fact(panel, 'Position next to your name'), 'the other place did not move').toHaveText(String(link.order));

    const heroBox = await dashboard.reveal(dashboard.editor.getByRole('spinbutton', { name: 'Position next to your name', exact: true }));
    await heroBox.fill(String(link.order + 3));
    await expect(fact(panel, 'Position next to your name')).toHaveText(String(link.order + 3));
    await expect(fact(panel, 'Position in the footer')).toHaveText(String(link.orderFooter + 7));
  });

  test('a page: which resume each prepared tab opens, following the form', async ({ page }) => {
    const bundle = content();
    const game = bundle.tracks.find((track) => track.id === 'game');
    const [first] = createContentApi(bundle).getTabs().filter((tab) => tab.id !== 'all');
    test.skip(!game || !first || game.resumeUrl === '', 'the game page has no resume or the site has no project tab');
    if (!game || !first) return;

    const files = treeWith('content/tracks/game.json', { tabResumes: [{ tab: first.id, url: '', label: '' }] });
    files['content/tracks/softdev.json'] = treeWith('content/tracks/softdev.json', { tabResumes: [] })['content/tracks/softdev.json'] ?? '';
    const dashboard = await Dashboard.start(page, files);

    // A page without rows says so.
    await dashboard.openEntry('pages', 'softdev');
    await expect(fact(dashboard.preview.locator('.kk-page'), 'Resume per tab')).toHaveText('None — every tab uses the resume button above.');

    // A prepared row without a link changes nothing yet.
    await dashboard.openEntry('pages', 'game');
    const panel = dashboard.preview.locator('.kk-page[data-track="game"]');
    const answer = fact(panel, `Resume on the ${first.label} tab`);
    await expect(answer).toHaveText('No link yet — this tab uses the resume button above.');
    await expect(fact(panel, 'Resume per tab')).toHaveCount(0);

    // Typing the link, then a button text: the preview follows.
    const list = await dashboard.shown('Resume for a specific tab');
    const linkBox = list.getByRole('textbox', { name: 'Resume link for this tab', exact: true });
    const unfold = list.getByRole('button', { name: 'Expand', exact: true });
    for (let attempt = 0; attempt < 10 && (await linkBox.count()) === 0; attempt += 1) {
      if (await unfold.count()) await unfold.first().click();
      else await page.waitForTimeout(100);
    }
    await linkBox.fill('https://example.com/own-resume');
    await expect(answer).toHaveText(`Opens https://example.com/own-resume — button text “${game.resumeLabel || 'Resume'}”.`);
    await list.getByRole('textbox', { name: 'Button text for this tab', exact: true }).fill('Own Resume');
    await expect(answer).toHaveText('Opens https://example.com/own-resume — button text “Own Resume”.');
    // The main resume button of the page is still the main one.
    await expect(fact(panel, 'Resume button')).toHaveText(`Opens ${game.resumeUrl}`);

    // A second row for the same tab is called out before it can stop a deploy.
    await list.getByRole('button', { name: /Add.*Resume for one tab/ }).click();
    await expect(list.getByRole('radiogroup', { name: 'Tab with its own resume', exact: true })).toHaveCount(2);
    await list.getByRole('radiogroup', { name: 'Tab with its own resume', exact: true }).last().getByRole('radio', { name: first.label, exact: true }).check();
    await expect(answer).toHaveCount(2);
    await expect(answer.last()).toContainText('This tab already has a row above');
  });

  test('site settings: the logo picture when there is one, the logo letters when there is none', async ({ page }) => {
    const bundle = content();
    const dashboard = await Dashboard.start(page, treeWith('content/site.json', { logo: '/images/logo-96.webp', logoAlt: 'Fixture logo' }));
    await dashboard.openEntry('_singletons', 'site');
    const preview = dashboard.preview;

    const image = preview.locator('img.kk-nav__logo-image');
    await expect(image).toHaveAttribute('alt', 'Fixture logo');
    await expect(image).toHaveAttribute('src', /\/images\/logo-96\.webp$/);
    // The picture is the real file, served by the site, at the size it was made.
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBe(96);
    await expect(preview.locator('.kk-nav__logo')).toHaveCount(0);
    await expect(fact(preview.locator('.kk-page'), 'Logo in the top-left corner')).toHaveText('The picture /images/logo-96.webp, described as “Fixture logo”.');

    await (await dashboard.shown('Logo image')).getByRole('button', { name: 'Remove Image' }).click();
    await expect(image).toHaveCount(0);
    await expect(preview.locator('.kk-nav__logo')).toHaveText(bundle.site.monogram);
    await expect(fact(preview.locator('.kk-page'), 'Logo in the top-left corner')).toHaveText(`No logo image — the letters “${bundle.site.monogram}” are shown.`);
  });
});
