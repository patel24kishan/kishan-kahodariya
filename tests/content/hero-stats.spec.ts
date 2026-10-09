/**
 * The hero numbers and labels: the new site / track fields in the schema, getHeroStats(), the
 * build month the content plugin embeds, and the real content's values.
 */
import { expect, test } from '@playwright/test';
import { contentPlugin, monthOf } from '../../scripts/lib/content-plugin';
import { loadContent, publishedOnly } from '../../scripts/lib/load-content';
import type { ContentBundle } from '../../src/content/bundle';
import { validateContent, type ContentIssue, type RawContentFile } from '../../src/content/schema';
import { createContentApi } from '../../src/content/selectors';
import type { HeroStat, SiteSettings, TrackId } from '../../src/content/types';
import {
  fixtureFiles,
  makeCertificate,
  makeExperience,
  makeProject,
  makeSite,
  makeTrack,
  realContentDir,
} from './helpers';

function bundle(overrides: Partial<ContentBundle> = {}, stats: HeroStat[] = [], buildMonth?: string): ContentBundle {
  return {
    site: makeSite({ stats }),
    tracks: [makeTrack('game'), makeTrack('softdev')],
    projects: [],
    experience: [],
    skills: [],
    links: [],
    education: [],
    certificates: [],
    ...(buildMonth === undefined ? {} : { buildMonth }),
    ...overrides,
  };
}

const stat = (source: HeroStat['source'], label = 'Label', value = ''): HeroStat => ({ source, label, value });

function withFile(filePath: string, change: (data: Record<string, unknown>) => void): RawContentFile[] {
  const files = fixtureFiles();
  return files.map((file) => {
    if (file.path !== filePath) return file;
    const copy = structuredClone(file.data) as Record<string, unknown>;
    change(copy);
    return { path: file.path, data: copy };
  });
}

function issuesOf(files: readonly RawContentFile[]): ContentIssue[] {
  const result = validateContent(files);
  return result.ok ? [] : result.issues;
}

function readSite(files: readonly RawContentFile[]): SiteSettings {
  const result = validateContent(files);
  expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  if (!result.ok) throw new Error('invalid');
  return result.content.site;
}

