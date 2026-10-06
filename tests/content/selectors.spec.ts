/**
 * Behaviour of the content API (src/content/index.ts). The functions live in
 * src/content/selectors.ts as pure functions over a content bundle, so they are tested here
 * with small hand-made bundles. plugin.spec.ts checks the wiring to the real content.
 */
import { expect, test } from '@playwright/test';
import { loadContent, publishedOnly } from '../../scripts/lib/load-content';
import type { ContentBundle } from '../../src/content/bundle';
import { createContentApi } from '../../src/content/selectors';
import {
  UNPUBLISHED_MARKER,
  fixtureBundle,
  makeCertificate,
  makeEducation,
  makeExperience,
  makeLink,
  makeProject,
  makeSite,
  makeSkillGroup,
  makeTrack,
  realContentDir,
} from './helpers';

const slugs = (items: readonly { slug: string }[]): string[] => items.map((item) => item.slug);

function bundle(overrides: Partial<ContentBundle> = {}): ContentBundle {
  return {
    site: makeSite(),
    tracks: [makeTrack('game'), makeTrack('softdev')],
    projects: [],
    experience: [],
    skills: [],
    links: [],
    education: [],
    certificates: [],
    ...overrides,
  };
}

test.describe('site, tracks and tabs', () => {
  test('getSite, getTracks (game first), getTrack, getTrackByRoute', () => {
    // Stored in the "wrong" order on purpose.
    const api = createContentApi(bundle({ tracks: [makeTrack('softdev'), makeTrack('game')] }));
    expect(api.getSite().name).toBe('Fixture Person');
    expect(api.getTracks().map((track) => track.id)).toEqual(['game', 'softdev']);
    expect(api.getTrack('softdev').route).toBe('softdev');
    expect(api.getTrackByRoute('gamedev')?.id).toBe('game');
    expect(api.getTrackByRoute('softdev')?.id).toBe('softdev');
    expect(api.getTrackByRoute('game')).toBeUndefined();
    expect(api.getTrackByRoute('')).toBeUndefined();
  });

  test('getTrack throws for a track that does not exist', () => {
    const api = createContentApi(bundle({ tracks: [makeTrack('game')] }));
    expect(() => api.getTrack('softdev')).toThrow(/Unknown track: softdev/);
  });

  test('getTabs: categories by order, then the "all" tab with its label', () => {
    const site = makeSite({ allTabLabel: 'Everything' });
    // Give the categories a new order: webapps, unreal, unity.
    site.categories = [
      { ...site.categories[0]!, order: 20 },
      { ...site.categories[1]!, order: 30 },
      { ...site.categories[2]!, order: 10 },
    ];
    const api = createContentApi(bundle({ site }));
    expect(api.getTabs()).toEqual([
      { id: 'webapps', label: 'Web Apps' },
      { id: 'unreal', label: 'Unreal' },
      { id: 'unity', label: 'Unity3D' },
      { id: 'all', label: 'Everything' },
    ]);
    // The stored order is not changed by reading it.
    expect(site.categories.map((category) => category.id)).toEqual(['unreal', 'unity', 'webapps']);
  });

  test('resolveTab: a valid tab is kept, anything else falls back to the page default', () => {
    const api = createContentApi(bundle());
    expect(api.resolveTab('game', 'unreal')).toBe('unreal');
    expect(api.resolveTab('game', 'webapps')).toBe('webapps');
    expect(api.resolveTab('softdev', 'all')).toBe('all');
    expect(api.resolveTab('game', 'godot')).toBe('unity');
    expect(api.resolveTab('softdev', 'godot')).toBe('webapps');
    expect(api.resolveTab('game', undefined)).toBe('unity');
    expect(api.resolveTab('softdev', '')).toBe('webapps');
    expect(api.resolveTab('game', 'Unity')).toBe('unity'); // ids are case-sensitive
    // A page whose default is "all".
    const allDefault = createContentApi(bundle({ tracks: [makeTrack('game', { defaultTab: 'all' }), makeTrack('softdev')] }));
    expect(allDefault.resolveTab('game', 'nope')).toBe('all');
  });

  test('getAllRoutes: "/", then each page and each of its tabs', () => {
    const api = createContentApi(bundle());
    expect(api.getAllRoutes()).toEqual([
      '/',
      '/gamedev',
      '/gamedev/unreal',
      '/gamedev/unity',
      '/gamedev/webapps',
      '/gamedev/all',
      '/softdev',
      '/softdev/unreal',
      '/softdev/unity',
      '/softdev/webapps',
      '/softdev/all',
    ]);
    // A category added by the owner gets its routes on both pages.
    const site = makeSite();
    site.categories.push({ id: 'godot', label: 'Godot', order: 15, hoverWithVideo: '', hoverWithoutVideo: '' });
    const extended = createContentApi(bundle({ site })).getAllRoutes();
    expect(extended).toContain('/gamedev/godot');
    expect(extended).toContain('/softdev/godot');
    expect(extended.indexOf('/gamedev/godot')).toBe(extended.indexOf('/gamedev/unreal') + 1);
    for (const route of extended) expect(route === '/' || /^\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(route), route).toBe(true);
  });
});

