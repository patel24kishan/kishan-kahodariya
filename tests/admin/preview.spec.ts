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
import { expect, test } from '@playwright/test';
import { loadContent } from '../../scripts/lib/load-content';
import { createContentApi } from '../../src/content/selectors';
import type { TrackId } from '../../src/content/types';
import { Dashboard, cdnSkipMessage, cdnStatus } from './support/dashboard';
import { contentDir, contentTree } from './support/env';

const PAGE_IDS: readonly TrackId[] = ['game', 'softdev'];

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
});