test.describe('schema: site fields', () => {
  test('missing workLabel, contactLabel and stats get their defaults', () => {
    const site = readSite(
      withFile('site.json', (data) => {
        delete data.workLabel;
        delete data.contactLabel;
        delete data.stats;
      }),
    );
    expect(site.workLabel).toBe('');
    expect(site.contactLabel).toBe('');
    expect(site.stats).toEqual([]);
  });

  test('null values get the same defaults', () => {
    const site = readSite(
      withFile('site.json', (data) => {
        data.workLabel = null;
        data.contactLabel = null;
        data.stats = null;
      }),
    );
    expect([site.workLabel, site.contactLabel, site.stats]).toEqual(['', '', []]);
  });

  test('a stat keeps its source, value and label; a missing value and source are tidied', () => {
    const site = readSite(
      withFile('site.json', (data) => {
        data.stats = [
          { source: 'certificates', value: '', label: 'Certificates' },
          { source: 'custom', value: '12k', label: 'Downloads' },
          { label: 'No source' },
        ];
      }),
    );
    expect(site.stats).toEqual([
      { source: 'certificates', value: '', label: 'Certificates' },
      { source: 'custom', value: '12k', label: 'Downloads' },
      { source: 'custom', value: '', label: 'No source' },
    ]);
  });

  test('every one of the five sources is accepted', () => {
    for (const source of ['projects', 'companies', 'years', 'certificates', 'custom']) {
      const files = withFile('site.json', (data) => {
        data.stats = [{ source, value: '', label: 'X' }];
      });
      expect(issuesOf(files), source).toEqual([]);
    }
  });

  test('an unknown source is rejected', () => {
    const issues = issuesOf(
      withFile('site.json', (data) => {
        data.stats = [{ source: 'followers', value: '', label: 'X' }];
      }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ file: 'site.json', field: expect.stringContaining('stats') }));
  });

  test('an unknown key inside a stat, and a wrong type, are rejected', () => {
    expect(
      issuesOf(
        withFile('site.json', (data) => {
          data.stats = [{ source: 'projects', value: '', label: 'X', extra: 1 }];
        }),
      ),
    ).not.toEqual([]);
    expect(
      issuesOf(
        withFile('site.json', (data) => {
          data.stats = [{ source: 'custom', value: 5, label: 'X' }];
        }),
      ),
    ).not.toEqual([]);
    expect(
      issuesOf(
        withFile('site.json', (data) => {
          data.workLabel = 3;
        }),
      ),
    ).not.toEqual([]);
  });

  test('blank stat rows are dropped, with a note', () => {
    const result = validateContent(
      withFile('site.json', (data) => {
        data.stats = [
          { source: 'projects', value: '', label: 'Projects built' },
          { source: '', value: ' ', label: '  ' },
          {},
        ];
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.site.stats).toEqual([{ source: 'projects', value: '', label: 'Projects built' }]);
    expect(result.notes.some((note) => note.file === 'site.json' && /stats/.test(note.field))).toBe(true);
  });
});

test.describe('schema: track fields', () => {
  for (const file of ['tracks/game.json', 'tracks/softdev.json']) {
    test(`${file}: missing fields default to ""`, () => {
      const result = validateContent(
        withFile(file, (data) => {
          delete data.heroVideo;
          delete data.heroPoster;
          delete data.badgeLine1;
          delete data.badgeLine2;
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const track of result.content.tracks) {
        if (file.includes(track.id)) {
          expect([track.heroVideo, track.heroPoster, track.badgeLine1, track.badgeLine2]).toEqual(['', '', '', '']);
        }
      }
    });
  }

  test('heroVideo and heroPoster accept an address or a site path, and reject anything else', () => {
    const ok = ['', 'https://example.com/a.mp4', 'http://example.com/a.mp4', '/uploads/a.mp4'];
    for (const value of ok) {
      expect(
        issuesOf(
          withFile('tracks/game.json', (data) => {
            data.heroVideo = value;
            data.heroPoster = value;
          }),
        ),
        value,
      ).toEqual([]);
    }
    for (const value of ['ftp://example.com/a.mp4', 'a.mp4', '//example.com/a.mp4', 'not a url']) {
      for (const field of ['heroVideo', 'heroPoster']) {
        const issues = issuesOf(
          withFile('tracks/game.json', (data) => {
            data[field] = value;
          }),
        );
        expect(issues, `${field}=${value}`).toContainEqual(
          expect.objectContaining({ file: 'tracks/game.json', field: expect.stringContaining(field) }),
        );
      }
    }
  });

  test('badge lines are free text and kept as written', () => {
    const result = validateContent(
      withFile('tracks/softdev.json', (data) => {
        data.badgeLine1 = 'AWS Certified';
        data.badgeLine2 = 'Solution Architect';
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const track = result.content.tracks.find((candidate) => candidate.id === 'softdev');
    expect([track?.badgeLine1, track?.badgeLine2]).toEqual(['AWS Certified', 'Solution Architect']);
  });
});

test.describe('getHeroStats: each source', () => {
  const published = (n: number) => Array.from({ length: n }, (_, i) => makeProject({ slug: `p${i}`, title: `P${i}`, audience: 'both' }));

  test('projects: published projects on the All tab of that page, unpublished ones left out', () => {
    const api = createContentApi(
      bundle({ projects: [...published(3), makeProject({ slug: 'hidden', published: false })] }, [stat('projects', 'Projects built')]),
    );
    expect(api.getHeroStats('game')).toEqual([{ value: '3', label: 'Projects built' }]);
    expect(api.getHeroStats('softdev')).toEqual([{ value: '3', label: 'Projects built' }]);
  });

  test('companies: published experience entries', () => {
    const api = createContentApi(
      bundle(
        {
          experience: [
            makeExperience({ slug: 'a', company: 'A' }),
            makeExperience({ slug: 'b', company: 'B', audience: 'softdev' }),
            makeExperience({ slug: 'c', company: 'C', published: false }),
          ],
        },
        [stat('companies', 'Companies')],
      ),
    );
    expect(api.getHeroStats('game')).toEqual([{ value: '2', label: 'Companies' }]);
  });

  test('certificates: published certificates', () => {
    const api = createContentApi(
      bundle(
        { certificates: [makeCertificate({ slug: 'a' }), makeCertificate({ slug: 'b', published: false })] },
        [stat('certificates', 'Certificates')],
      ),
    );
    expect(api.getHeroStats('softdev')).toEqual([{ value: '1', label: 'Certificates' }]);
  });

  test('custom: the stored value, trimmed; empty is dropped', () => {
    const api = createContentApi(bundle({}, [stat('custom', 'Downloads', '  12k  '), stat('custom', 'Empty', '   ')]));
    expect(api.getHeroStats('game')).toEqual([{ value: '12k', label: 'Downloads' }]);
  });

  test('order follows site.json', () => {
    const api = createContentApi(bundle({}, [stat('custom', 'B', '2'), stat('custom', 'A', '1'), stat('custom', 'C', '3')]));
    expect(api.getHeroStats('game').map((s) => s.label)).toEqual(['B', 'A', 'C']);
  });
});

test.describe('getHeroStats: years', () => {
  const years = (startDates: string[], buildMonth: string | undefined, extra: Partial<ContentBundle> = {}) =>
    createContentApi(
      bundle(
        {
          experience: startDates.map((startDate, i) => makeExperience({ slug: `e${i}`, company: `E${i}`, startDate })),
          ...extra,
        },
        [stat('years', 'Years building')],
        buildMonth,
      ),
    ).getHeroStats('game');

  test('exactly 7 years, one month short of 7, and one month over', () => {
    expect(years(['2019-06'], '2026-06')).toEqual([{ value: '7+', label: 'Years building' }]);
    expect(years(['2019-06'], '2026-05')).toEqual([{ value: '6+', label: 'Years building' }]);
    expect(years(['2019-06'], '2026-07')).toEqual([{ value: '7+', label: 'Years building' }]);
  });

  test('crossing a year boundary: December to January and January to December', () => {
    expect(years(['2024-12'], '2025-11')).toEqual([]); // 11 months: 0 whole years, dropped
    expect(years(['2024-12'], '2025-12')).toEqual([{ value: '1+', label: 'Years building' }]);
    expect(years(['2020-01'], '2024-12')).toEqual([{ value: '4+', label: 'Years building' }]);
    expect(years(['2020-01'], '2025-01')).toEqual([{ value: '5+', label: 'Years building' }]);
  });

  test('uses the earliest non-empty start date, whatever the order', () => {
    expect(years(['2024-06', '2019-06', '', '2021-01'], '2026-10')).toEqual([{ value: '7+', label: 'Years building' }]);
  });

  test('less than a year, a start in the future, and no dates all drop the stat', () => {
    expect(years(['2026-10'], '2026-10')).toEqual([]);
    expect(years(['2027-01'], '2026-10')).toEqual([]);
    expect(years([], '2026-10')).toEqual([]);
    expect(years([''], '2026-10')).toEqual([]);
  });

  test('unpublished experience does not count', () => {
    expect(
      years(['2024-06'], '2026-10', {
        experience: [
          makeExperience({ slug: 'old', company: 'Old', startDate: '2010-01', published: false }),
          makeExperience({ slug: 'new', company: 'New', startDate: '2024-06' }),
        ],
      }),
    ).toEqual([{ value: '2+', label: 'Years building' }]);
  });

  test('no build month (hand-built bundle) drops the stat instead of reading the clock', () => {
    expect(years(['2000-01'], undefined)).toEqual([]);
  });

  test('a malformed build month or start date drops the stat', () => {
    expect(years(['2000-01'], 'soon')).toEqual([]);
    expect(years(['sometime'], '2026-10')).toEqual([]);
  });

  test('the option overrides the bundle build month, so tests can fix "now"', () => {
    const content = bundle({ experience: [makeExperience({ startDate: '2020-01' })] }, [stat('years', 'Y')], '2030-01');
    expect(createContentApi(content).getHeroStats('game')).toEqual([{ value: '10+', label: 'Y' }]);
    expect(createContentApi(content, { buildMonth: '2022-01' }).getHeroStats('game')).toEqual([{ value: '2+', label: 'Y' }]);
  });
});

test.describe('getHeroStats: dropping', () => {
  test('0 projects, 0 companies and 0 certificates are dropped', () => {
    const api = createContentApi(
      bundle({}, [stat('projects'), stat('companies'), stat('certificates'), stat('custom', 'Kept', '5')]),
    );
    expect(api.getHeroStats('game')).toEqual([{ value: '5', label: 'Kept' }]);
  });

  test('custom "0" and "0+" are dropped', () => {
    const api = createContentApi(bundle({}, [stat('custom', 'A', '0'), stat('custom', 'B', '0+'), stat('custom', 'C', '10+')]));
    expect(api.getHeroStats('game')).toEqual([{ value: '10+', label: 'C' }]);
  });

  test('a blank label drops the stat', () => {
    const api = createContentApi(bundle({}, [stat('custom', '', '5'), stat('custom', '   ', '6')]));
    expect(api.getHeroStats('game')).toEqual([]);
  });

  test('no stats at all gives an empty list', () => {
    expect(createContentApi(bundle()).getHeroStats('softdev')).toEqual([]);
  });
});

test.describe('getHeroStats: both pages', () => {
  test('counts follow each page; the same stats resolve on game and softdev', () => {
    const api = createContentApi(
      bundle(
        {
          projects: [makeProject({ slug: 'a', audience: 'game' }), makeProject({ slug: 'b', audience: 'softdev', category: 'webapps' })],
          experience: [makeExperience({ startDate: '2021-01' })],
        },
        [stat('projects', 'P'), stat('companies', 'C'), stat('years', 'Y')],
        '2026-10',
      ),
    );
    for (const track of ['game', 'softdev'] as TrackId[]) {
      expect(api.getHeroStats(track), track).toEqual([
        { value: '2', label: 'P' },
        { value: '1', label: 'C' },
        { value: '5+', label: 'Y' },
      ]);
    }
  });
});

test.describe('build month in the plugin', () => {
  type LoadHook = (this: unknown, id: string) => unknown;
  async function loadModule(options: { buildMonth?: string }): Promise<ContentBundle> {
    const plugin = contentPlugin({ contentDir: 'content', ...options });
    const configResolved = plugin.configResolved as (config: unknown) => void;
    configResolved({ root: process.cwd(), command: 'build' });
    const load = plugin.load as LoadHook;
    const code = load.call({ error: (message: string) => { throw new Error(message); }, addWatchFile: () => undefined }, '\0virtual:content') as string;
    const json = code.replace(/^export default /, '').replace(/;\s*$/, '');
    return JSON.parse(json) as ContentBundle;
  }

  test('the virtual module carries the month it was given', async () => {
    const content = await loadModule({ buildMonth: '2031-02' });
    expect(content.buildMonth).toBe('2031-02');
  });

  test('by default it carries the current month, as YYYY-MM', async () => {
    const before = monthOf(new Date());
    const content = await loadModule({});
    const after = monthOf(new Date());
    expect(content.buildMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect([before, after]).toContain(content.buildMonth);
  });

  test('monthOf uses UTC and pads the month', () => {
    expect(monthOf(new Date(Date.UTC(2026, 0, 31, 23, 59)))).toBe('2026-01');
    expect(monthOf(new Date(Date.UTC(2026, 11, 1, 0, 0)))).toBe('2026-12');
  });
});

test.describe('the real content', () => {
  const loaded = loadContent(realContentDir);

  test('site.json holds the two button labels and the three stats', () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { site } = loaded.content;
    expect(site.workLabel).toBe('See my work');
    expect(site.contactLabel).toBe('Get in touch');
    expect(site.stats).toEqual([
      { source: 'projects', value: '', label: 'Projects built' },
      { source: 'companies', value: '', label: 'Companies' },
      { source: 'years', value: '', label: 'Years building' },
    ]);
  });

  test('both tracks have the video, no poster and the badge', () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.content.tracks.map((track) => track.id)).toEqual(['game', 'softdev']);
    for (const track of loaded.content.tracks) {
      expect(track.heroVideo).toMatch(/^https:\/\/d8j0ntlcm91z4\.cloudfront\.net\/.+\.mp4$/);
      expect(track.heroPoster).toBe('');
      expect(track.badgeLine1).toBe('AWS Certified');
      expect(track.badgeLine2).toBe('Solution Architect');
    }
  });

  test('getHeroStats on both pages gives three sensible numbers', () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const content = publishedOnly(loaded.content);
    const api = createContentApi(content, { buildMonth: '2026-10' });
    for (const track of ['game', 'softdev'] as TrackId[]) {
      const stats = api.getHeroStats(track);
      expect(stats.map((s) => s.label)).toEqual(['Projects built', 'Companies', 'Years building']);
      expect(stats[0]!.value).toBe(String(api.getProjects(track, 'all').length));
      expect(stats[1]!.value).toBe(String(api.getExperience(track).length));
      expect(stats[2]!.value).toMatch(/^\d+\+$/);
      expect(Number.parseInt(stats[0]!.value, 10)).toBeGreaterThan(0);
      expect(Number.parseInt(stats[1]!.value, 10)).toBeGreaterThan(0);
      // Earliest start date in the real content is 2019-06.
      expect(stats[2]!.value).toBe('7+');
    }
  });
});