test.describe('getProjects', () => {
  const projects = [
    makeProject({ slug: 'a', title: 'Zeta', category: 'unity', audience: 'game', orderGame: 30, orderSoftdev: 10 }),
    makeProject({ slug: 'b', title: 'Alpha', category: 'unity', audience: 'game', orderGame: 10, orderSoftdev: 30 }),
    makeProject({ slug: 'c', title: 'Web One', category: 'webapps', audience: 'softdev', orderGame: 5, orderSoftdev: 20 }),
    makeProject({ slug: 'd', title: 'Featured Web', category: 'webapps', audience: 'softdev', featured: true, orderGame: 99, orderSoftdev: 99 }),
    makeProject({ slug: 'e', title: 'For Both', category: 'unreal', audience: 'both', orderGame: 20, orderSoftdev: 5 }),
    makeProject({ slug: 'f', title: 'Same Order As Alpha', category: 'unity', audience: 'game', orderGame: 10, orderSoftdev: 40 }),
    makeProject({ slug: 'g', title: `Draft ${UNPUBLISHED_MARKER}`, category: 'unity', audience: 'game', featured: true, published: false, orderGame: 1, orderSoftdev: 1 }),
  ];
  const api = createContentApi(bundle({ projects }));

  test('"all" tab: featured first, then this page\'s projects, then the rest, each by the page order', () => {
    expect(slugs(api.getProjects('game', 'all'))).toEqual(['d', 'b', 'f', 'e', 'a', 'c']);
    expect(slugs(api.getProjects('softdev', 'all'))).toEqual(['d', 'e', 'c', 'a', 'b', 'f']);
  });

  test('a category tab shows that category on both pages, sorted by the page order', () => {
    expect(slugs(api.getProjects('game', 'unity'))).toEqual(['b', 'f', 'a']);
    expect(slugs(api.getProjects('softdev', 'unity'))).toEqual(['a', 'b', 'f']);
    expect(slugs(api.getProjects('game', 'webapps'))).toEqual(['d', 'c']);
    expect(slugs(api.getProjects('softdev', 'webapps'))).toEqual(['d', 'c']);
    expect(slugs(api.getProjects('game', 'unreal'))).toEqual(['e']);
  });

  test('an unknown tab or an empty category gives an empty list', () => {
    expect(api.getProjects('game', 'godot')).toEqual([]);
    expect(api.getProjects('game', '')).toEqual([]);
    expect(createContentApi(bundle()).getProjects('softdev', 'all')).toEqual([]);
  });

  test('unpublished projects are never returned', () => {
    for (const track of ['game', 'softdev'] as const) {
      for (const tab of ['all', 'unity', 'unreal', 'webapps']) {
        expect(slugs(api.getProjects(track, tab))).not.toContain('g');
      }
    }
  });

  test('equal order falls back to the title, ignoring case', () => {
    const tied = createContentApi(
      bundle({
        projects: [
          makeProject({ slug: 'x', title: 'beta', orderGame: 10 }),
          makeProject({ slug: 'y', title: 'Alpha', orderGame: 10 }),
          makeProject({ slug: 'z', title: 'alpha', orderGame: 10 }),
        ],
      }),
    );
    expect(tied.getProjects('game', 'all').map((project) => project.title)).toEqual(['Alpha', 'alpha', 'beta']);
  });

  test('returns a new array each time and does not reorder the stored content', () => {
    const first = api.getProjects('game', 'all');
    first.reverse();
    first.pop();
    expect(slugs(api.getProjects('game', 'all'))).toEqual(['d', 'b', 'f', 'e', 'a', 'c']);
    expect(slugs(projects)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});

test.describe('getHoverText', () => {
  const api = createContentApi(bundle());

  test('the project\'s own text wins', () => {
    expect(api.getHoverText(makeProject({ hoverText: 'Watch The Trailer', videoUrl: 'https://youtu.be/x' }))).toBe('Watch The Trailer');
  });

  test('otherwise the category default, depending on whether there is a video', () => {
    expect(api.getHoverText(makeProject({ category: 'unity', videoUrl: 'https://youtu.be/x' }))).toBe('View Gameplay & Screenshots');
    expect(api.getHoverText(makeProject({ category: 'unity', videoUrl: '' }))).toBe('View Screenshots');
    expect(api.getHoverText(makeProject({ category: 'webapps', videoUrl: 'https://youtu.be/x' }))).toBe('View Demo & Screenshots');
    expect(api.getHoverText(makeProject({ category: 'webapps', videoUrl: '' }))).toBe('View Screenshots');
  });

  test('a project whose category no longer exists still gets a text', () => {
    expect(api.getHoverText(makeProject({ category: 'removed', videoUrl: 'https://youtu.be/x' }))).toBe('View Screenshots');
  });
});

test.describe('getExperience', () => {
  const experience = [
    makeExperience({ slug: 'x1', company: 'One', audience: 'game', orderGame: 20, orderSoftdev: 20, bullets: ['d1'], bulletsGame: ['g1'], bulletsSoftdev: [] }),
    makeExperience({ slug: 'x2', company: 'Two', audience: 'softdev', orderGame: 10, orderSoftdev: 10, bullets: ['d2'], bulletsGame: [], bulletsSoftdev: ['s2a', 's2b'] }),
    makeExperience({ slug: 'x3', company: 'Three', audience: 'both', orderGame: 30, orderSoftdev: 5, bullets: ['d3'] }),
    makeExperience({ slug: 'x4', company: 'Four', audience: 'game', orderGame: 10, orderSoftdev: 40, bullets: [] }),
    makeExperience({ slug: 'x5', company: `Hidden ${UNPUBLISHED_MARKER}`, audience: 'both', orderGame: 1, orderSoftdev: 1, published: false }),
  ];
  const api = createContentApi(bundle({ experience }));

  test('this page\'s entries (and "both") first, each group by the page order', () => {
    expect(slugs(api.getExperience('game'))).toEqual(['x4', 'x1', 'x3', 'x2']);
    expect(slugs(api.getExperience('softdev'))).toEqual(['x3', 'x2', 'x1', 'x4']);
  });

  test('resolvedBullets: the page\'s own bullets when set, else the default bullets', () => {
    const bullets = (track: 'game' | 'softdev') =>
      Object.fromEntries(api.getExperience(track).map((entry) => [entry.slug, entry.resolvedBullets]));
    expect(bullets('game')).toEqual({ x1: ['g1'], x2: ['d2'], x3: ['d3'], x4: [] });
    expect(bullets('softdev')).toEqual({ x1: ['d1'], x2: ['s2a', 's2b'], x3: ['d3'], x4: [] });
  });

  test('keeps every stored field and does not touch the stored entry', () => {
    const [first] = api.getExperience('game');
    expect(first).toMatchObject({ slug: 'x4', company: 'Four', bullets: [], bulletsGame: [], bulletsSoftdev: [] });
    first?.resolvedBullets.push('changed by the caller');
    expect(api.getExperience('game')[0]?.resolvedBullets).toEqual([]);
    expect(experience[3]).not.toHaveProperty('resolvedBullets');
  });

  test('unpublished entries are never returned', () => {
    expect(slugs(api.getExperience('game'))).not.toContain('x5');
    expect(slugs(api.getExperience('softdev'))).not.toContain('x5');
  });
});

test.describe('skills, links, education, certificates', () => {
  test('getSkillGroups: sorted by the page order, unpublished removed', () => {
    const api = createContentApi(
      bundle({
        skills: [
          makeSkillGroup({ slug: 'game-dev', title: 'Game Dev', orderGame: 10, orderSoftdev: 40 }),
          makeSkillGroup({ slug: 'programming', title: 'Programming', orderGame: 20, orderSoftdev: 30 }),
          makeSkillGroup({ slug: 'backend', title: 'Backend', orderGame: 30, orderSoftdev: 10 }),
          makeSkillGroup({ slug: 'cloud', title: 'Cloud', orderGame: 40, orderSoftdev: 20 }),
          makeSkillGroup({ slug: 'hidden', title: 'Hidden', orderGame: 1, orderSoftdev: 1, published: false }),
        ],
      }),
    );
    expect(slugs(api.getSkillGroups('game'))).toEqual(['game-dev', 'programming', 'backend', 'cloud']);
    expect(slugs(api.getSkillGroups('softdev'))).toEqual(['backend', 'cloud', 'programming', 'game-dev']);
  });

  test('getLinks: by page, by placement, sorted by order', () => {
    const api = createContentApi(
      bundle({
        links: [
          makeLink({ slug: 'github', audience: 'both', order: 20, showInHero: true, showInFooter: true }),
          makeLink({ slug: 'itchio', audience: 'game', order: 10, showInHero: true, showInFooter: true }),
          makeLink({ slug: 'email', audience: 'both', order: 30, showInHero: false, showInFooter: true }),
          makeLink({ slug: 'blog', audience: 'softdev', order: 5, showInHero: true, showInFooter: false }),
          makeLink({ slug: 'hidden', audience: 'both', order: 1, showInHero: true, showInFooter: true, published: false }),
          makeLink({ slug: 'nowhere', audience: 'both', order: 2, showInHero: false, showInFooter: false }),
        ],
      }),
    );
    expect(slugs(api.getLinks('game', 'hero'))).toEqual(['itchio', 'github']);
    expect(slugs(api.getLinks('game', 'footer'))).toEqual(['itchio', 'github', 'email']);
    expect(slugs(api.getLinks('softdev', 'hero'))).toEqual(['blog', 'github']);
    expect(slugs(api.getLinks('softdev', 'footer'))).toEqual(['github', 'email']);
  });

  test('getLinks: a link with an empty url is never returned', () => {
    const api = createContentApi(
      bundle({
        links: [
          makeLink({ slug: 'github', order: 20 }),
          makeLink({ slug: 'no-url', url: '', order: 10 }),
          makeLink({ slug: 'only-spaces', url: '   ', order: 15 }),
          makeLink({ slug: 'email', url: 'mailto:person@example.com', order: 30 }),
        ],
      }),
    );
    for (const track of ['game', 'softdev'] as const) {
      for (const placement of ['hero', 'footer'] as const) {
        expect(slugs(api.getLinks(track, placement))).toEqual(['github', 'email']);
      }
    }
  });

  test('getEducation: sorted by order, unpublished removed', () => {
    const api = createContentApi(
      bundle({
        education: [
          makeEducation({ slug: 'bachelor', order: 20 }),
          makeEducation({ slug: 'master', order: 10 }),
          makeEducation({ slug: 'hidden', order: 5, published: false }),
        ],
      }),
    );
    expect(slugs(api.getEducation())).toEqual(['master', 'bachelor']);
  });

  test('getCertificates: sorted by the page order, unpublished removed', () => {
    const api = createContentApi(
      bundle({
        certificates: [
          makeCertificate({ slug: 'unity', orderGame: 10, orderSoftdev: 30 }),
          makeCertificate({ slug: 'aws-sa', orderGame: 20, orderSoftdev: 10 }),
          makeCertificate({ slug: 'aws-dev', orderGame: 30, orderSoftdev: 20 }),
          makeCertificate({ slug: 'hidden', orderGame: 1, orderSoftdev: 1, published: false }),
        ],
      }),
    );
    expect(slugs(api.getCertificates('game'))).toEqual(['unity', 'aws-sa', 'aws-dev']);
    expect(slugs(api.getCertificates('softdev'))).toEqual(['aws-sa', 'aws-dev', 'unity']);
  });
});

test.describe('unpublished items', () => {
  test('publishedOnly removes them from every collection and keeps the rest', () => {
    const full = fixtureBundle();
    const live = publishedOnly(full);
    expect(JSON.stringify(full)).toContain(UNPUBLISHED_MARKER);
    expect(JSON.stringify(live)).not.toContain(UNPUBLISHED_MARKER);
    expect(live.projects).toHaveLength(full.projects.length - 1);
    expect(live.experience).toHaveLength(full.experience.length - 1);
    expect(live.skills).toHaveLength(full.skills.length - 1);
    expect(live.links).toHaveLength(full.links.length - 1);
    expect(live.education).toHaveLength(full.education.length - 1);
    expect(live.certificates).toHaveLength(full.certificates.length - 1);
    expect(live.site).toEqual(full.site);
    expect(live.tracks).toEqual(full.tracks);
  });

  test('the API filters them even when it is handed an unfiltered bundle', () => {
    const api = createContentApi(fixtureBundle());
    const everything = [
      api.getProjects('game', 'all'),
      api.getProjects('softdev', 'all'),
      api.getExperience('game'),
      api.getSkillGroups('game'),
      api.getLinks('game', 'hero'),
      api.getLinks('game', 'footer'),
      api.getEducation(),
      api.getCertificates('game'),
    ];
    expect(JSON.stringify(everything)).not.toContain(UNPUBLISHED_MARKER);
    expect(everything.every((list) => list.length === 1 || list.length === 2)).toBe(true);
  });
});

test.describe('the real content through the API', () => {
  test('invariants that hold whatever the owner edits', () => {
    const loaded = loadContent(realContentDir);
    expect(loaded.ok, JSON.stringify(loaded.issues, null, 2)).toBe(true);
    if (!loaded.ok) return;
    const api = createContentApi(publishedOnly(loaded.content));
    const tabs = api.getTabs();
    expect(tabs.at(-1)).toEqual({ id: 'all', label: api.getSite().allTabLabel });
    expect(api.getTracks().map((track) => track.id)).toEqual(['game', 'softdev']);
    expect(api.getAllRoutes()).toHaveLength(1 + api.getTracks().length * (1 + tabs.length));
    expect(new Set(api.getAllRoutes()).size).toBe(api.getAllRoutes().length);

    const publishedProjects = loaded.content.projects.filter((project) => project.published);
    for (const track of api.getTracks()) {
      expect(tabs.map((tab) => tab.id)).toContain(api.resolveTab(track.id, undefined));
      const all = api.getProjects(track.id, 'all');
      expect(slugs(all).sort()).toEqual(slugs(publishedProjects).sort());
      // Every project sits under exactly one category tab.
      const perCategory = tabs.filter((tab) => tab.id !== 'all').flatMap((tab) => slugs(api.getProjects(track.id, tab.id)));
      expect(perCategory.sort()).toEqual(slugs(publishedProjects).sort());
      for (const project of all) expect(api.getHoverText(project).trim().split(/\s+/).length).toBeLessThanOrEqual(4);
      for (const entry of api.getExperience(track.id)) expect(Array.isArray(entry.resolvedBullets)).toBe(true);
    }
  });
});
