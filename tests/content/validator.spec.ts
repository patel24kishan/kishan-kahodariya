import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { formatNotes, loadContent, publishedOnly } from '../../scripts/lib/load-content';
import type { ContentBundle } from '../../src/content/bundle';
import {
  countWords,
  isAssetPath,
  isLinkUrl,
  isSlug,
  isWebUrl,
  isYearMonth,
  validateContent,
  type ContentIssue,
  type RawContentFile,
} from '../../src/content/schema';
import {
  fixtureFiles,
  makeProject,
  makeTempDir,
  makeTrack,
  realContentDir,
  removeTempDirs,
  runScript,
  writeContentDir,
} from './helpers';

const VALIDATE = 'scripts/validate-content.ts';

test.afterAll(removeTempDirs);

/** The fixture content with one file changed. */
function withFile(filePath: string, change: (data: Record<string, unknown>) => void): RawContentFile[] {
  const files = fixtureFiles();
  const target = files.find((file) => file.path === filePath);
  if (!target) throw new Error(`No fixture file ${filePath}`);
  const copy = structuredClone(target.data) as Record<string, unknown>;
  change(copy);
  return files.map((file) => (file.path === filePath ? { path: filePath, data: copy } : file));
}

function issuesOf(files: readonly RawContentFile[]): ContentIssue[] {
  const result = validateContent(files);
  return result.ok ? [] : result.issues;
}

function expectIssue(files: readonly RawContentFile[], file: string, field: string, message: RegExp): void {
  const issues = issuesOf(files);
  expect(issues, `issues were: ${JSON.stringify(issues, null, 2)}`).toContainEqual(
    expect.objectContaining({ file, field, message: expect.stringMatching(message) }),
  );
}

function expectValid(files: readonly RawContentFile[]): void {
  expect(issuesOf(files)).toEqual([]);
}

/** The content as read (tidied). Fails the test when the files are not valid. */
function read(files: readonly RawContentFile[]): { content: ContentBundle; notes: string[] } {
  const result = validateContent(files);
  expect(result.ok, `issues were: ${JSON.stringify(result.issues, null, 2)}`).toBe(true);
  if (!result.ok) throw new Error('content is not valid');
  return {
    content: result.content,
    notes: result.notes.map((note) => `${note.file} › ${note.field}: ${note.message}`),
  };
}

function bySlug<T extends { slug: string }>(items: readonly T[], slug: string): T {
  const item = items.find((candidate) => candidate.slug === slug);
  if (!item) throw new Error(`no item with slug ${slug}`);
  return item;
}

test.describe('content schema — valid content', () => {
  test('the fixture content passes', () => {
    const result = validateContent(fixtureFiles());
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
    if (!result.ok) return;
    expect(result.content.tracks.map((track) => track.id)).toEqual(['game', 'softdev']);
    // Validation keeps unpublished items; removing them is a separate step.
    expect(result.content.projects).toHaveLength(3);
  });

  test('the real content folder passes (library)', () => {
    const result = loadContent(realContentDir);
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
  });

  test('the real content folder passes (npm run validate:content)', () => {
    const result = runScript(VALIDATE);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain('Content OK');
    expect(result.stdout).toMatch(/projects: \d+/);
  });
});

test.describe('content schema — field rules', () => {
  test('slug must equal the file name', () => {
    expectIssue(
      withFile('projects/alpha.json', (data) => {
        data.slug = 'something-else';
      }),
      'projects/alpha.json',
      'slug',
      /must be "alpha" to match the file name/,
    );
  });

  test('slug must be lower-case kebab', () => {
    const files = fixtureFiles().filter((file) => file.path !== 'projects/alpha.json');
    files.push({ path: 'projects/Alpha One.json', data: makeProject({ slug: 'Alpha One' }) });
    expectIssue(files, 'projects/Alpha One.json', 'slug', /lower-case letters, digits and single hyphens/);
    expect(isSlug('paint-it-3d')).toBe(true);
    expect(isSlug('Paint')).toBe(false);
    expect(isSlug('a--b')).toBe(false);
    expect(isSlug('')).toBe(false);
  });

  test('project.category must be a category id from site.json', () => {
    expectIssue(
      withFile('projects/alpha.json', (data) => {
        data.category = 'webapp';
      }),
      'projects/alpha.json',
      'category',
      /"webapp" is not a category id from site\.json \(known ids: "unreal", "unity", "webapps"\)/,
    );
  });

  test('hoverText is limited to 4 words', () => {
    expectIssue(
      withFile('projects/alpha.json', (data) => {
        data.hoverText = 'one two three four five';
      }),
      'projects/alpha.json',
      'hoverText',
      /at most 4 words \(it has 5\)/,
    );
    expectValid(
      withFile('projects/alpha.json', (data) => {
        data.hoverText = 'View Gameplay & Screenshots';
      }),
    );
    expect(countWords('  View   Gameplay &\tScreenshots ')).toBe(4);
    expect(countWords('')).toBe(0);
  });

  test('category hover defaults are limited to 4 words', () => {
    for (const field of ['hoverWithVideo', 'hoverWithoutVideo']) {
      expectIssue(
        withFile('site.json', (data) => {
          const categories = data.categories as Record<string, unknown>[];
          (categories[1] as Record<string, unknown>)[field] = 'this text is far too long';
        }),
        'site.json',
        `categories[1].${field}`,
        /at most 4 words \(it has 6\)/,
      );
    }
  });

  test('defaultTab must be a category id or "all"', () => {
    expectIssue(
      withFile('tracks/game.json', (data) => {
        data.defaultTab = 'godot';
      }),
      'tracks/game.json',
      'defaultTab',
      /"godot" must be a category id from site\.json .* or "all"/,
    );
    expectValid(
      withFile('tracks/softdev.json', (data) => {
        data.defaultTab = 'all';
      }),
    );
  });

  test('dates are YYYY-MM or empty', () => {
    for (const bad of ['2024-13', '2024-00', '2024-6', '2024', 'June 2024', '2024-06-01', '24-06']) {
      expectIssue(
        withFile('experience/acme.json', (data) => {
          data.startDate = bad;
        }),
        'experience/acme.json',
        'startDate',
        /YYYY-MM/,
      );
      expect(isYearMonth(bad), bad).toBe(false);
    }
    expectIssue(
      withFile('experience/acme.json', (data) => {
        data.endDate = 'Present';
      }),
      'experience/acme.json',
      'endDate',
      /YYYY-MM/,
    );
    for (const good of ['', '2024-06', '1999-12', '2030-01']) expect(isYearMonth(good), good).toBe(true);
  });

  test('link URLs: empty, https, http, mailto or a site path', () => {
    const bad = ['GH', 'www.example.com', 'example.com/page', 'ftp://example.com/file', 'javascript:alert(1)', '//example.com/x', 'https://', 'https:// example.com', 'mailto:not-an-address', 'uploads/file.pdf', ' https://example.com'];
    for (const value of bad) {
      expect(isLinkUrl(value), value).toBe(false);
      expectIssue(
        withFile('projects/alpha.json', (data) => {
          const links = data.links as Record<string, unknown>[];
          (links[0] as Record<string, unknown>).url = value;
        }),
        'projects/alpha.json',
        'links[0].url',
        /must be empty, an address starting with https:\/\/ or http:\/\/, a mailto: address, or a site path/,
      );
    }
    const good = ['', 'https://example.com', 'https://example.com/a/b?c=d&e=f#g', 'http://example.com', 'mailto:someone@example.com', '/uploads/resume.pdf', '/'];
    for (const value of good) {
      expect(isLinkUrl(value), value).toBe(true);
      expectValid(
        withFile('links/github.json', (data) => {
          data.url = value;
        }),
      );
    }
  });

  test('every URL field is checked', () => {
    const cases: [string, string, (data: Record<string, unknown>) => void][] = [
      ['tracks/game.json', 'resumeUrl', (data) => { data.resumeUrl = 'drive link'; }],
      ['tracks/game.json', 'photo', (data) => { data.photo = 'images/profile.jpg'; }],
      ['tracks/game.json', 'tabResumes[0].url', (data) => { data.tabResumes = [{ tab: 'unreal', url: 'drive link', label: '', summary: '' }]; }],
      ['site.json', 'logo', (data) => { data.logo = 'images/logo.webp'; }],
      ['projects/alpha.json', 'videoUrl', (data) => { data.videoUrl = 'youtu.be/abc'; }],
      ['projects/alpha.json', 'screenshots[0].src', (data) => { (data.screenshots as Record<string, unknown>[])[0]!.src = 'alpha.webp'; }],
      ['experience/acme.json', 'logo', (data) => { data.logo = 'logo.png'; }],
      ['links/github.json', 'url', (data) => { data.url = 'github.com/example'; }],
      ['certificates/cert.json', 'image', (data) => { data.image = 'badge.png'; }],
      ['certificates/cert.json', 'url', (data) => { data.url = 'credly'; }],
    ];
    for (const [file, field, change] of cases) {
      expectIssue(withFile(file, change), file, field, /must be empty/);
    }
  });

  test('images cannot be mailto links and the video must be a web address', () => {
    expect(isAssetPath('mailto:someone@example.com')).toBe(false);
    expect(isAssetPath('/uploads/a.webp')).toBe(true);
    expect(isAssetPath('https://example.com/a.webp')).toBe(true);
    expect(isWebUrl('/uploads/video.mp4')).toBe(false);
    expect(isWebUrl('mailto:someone@example.com')).toBe(false);
    expect(isWebUrl('https://youtu.be/abc')).toBe(true);
    expect(isWebUrl('')).toBe(true);
  });

  test('identity fields stay required: missing, null and empty are all rejected', () => {
    const identity: [string, string][] = [
      ['site.json', 'name'],
      ['site.json', 'allTabLabel'],
      ['tracks/game.json', 'id'],
      ['tracks/game.json', 'route'],
      ['tracks/game.json', 'label'],
      ['tracks/game.json', 'defaultTab'],
      ['projects/alpha.json', 'slug'],
      ['projects/alpha.json', 'title'],
      ['projects/alpha.json', 'category'],
      ['experience/acme.json', 'slug'],
      ['experience/acme.json', 'company'],
      ['skills/game-dev.json', 'slug'],
      ['skills/game-dev.json', 'title'],
      ['links/github.json', 'slug'],
      ['links/github.json', 'label'],
      ['education/school.json', 'slug'],
      ['education/school.json', 'school'],
      ['certificates/cert.json', 'slug'],
      ['certificates/cert.json', 'title'],
    ];
    for (const [file, field] of identity) {
      expectIssue(withFile(file, (data) => { delete data[field]; }), file, field, /is required — it is missing or empty/);
      expectIssue(withFile(file, (data) => { data[field] = null; }), file, field, /is required — it is missing or empty/);
      expectIssue(withFile(file, (data) => { data[field] = ''; }), file, field, /./);
    }
    // The same for the identity fields of a category.
    for (const field of ['id', 'label']) {
      const drop = (data: Record<string, unknown>) => {
        delete ((data.categories as Record<string, unknown>[])[0] as Record<string, unknown>)[field];
      };
      const nullify = (data: Record<string, unknown>) => {
        ((data.categories as Record<string, unknown>[])[0] as Record<string, unknown>)[field] = null;
      };
      expectIssue(withFile('site.json', drop), 'site.json', `categories[0].${field}`, /is required/);
      expectIssue(withFile('site.json', nullify), 'site.json', `categories[0].${field}`, /is required/);
    }
  });

  test('a missing optional field is read as its default instead of failing', () => {
    const { content, notes } = read([
      // Only the identity fields, nothing else.
      ...fixtureFiles().filter((file) => !['projects/alpha.json', 'experience/acme.json', 'skills/game-dev.json', 'links/github.json', 'education/school.json', 'certificates/cert.json', 'site.json', 'tracks/softdev.json'].includes(file.path)),
      { path: 'site.json', data: { name: 'Fixture Person', allTabLabel: 'All', categories: [{ id: 'unity', label: 'Unity3D' }, { id: 'webapps', label: 'Web Apps' }] } },
      { path: 'tracks/softdev.json', data: { id: 'softdev', route: 'softdev', label: 'Software', defaultTab: 'webapps' } },
      { path: 'projects/alpha.json', data: { slug: 'alpha', title: 'Alpha', category: 'unity' } },
      { path: 'experience/acme.json', data: { slug: 'acme', company: 'Acme Games' } },
      { path: 'skills/game-dev.json', data: { slug: 'game-dev', title: 'Game Dev' } },
      { path: 'links/github.json', data: { slug: 'github', label: 'GitHub' } },
      { path: 'education/school.json', data: { slug: 'school', school: 'Example University' } },
      { path: 'certificates/cert.json', data: { slug: 'cert', title: 'Example Certificate' } },
    ]);

    expect(content.site).toEqual({
      name: 'Fixture Person',
      monogram: '',
      logo: '',
      logoAlt: '',
      email: '',
      credit: [],
      roles: [],
      allTabLabel: 'All',
      workLabel: '',
      contactLabel: '',
      stats: [],
      categories: [
        { id: 'unity', label: 'Unity3D', order: 0, hoverWithVideo: '', hoverWithoutVideo: '' },
        { id: 'webapps', label: 'Web Apps', order: 0, hoverWithVideo: '', hoverWithoutVideo: '' },
      ],
    });
    expect(content.tracks[1]).toEqual({
      id: 'softdev',
      route: 'softdev',
      label: 'Software',
      headline: '',
      summary: '',
      resumeUrl: '',
      resumeLabel: '',
      tabResumes: [],
      defaultTab: 'webapps',
      photo: '',
      photoAlt: '',
      heroVideo: '',
      heroPoster: '',
      badgeLine1: '',
      badgeLine2: '',
      certificatesFirst: false,
      metaTitle: '',
      metaDescription: '',
    });
    expect(bySlug(content.projects, 'alpha')).toEqual({
      slug: 'alpha',
      title: 'Alpha',
      shortDescription: '',
      longDescription: '',
      dateDisplay: '',
      tags: [],
      category: 'unity',
      audience: 'both',
      featured: false,
      published: false,
      orderGame: 0,
      orderSoftdev: 0,
      hoverText: '',
      screenshots: [],
      videoUrl: '',
      links: [],
      legacyId: null,
    });
    expect(bySlug(content.experience, 'acme')).toEqual({
      slug: 'acme',
      company: 'Acme Games',
      role: '',
      location: '',
      remote: false,
      startDate: '',
      endDate: '',
      present: false,
      dateDisplay: '',
      logo: '',
      bullets: [],
      bulletsGame: [],
      bulletsSoftdev: [],
      tags: [],
      audience: 'both',
      orderGame: 0,
      orderSoftdev: 0,
      published: false,
    });
    expect(bySlug(content.skills, 'game-dev')).toEqual({
      slug: 'game-dev',
      title: 'Game Dev',
      skills: [],
      emphasis: 'none',
      orderGame: 0,
      orderSoftdev: 0,
      published: false,
    });
    expect(bySlug(content.links, 'github')).toEqual({
      slug: 'github',
      label: 'GitHub',
      url: '',
      icon: 'link',
      audience: 'both',
      order: 0,
      orderFooter: 0,
      showInHero: false,
      showInFooter: false,
      published: false,
    });
    expect(bySlug(content.education, 'school')).toEqual({
      slug: 'school',
      school: 'Example University',
      degree: '',
      dateDisplay: '',
      grade: '',
      description: '',
      order: 0,
      published: false,
    });
    expect(bySlug(content.certificates, 'cert')).toEqual({
      slug: 'cert',
      title: 'Example Certificate',
      dateDisplay: '',
      description: '',
      image: '',
      imageAlt: '',
      url: '',
      orderGame: 0,
      orderSoftdev: 0,
      published: false,
    });

    // Every filled default is reported as a note, with the file and the field.
    expect(notes).toContain('projects/alpha.json › published: was missing, read as false — this item is NOT shown on the site');
    expect(notes).toContain('projects/alpha.json › tags: was missing, read as []');
    expect(notes).toContain('projects/alpha.json › legacyId: was missing, read as null');
    expect(notes).toContain('projects/alpha.json › audience: was missing, read as "both"');
    expect(notes).toContain('site.json › categories[0].order: was missing, read as 0');
    expect(notes).toContain('site.json › email: was missing, read as ""');
    expect(notes).toContain('tracks/softdev.json › certificatesFirst: was missing, read as false');
    expect(notes.filter((note) => note.startsWith('projects/alpha.json'))).toHaveLength(14);
    // Files that were complete produce no note.
    expect(notes.some((note) => note.startsWith('tracks/game.json'))).toBe(false);
    expect(notes.some((note) => note.startsWith('projects/beta.json'))).toBe(false);
  });

  test('a null value in an optional field is read as its default', () => {
    const { content, notes } = read(
      withFile('projects/alpha.json', (data) => {
        data.shortDescription = null;
        data.tags = null;
        data.featured = null;
        data.published = null;
        data.orderGame = null;
        data.hoverText = null;
        data.videoUrl = null;
        data.audience = null;
        data.legacyId = null;
        data.screenshots = [{ src: '/uploads/alpha.webp', alt: null }];
        data.links = [{ label: 'View Code', url: null, kind: null }];
      }),
    );
    expect(bySlug(content.projects, 'alpha')).toEqual({
      ...makeProject(),
      shortDescription: '',
      tags: [],
      featured: false,
      published: false,
      orderGame: 0,
      hoverText: '',
      videoUrl: '',
      audience: 'both',
      legacyId: null,
      screenshots: [{ src: '/uploads/alpha.webp', alt: '' }],
      links: [{ label: 'View Code', url: '', kind: 'other' }],
    });
    expect(notes).toEqual([
      'projects/alpha.json › shortDescription: was null, read as ""',
      'projects/alpha.json › tags: was null, read as []',
      'projects/alpha.json › audience: was null, read as "both"',
      'projects/alpha.json › featured: was null, read as false',
      'projects/alpha.json › published: was null, read as false — this item is NOT shown on the site',
      'projects/alpha.json › orderGame: was null, read as 0',
      'projects/alpha.json › hoverText: was null, read as ""',
      'projects/alpha.json › screenshots[0].alt: was null, read as ""',
      'projects/alpha.json › videoUrl: was null, read as ""',
      'projects/alpha.json › links[0].url: was null, read as ""',
      'projects/alpha.json › links[0].kind: was null, read as "other"',
      // legacyId: null is that field's own "not set" value, so there is nothing to note.
    ]);
  });

  test('a missing `published` means NOT published, so the item never reaches the site', () => {
    const { content, notes } = read(
      withFile('projects/alpha.json', (data) => {
        delete data.published;
      }),
    );
    expect(bySlug(content.projects, 'alpha').published).toBe(false);
    expect(notes).toEqual(['projects/alpha.json › published: was missing, read as false — this item is NOT shown on the site']);
    const live = publishedOnly(content);
    expect(live.projects.map((project) => project.slug)).not.toContain('alpha');
    expect(JSON.stringify(live)).not.toContain(makeProject().title);
  });

  test('a default never hides a wrong value: wrong types and broken values still fail', () => {
    expectIssue(withFile('projects/alpha.json', (data) => { data.tags = 'Unity, C#'; }), 'projects/alpha.json', 'tags', /expected array/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.tags = ['Unity', 7]; }), 'projects/alpha.json', 'tags[1]', /expected string/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.published = 0; }), 'projects/alpha.json', 'published', /expected boolean/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.legacyId = 'five'; }), 'projects/alpha.json', 'legacyId', /expected number/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.screenshots = {}; }), 'projects/alpha.json', 'screenshots', /expected array/);
    expectIssue(
      withFile('projects/alpha.json', (data) => { data.links = [{ label: 'View Code', url: 'GH', kind: 'code' }]; }),
      'projects/alpha.json',
      'links[0].url',
      /must be empty/,
    );
    expectIssue(withFile('site.json', (data) => { data.categories = [null]; }), 'site.json', 'categories[0]', /is required|expected object/);
  });

  test('an unknown field is reported by name', () => {
    expectIssue(
      withFile('skills/game-dev.json', (data) => {
        data.publised = false;
      }),
      'skills/game-dev.json',
      'publised',
      /is not a field of this kind of content/,
    );
  });

  test('wrong types and unknown options are rejected', () => {
    expectIssue(withFile('projects/alpha.json', (data) => { data.published = 'yes'; }), 'projects/alpha.json', 'published', /expected boolean/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.orderGame = '10'; }), 'projects/alpha.json', 'orderGame', /expected number/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.tags = 'Unity, C#'; }), 'projects/alpha.json', 'tags', /expected array/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.audience = 'everyone'; }), 'projects/alpha.json', 'audience', /"game"\|"softdev"\|"both"/);
    expectIssue(withFile('projects/alpha.json', (data) => { data.legacyId = 1.5; }), 'projects/alpha.json', 'legacyId', /int/);
    expectIssue(
      withFile('projects/alpha.json', (data) => { (data.links as Record<string, unknown>[])[0]!.kind = 'download'; }),
      'projects/alpha.json',
      'links[0].kind',
      /Invalid option/,
    );
    expectIssue(withFile('links/github.json', (data) => { data.icon = 'facebook'; }), 'links/github.json', 'icon', /Invalid option/);
    expectIssue(withFile('skills/game-dev.json', (data) => { data.emphasis = 'all'; }), 'skills/game-dev.json', 'emphasis', /Invalid option/);
    expectValid(withFile('projects/alpha.json', (data) => { data.legacyId = -4; }));
    expectValid(withFile('skills/game-dev.json', (data) => { data.emphasis = 'none'; }));
  });

  test('titles cannot be empty and the email must look like one', () => {
    expectIssue(withFile('projects/alpha.json', (data) => { data.title = '  '; }), 'projects/alpha.json', 'title', /must not be empty/);
    expectIssue(withFile('site.json', (data) => { data.email = 'not an email'; }), 'site.json', 'email', /email address/);
    expectValid(withFile('site.json', (data) => { data.email = ''; }));
  });

  test('blank entries are dropped from text lists; real text is never altered', () => {
    const changes: Record<string, Record<string, unknown>> = {
      'projects/alpha.json': { tags: ['Unity', '', '   ', null, ' C# ', 'Unity', '\t'] },
      'experience/acme.json': {
        bullets: ['', ' Shipped the game.  '],
        bulletsGame: [' '],
        bulletsSoftdev: ['Kept as written'],
        tags: ['', ''],
      },
      'skills/game-dev.json': { skills: ['Unity3D', ' ', 'AR/VR'] },
      'site.json': { roles: ['a Developer', ''], credit: ['', 'Line two.', '  '] },
    };
    const files = fixtureFiles().map((file) => {
      const change = changes[file.path];
      return change ? { path: file.path, data: { ...(file.data as Record<string, unknown>), ...change } } : file;
    });

    const { content, notes } = read(files);
    // Leading / trailing spaces and duplicates inside real entries are left exactly as written.
    expect(bySlug(content.projects, 'alpha').tags).toEqual(['Unity', ' C# ', 'Unity']);
    const acme = bySlug(content.experience, 'acme');
    expect(acme.bullets).toEqual([' Shipped the game.  ']);
    expect(acme.bulletsGame).toEqual([]);
    expect(acme.bulletsSoftdev).toEqual(['Kept as written']);
    expect(acme.tags).toEqual([]);
    expect(bySlug(content.skills, 'game-dev').skills).toEqual(['Unity3D', 'AR/VR']);
    expect(content.site.roles).toEqual(['a Developer']);
    expect(content.site.credit).toEqual(['Line two.']);

    expect(notes.sort()).toEqual(
      [
        'experience/acme.json › bullets: 1 blank entry was dropped',
        'experience/acme.json › bulletsGame: 1 blank entry was dropped',
        'experience/acme.json › tags: 2 blank entries were dropped',
        'projects/alpha.json › tags: 4 blank entries were dropped',
        'site.json › credit: 2 blank entries were dropped',
        'site.json › roles: 1 blank entry was dropped',
        'skills/game-dev.json › skills: 1 blank entry was dropped',
      ].sort(),
    );
  });

  test('abandoned rows are dropped: a screenshot without an image, a link with no label and no address', () => {
    const { content, notes } = read(
      withFile('projects/alpha.json', (data) => {
        data.screenshots = [
          { src: '', alt: 'never uploaded' },
          { src: '/uploads/one.webp', alt: 'One' },
          { alt: 'no src key at all' },
          { src: null, alt: '' },
          { src: '/uploads/two.webp' },
          {},
        ];
        data.links = [
          { label: '', url: '', kind: 'other' },
          { label: 'View Code', url: '', kind: 'code' }, // a label with an empty address is kept
          { label: '', url: 'https://example.com/play', kind: 'play' }, // an address with no label is kept
          { kind: 'demo' },
          { label: '  ', url: null },
          { label: 'Live Demo', url: 'https://example.com/demo', kind: 'demo' },
        ];
      }),
    );
    const alpha = bySlug(content.projects, 'alpha');
    expect(alpha.screenshots).toEqual([
      { src: '/uploads/one.webp', alt: 'One' },
      { src: '/uploads/two.webp', alt: '' },
    ]);
    expect(alpha.links).toEqual([
      { label: 'View Code', url: '', kind: 'code' },
      { label: '', url: 'https://example.com/play', kind: 'play' },
      { label: 'Live Demo', url: 'https://example.com/demo', kind: 'demo' },
    ]);
    expect(notes).toEqual([
      'projects/alpha.json › screenshots: 4 blank entries were dropped',
      // Positions are the ones in the file, so the owner can find the row.
      'projects/alpha.json › screenshots[4].alt: was missing, read as ""',
      'projects/alpha.json › links: 3 blank entries were dropped',
    ]);
  });

  test('a row that is not blank is still checked', () => {
    expectIssue(
      withFile('projects/alpha.json', (data) => { data.screenshots = [{ src: 'not-a-path.webp', alt: '' }]; }),
      'projects/alpha.json',
      'screenshots[0].src',
      /must be empty/,
    );
    expectIssue(
      withFile('projects/alpha.json', (data) => { data.links = [{ label: 'Play', url: 'itch', kind: 'play' }]; }),
      'projects/alpha.json',
      'links[0].url',
      /must be empty/,
    );
    expectIssue(
      withFile('projects/alpha.json', (data) => { data.links = [{ label: 'Play', url: '', kind: 'play', extra: true }]; }),
      'projects/alpha.json',
      'links[0].extra',
      /is not a field/,
    );
  });

  test('complete content produces no notes', () => {
    expect(read(fixtureFiles()).notes).toEqual([]);
  });
});

test.describe('content schema — site logo', () => {
  const setLogo = (value: unknown) => (data: Record<string, unknown>) => {
    data.logo = value;
  };

  test('the logo is empty, a site path or a web address; the alt text is free', () => {
    for (const good of ['', '/images/logo-96.webp', '/uploads/logo.webp', 'https://example.com/logo.png']) {
      expectValid(withFile('site.json', setLogo(good)));
    }
    for (const bad of ['logo.webp', 'images/logo.webp', 'mailto:someone@example.com', '//example.com/logo.png', '/images/my logo.png']) {
      expectIssue(withFile('site.json', setLogo(bad)), 'site.json', 'logo', /must be empty, an address starting with https:\/\/ or http:\/\/, or a site path/);
    }
    expectIssue(withFile('site.json', setLogo(7)), 'site.json', 'logo', /expected string/);
    expectValid(withFile('site.json', (data) => { data.logoAlt = ''; }));
    expectIssue(withFile('site.json', (data) => { data.logoAlt = ['Kishan']; }), 'site.json', 'logoAlt', /expected string/);
  });

  test('a site file written before the logo existed still reads: no logo means the monogram', () => {
    const { content, notes } = read(
      withFile('site.json', (data) => {
        delete data.logo;
        data.logoAlt = null;
      }),
    );
    expect(content.site.logo).toBe('');
    expect(content.site.logoAlt).toBe('');
    expect(content.site.monogram).toBe('FP');
    expect(notes).toEqual(['site.json › logo: was missing, read as ""', 'site.json › logoAlt: was null, read as ""']);
  });
});

test.describe('content schema — footer order of a link', () => {
  const link = (change: (data: Record<string, unknown>) => void) => withFile('links/github.json', change);
  const github = (files: readonly RawContentFile[]) => bySlug(read(files).content.links, 'github');

  test('a link without a footer order keeps its place: it is read as its `order`', () => {
    const missing = read(link((data) => { data.order = 30; delete data.orderFooter; }));
    expect(bySlug(missing.content.links, 'github')).toMatchObject({ order: 30, orderFooter: 30 });
    expect(missing.notes).toEqual(['links/github.json › orderFooter: was missing, read as 30']);

    const empty = read(link((data) => { data.order = 30; data.orderFooter = null; }));
    expect(bySlug(empty.content.links, 'github')).toMatchObject({ order: 30, orderFooter: 30 });
    expect(empty.notes).toEqual(['links/github.json › orderFooter: was null, read as 30']);

    // Neither number: both are 0.
    expect(github(link((data) => { delete data.order; delete data.orderFooter; }))).toMatchObject({ order: 0, orderFooter: 0 });
  });

  test('a footer order that is written is never replaced, also when it is 0 or negative', () => {
    expect(github(link((data) => { data.order = 30; data.orderFooter = 0; }))).toMatchObject({ order: 30, orderFooter: 0 });
    expect(github(link((data) => { data.order = 30; data.orderFooter = -5; }))).toMatchObject({ order: 30, orderFooter: -5 });
    expect(github(link((data) => { data.order = 30; data.orderFooter = 10; }))).toMatchObject({ order: 30, orderFooter: 10 });
    expect(read(link((data) => { data.order = 30; data.orderFooter = 10; })).notes).toEqual([]);
  });

  test('a wrong type is still an error, and a broken `order` is not copied into the footer order', () => {
    expectIssue(link((data) => { data.orderFooter = '10'; }), 'links/github.json', 'orderFooter', /expected number/);
    const issues = issuesOf(link((data) => { data.order = 'first'; delete data.orderFooter; }));
    expect(issues.map((issue) => issue.field)).toEqual(['order']);
  });

  test('the key order of the file does not matter, and an unknown key is still reported', () => {
    expect(
      github([
        ...fixtureFiles().filter((file) => file.path !== 'links/github.json'),
        { path: 'links/github.json', data: { orderFooter: 5, published: true, slug: 'github', order: 40, label: 'GitHub' } },
      ]),
    ).toMatchObject({ order: 40, orderFooter: 5 });
    expectIssue(link((data) => { delete data.orderFooter; data.orderFoter = 10; }), 'links/github.json', 'orderFoter', /is not a field of this kind of content/);
  });
});

test.describe('content schema — resume per project tab', () => {
  const rows = (value: unknown) => (data: Record<string, unknown>) => {
    data.tabResumes = value;
  };
  const game = (value: unknown) => withFile('tracks/game.json', rows(value));
  const gameTrack = (files: readonly RawContentFile[]) => read(files).content.tracks[0];

  test('valid rows: a category id or "all", with or without a link and a label', () => {
    const value = [
      { tab: 'unreal', url: 'https://example.com/unreal-resume', label: 'Unreal Resume', summary: '' },
      { tab: 'unity', url: '', label: '', summary: '' },
      { tab: 'all', url: 'http://example.com/all?x=1#y', label: '', summary: '' },
    ];
    const { content, notes } = read(game(value));
    expect(content.tracks[0]?.tabResumes).toEqual(value);
    expect(notes).toEqual([]);
    // The two pages are independent: the same tab may have a row on each.
    expectValid([
      ...game([{ tab: 'unreal', url: '', label: '', summary: '' }]).filter((file) => file.path !== 'tracks/softdev.json'),
      { path: 'tracks/softdev.json', data: makeTrack('softdev', { tabResumes: [{ tab: 'unreal', url: 'https://example.com/r', label: '', summary: '' }] }) },
    ]);
  });

  test('the tab must be a category id from site.json or "all"', () => {
    for (const bad of ['godot', 'Unreal', 'unreal ', 'All', 'web apps']) {
      expectIssue(
        game([{ tab: bad, url: '', label: '', summary: '' }]),
        'tracks/game.json',
        'tabResumes[0].tab',
        /must be a category id from site\.json \(known ids: "unreal", "unity", "webapps"\) or "all"/,
      );
    }
    // The second row is the wrong one: the message points at it.
    expectIssue(
      game([{ tab: 'unity', url: '', label: '', summary: '' }, { tab: 'godot', url: '', label: '', summary: '' }]),
      'tracks/game.json',
      'tabResumes[1].tab',
      /"godot" must be a category id/,
    );
    // A category that the owner removed from Site settings is caught the same way.
    const withoutUnreal = game([{ tab: 'unreal', url: '', label: '', summary: '' }]).map((file) =>
      file.path === 'site.json'
        ? { path: file.path, data: { ...(file.data as Record<string, unknown>), categories: (file.data as { categories: { id: string }[] }).categories.filter((category) => category.id !== 'unreal') } }
        : file,
    );
    expectIssue(withoutUnreal, 'tracks/game.json', 'tabResumes[0].tab', /"unreal" must be a category id from site\.json \(known ids: "unity", "webapps"\)/);
  });

  test('a tab can have only one row on a page', () => {
    expectIssue(
      game([
        { tab: 'unreal', url: 'https://example.com/a', label: '', summary: '' },
        { tab: 'unity', url: '', label: '', summary: '' },
        { tab: 'unreal', url: 'https://example.com/b', label: '', summary: '' },
      ]),
      'tracks/game.json',
      'tabResumes[2].tab',
      /"unreal" has more than one row \(a tab can have only one row\)/,
    );
    // Also when the rows have no link yet, and for the "all" tab.
    expectIssue(game([{ tab: 'unreal', url: '', label: '', summary: '' }, { tab: 'unreal', url: '', label: '', summary: '' }]), 'tracks/game.json', 'tabResumes[1].tab', /more than one row/);
    expectIssue(game([{ tab: 'all', url: '', label: '', summary: '' }, { tab: 'all', url: '', label: '', summary: '' }]), 'tracks/game.json', 'tabResumes[1].tab', /"all" has more than one row/);
    // Three rows for one tab: every extra row is reported.
    const fields = issuesOf(game([{ tab: 'unity' }, { tab: 'unity' }, { tab: 'unity' }])).map((issue) => issue.field);
    expect(fields).toEqual(['tabResumes[1].tab', 'tabResumes[2].tab']);
  });

  test('the link must be empty or a web address (not mailto, not a site path)', () => {
    const bad = ['drive link', 'drive.google.com/file/d/1', 'mailto:someone@example.com', '/uploads/resume.pdf', 'ftp://example.com/resume.pdf', 'https://', 'https://example.com/my resume.pdf', ' https://example.com/r'];
    for (const value of bad) {
      expect(isWebUrl(value), value).toBe(false);
      expectIssue(
        game([{ tab: 'unreal', url: value, label: '', summary: '' }]),
        'tracks/game.json',
        'tabResumes[0].url',
        /must be empty or an address starting with https:\/\/ or http:\/\//,
      );
    }
    for (const value of ['', 'https://drive.google.com/file/d/1S5b/view?usp=drive_link', 'http://example.com/resume.pdf']) {
      expect(isWebUrl(value), value).toBe(true);
      expectValid(game([{ tab: 'unreal', url: value, label: '', summary: '' }]));
    }
  });

  test('an unknown key and a wrong type are reported with the row and the key', () => {
    expectIssue(game([{ tab: 'unreal', url: '', label: '', note: 'x', summary: '' }]), 'tracks/game.json', 'tabResumes[0].note', /is not a field of this kind of content/);
    expectIssue(game([{ tab: 'unreal', link: 'https://example.com/r' }]), 'tracks/game.json', 'tabResumes[0].link', /is not a field of this kind of content/);
    expectIssue(game('unreal'), 'tracks/game.json', 'tabResumes', /expected array/);
    expectIssue(game({ unreal: 'https://example.com/r' }), 'tracks/game.json', 'tabResumes', /expected array/);
    expectIssue(game([{ tab: 'unreal', url: 7, label: '', summary: '' }]), 'tracks/game.json', 'tabResumes[0].url', /expected string/);
    expectIssue(game([{ tab: 'unreal', url: '', label: false, summary: '' }]), 'tracks/game.json', 'tabResumes[0].label', /expected string/);
    expectIssue(game([{ tab: 3, url: '', label: '', summary: '' }]), 'tracks/game.json', 'tabResumes[0].tab', /expected string/);
    expectIssue(game([{ tab: 'unreal', url: '', label: '', summary: 7 }]), 'tracks/game.json', 'tabResumes[0].summary', /expected string/);
    expectIssue(game([{ tab: 'unreal', url: '', label: '', summary: ['Text.'] }]), 'tracks/game.json', 'tabResumes[0].summary', /expected string/);
    // A near miss of the key is an unknown key, not a summary.
    expectIssue(game([{ tab: 'unreal', url: '', label: '', sumary: 'Text.' }]), 'tracks/game.json', 'tabResumes[0].sumary', /is not a field of this kind of content/);
  });

  test('a summary for one tab: any text, with or without a resume link, kept exactly as written', () => {
    const value = [
      // Only a summary: the row is not "useless" without a link.
      { tab: 'unreal', url: '', label: '', summary: 'Unreal summary.\n\nSecond paragraph, with  two spaces and a trailing one. ' },
      // Only a resume.
      { tab: 'unity', url: 'https://example.com/unity-resume', label: 'Unity Resume', summary: '' },
      // Both.
      { tab: 'all', url: 'https://example.com/all', label: '', summary: 'Everything.' },
    ];
    const { content, notes } = read(game(value));
    expect(content.tracks[0]?.tabResumes).toEqual(value);
    expect(notes).toEqual([]);
    // Spaces only is valid too (it reads as "use the main summary"); nothing is rewritten.
    const blank = read(game([{ tab: 'unreal', url: '', label: '', summary: '   ' }]));
    expect(blank.content.tracks[0]?.tabResumes).toEqual([{ tab: 'unreal', url: '', label: '', summary: '   ' }]);
    expect(blank.notes).toEqual([]);
    // The other rules are unchanged by a summary: a real tab, one row per tab, a tab at all.
    expectIssue(game([{ tab: 'godot', url: '', label: '', summary: 'Text.' }]), 'tracks/game.json', 'tabResumes[0].tab', /"godot" must be a category id/);
    expectIssue(
      game([{ tab: 'unreal', url: '', label: '', summary: 'One.' }, { tab: 'unreal', url: 'https://example.com/r', label: '', summary: '' }]),
      'tracks/game.json',
      'tabResumes[1].tab',
      /"unreal" has more than one row/,
    );
    const dropped = read(game([{ tab: '', url: '', label: '', summary: 'A summary without a tab.' }, { summary: 'No tab key.' }]));
    expect(dropped.content.tracks[0]?.tabResumes).toEqual([]);
    expect(dropped.notes).toEqual(['tracks/game.json › tabResumes: 2 blank entries were dropped']);
  });

  test('forgiving read: no list means no tab resumes; a missing link, label or summary is ""', () => {
    const missing = read(withFile('tracks/game.json', (data) => { delete data.tabResumes; }));
    expect(missing.content.tracks[0]?.tabResumes).toEqual([]);
    expect(missing.notes).toEqual(['tracks/game.json › tabResumes: was missing, read as []']);

    const empty = read(game(null));
    expect(empty.content.tracks[0]?.tabResumes).toEqual([]);
    expect(empty.notes).toEqual(['tracks/game.json › tabResumes: was null, read as []']);

    const sparse = read(game([{ tab: 'unreal' }, { tab: 'unity', url: null, label: null, summary: null }]));
    expect(sparse.content.tracks[0]?.tabResumes).toEqual([
      { tab: 'unreal', url: '', label: '', summary: '' },
      { tab: 'unity', url: '', label: '', summary: '' },
    ]);
    expect(sparse.notes).toEqual([
      'tracks/game.json › tabResumes[0].url: was missing, read as ""',
      'tracks/game.json › tabResumes[0].label: was missing, read as ""',
      'tracks/game.json › tabResumes[0].summary: was missing, read as ""',
      'tracks/game.json › tabResumes[1].url: was null, read as ""',
      'tracks/game.json › tabResumes[1].label: was null, read as ""',
      'tracks/game.json › tabResumes[1].summary: was null, read as ""',
    ]);
    // A row written before the summary existed (tab, url, label) still reads, with "" for it.
    const old = read(game([{ tab: 'unreal', url: 'https://example.com/unreal-resume', label: 'Unreal Resume' }]));
    expect(old.content.tracks[0]?.tabResumes).toEqual([{ tab: 'unreal', url: 'https://example.com/unreal-resume', label: 'Unreal Resume', summary: '' }]);
    expect(old.notes).toEqual(['tracks/game.json › tabResumes[0].summary: was missing, read as ""']);
  });

  test('forgiving read: rows without a tab are dropped, whatever else they hold', () => {
    const { content, notes } = read(
      game([
        { tab: '', url: 'https://example.com/lost', label: 'Lost', summary: '' },
        { url: 'https://example.com/no-tab-key' },
        { tab: null, url: '', label: '', summary: '' },
        { tab: '   ', url: '', label: '', summary: '' },
        { tab: 'unity', url: 'https://example.com/unity', label: '', summary: '' },
        {},
      ]),
    );
    expect(content.tracks[0]?.tabResumes).toEqual([{ tab: 'unity', url: 'https://example.com/unity', label: '', summary: '' }]);
    expect(notes).toEqual(['tracks/game.json › tabResumes: 5 blank entries were dropped']);
    // A dropped row never counts as a second row for a tab, and is never checked.
    expectValid(game([{ tab: '', url: 'not a url', label: '', summary: '' }, { tab: 'unreal', url: '', label: '', summary: '' }, { tab: ' ', url: '', label: '', summary: '' }]));
    expect(gameTrack(game([{ tab: '' }, { tab: 'unreal' }]))?.tabResumes).toEqual([{ tab: 'unreal', url: '', label: '', summary: '' }]);
  });

  test('every problem of the list is reported in one run', () => {
    const issues = issuesOf(
      game([
        { tab: 'godot', url: 'https://example.com/a', label: '', summary: '' },
        { tab: 'unreal', url: 'nope', label: '', summary: '' },
        { tab: 'unreal', url: '', label: '', extra: 1, summary: '' },
      ]),
    );
    const fields = issues.map((issue) => issue.field).sort();
    expect(fields).toContain('tabResumes[0].tab');
    expect(fields).toContain('tabResumes[1].url');
    expect(fields).toContain('tabResumes[2].extra');
    expect(issues.every((issue) => issue.file === 'tracks/game.json')).toBe(true);
  });
});

test.describe('content schema — folder rules', () => {
  test('site.json and both track files are required', () => {
    expectIssue(fixtureFiles().filter((file) => file.path !== 'site.json'), 'site.json', '(file)', /required but was not found/);
    expectIssue(
      fixtureFiles().filter((file) => file.path !== 'tracks/softdev.json'),
      'tracks/softdev.json',
      '(file)',
      /required but was not found/,
    );
  });

  test('unexpected files are reported', () => {
    expectIssue(
      [...fixtureFiles(), { path: 'tracks/mobile.json', data: makeTrack('game') }],
      'tracks/mobile.json',
      '(file)',
      /only track files are tracks\/game\.json and tracks\/softdev\.json/,
    );
    expectIssue([...fixtureFiles(), { path: 'blog/first-post.json', data: {} }], 'blog/first-post.json', '(file)', /unexpected file/);
    expectIssue(
      [...fixtureFiles(), { path: 'projects/2024/alpha.json', data: makeProject() }],
      'projects/2024/alpha.json',
      '(file)',
      /unexpected file/,
    );
    expectIssue([...fixtureFiles(), { path: 'projects/list.json', data: [] }], 'projects/list.json', '(file)', /one JSON object/);
  });

  test('a track file must hold its own id, and the two routes must differ', () => {
    expectIssue(
      withFile('tracks/game.json', (data) => {
        data.id = 'softdev';
      }),
      'tracks/game.json',
      'id',
      /must be "game" to match the file name/,
    );
    expectIssue(
      withFile('tracks/softdev.json', (data) => {
        data.route = 'gamedev';
      }),
      'tracks/softdev.json',
      'route',
      /"gamedev" is already used by tracks\/game\.json/,
    );
    expectIssue(withFile('tracks/game.json', (data) => { data.route = 'Game Dev'; }), 'tracks/game.json', 'route', /lower-case/);
  });

  test('category ids are unique, kebab-case and never "all"', () => {
    const setId = (index: number, id: string) => (data: Record<string, unknown>) => {
      ((data.categories as Record<string, unknown>[])[index] as Record<string, unknown>).id = id;
    };
    expectIssue(withFile('site.json', setId(2, 'unity')), 'site.json', 'categories[2].id', /used by more than one category/);
    expectIssue(withFile('site.json', setId(0, 'all')), 'site.json', 'categories[0].id', /must not be "all"/);
    expectIssue(withFile('site.json', setId(0, 'Web Apps')), 'site.json', 'categories[0].id', /lower-case/);
  });

  test('every problem is reported, not only the first', () => {
    let files = withFile('projects/alpha.json', (data) => {
      data.hoverText = 'one two three four five';
      data.category = 'nope';
    });
    files = files.filter((file) => file.path !== 'tracks/game.json');
    const issues = issuesOf(files);
    expect(issues.map((issue) => `${issue.file}#${issue.field}`).sort()).toEqual(
      ['projects/alpha.json#category', 'projects/alpha.json#hoverText', 'tracks/game.json#(file)'].sort(),
    );
  });
});

test.describe('validate:content script — broken copies of the real content', () => {
  test('exits 1 and names file, field and reason for each problem', () => {
    const dir = makeTempDir('broken');
    cpSync(realContentDir, dir, { recursive: true });

    const projectFiles = readdirSync(path.join(dir, 'projects')).filter((name) => name.endsWith('.json')).sort();
    const linkFiles = readdirSync(path.join(dir, 'links')).filter((name) => name.endsWith('.json')).sort();
    const [firstProject, secondProject] = projectFiles;
    const [firstLink] = linkFiles;
    if (!firstProject || !secondProject || !firstLink) throw new Error('The real content has too few files for this test');

    // 1. five-word hover text  2. unknown category  3. broken JSON  4. missing track file
    const first = JSON.parse(readFileSync(path.join(dir, 'projects', firstProject), 'utf8')) as Record<string, unknown>;
    first.hoverText = 'one two three four five';
    writeFileSync(path.join(dir, 'projects', firstProject), JSON.stringify(first, null, 2));
    const second = JSON.parse(readFileSync(path.join(dir, 'projects', secondProject), 'utf8')) as Record<string, unknown>;
    second.category = 'not-a-category';
    writeFileSync(path.join(dir, 'projects', secondProject), JSON.stringify(second, null, 2));
    writeFileSync(path.join(dir, 'links', firstLink), '{ "slug": "broken", ');
    rmSync(path.join(dir, 'tracks', 'softdev.json'));

    const result = runScript(VALIDATE, ['--dir', dir]);
    expect(result.status, result.output).toBe(1);
    expect(result.stderr).toContain('Content check failed — 4 problems');
    expect(result.stderr).toContain(`projects/${firstProject}`);
    expect(result.stderr).toMatch(/field:\s+hoverText\s+problem:\s+must be at most 4 words \(it has 5\)/);
    expect(result.stderr).toContain(`projects/${secondProject}`);
    expect(result.stderr).toMatch(/field:\s+category\s+problem:\s+"not-a-category" is not a category id/);
    expect(result.stderr).toContain(`links/${firstLink}`);
    expect(result.stderr).toMatch(/problem:\s+is not valid JSON/);
    expect(result.stderr).toContain('tracks/softdev.json');
    expect(result.stderr).toMatch(/required but was not found/);
    expect(result.stdout).not.toContain('Content OK');

    // The real content was not touched.
    expect(loadContent(realContentDir).ok).toBe(true);
  });

  test('an untouched copy passes, an empty folder and a missing folder fail', () => {
    const copy = makeTempDir('copy');
    cpSync(realContentDir, copy, { recursive: true });
    expect(runScript(VALIDATE, ['--dir', copy]).status).toBe(0);

    const empty = makeTempDir('empty');
    const emptyResult = runScript(VALIDATE, ['--dir', empty]);
    expect(emptyResult.status, emptyResult.output).toBe(1);
    expect(emptyResult.stderr).toContain('site.json');

    const missing = runScript(VALIDATE, ['--dir', path.join(empty, 'does-not-exist')]);
    expect(missing.status, missing.output).toBe(1);
    expect(missing.stderr).toContain('content folder was not found');
  });

  test('prints GitHub annotations in CI and rejects unknown arguments', () => {
    const dir = makeTempDir('ci');
    writeContentDir(
      dir,
      withFile('projects/alpha.json', (data) => {
        data.videoUrl = 'not a url';
      }),
    );
    const ci = runScript(VALIDATE, ['--dir', dir], { GITHUB_ACTIONS: 'true' });
    expect(ci.status, ci.output).toBe(1);
    expect(ci.stderr).toMatch(/::error file=.*projects\/alpha\.json,title=Content check::videoUrl: must be empty or an address/);

    const usage = runScript(VALIDATE, ['--nope']);
    expect(usage.status, usage.output).toBe(2);
    expect(usage.stderr).toContain('Unknown argument: --nope');
  });
});

test.describe('validate:content script — notes for tidied content', () => {
  /** A copy of the real content with an optional key removed, a null, a blank tag and a blank row. */
  function tidiedCopy(): { dir: string; first: string; second: string } {
    const dir = makeTempDir('tidied');
    cpSync(realContentDir, dir, { recursive: true });
    const names = readdirSync(path.join(dir, 'projects')).filter((name) => name.endsWith('.json')).sort();
    const [first, second] = names;
    if (!first || !second) throw new Error('The real content has too few project files for this test');

    const one = JSON.parse(readFileSync(path.join(dir, 'projects', first), 'utf8')) as Record<string, unknown>;
    delete one.longDescription;
    one.hoverText = null;
    one.tags = [...(one.tags as string[]), '', '  '];
    writeFileSync(path.join(dir, 'projects', first), JSON.stringify(one, null, 2));

    const two = JSON.parse(readFileSync(path.join(dir, 'projects', second), 'utf8')) as Record<string, unknown>;
    two.links = [...(two.links as unknown[]), { label: '', url: '', kind: 'other' }];
    writeFileSync(path.join(dir, 'projects', second), JSON.stringify(two, null, 2));
    return { dir, first, second };
  }

  test('prints a NOTE listing the files and fields, and still exits 0', () => {
    const { dir, first, second } = tidiedCopy();
    const result = runScript(VALIDATE, ['--dir', dir]);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain('Content OK');
    expect(result.stdout).toContain('NOTE — 2 content files were tidied while reading (4 values)');
    expect(result.stdout).toContain('This is not an error and nothing is blocked');
    expect(result.stdout).toContain(`projects/${first}`);
    expect(result.stdout).toContain('longDescription: was missing, read as ""');
    expect(result.stdout).toContain('hoverText: was null, read as ""');
    expect(result.stdout).toContain('tags: 2 blank entries were dropped');
    expect(result.stdout).toContain(`projects/${second}`);
    expect(result.stdout).toContain('links: 1 blank entry was dropped');
    // Nothing is reported as a problem.
    expect(result.stderr).not.toContain('Content check failed');
    expect(result.output).not.toContain('::error');
  });

  test('in CI the notes are notices, never errors', () => {
    const { dir, first } = tidiedCopy();
    const result = runScript(VALIDATE, ['--dir', dir], { GITHUB_ACTIONS: 'true' });
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toMatch(
      new RegExp(`::notice file=.*projects/${first.replace('.', '\\.')},title=Content tidied::longDescription: was missing, read as ""`),
    );
    expect(result.output).not.toContain('::error');
  });

  test('complete content prints no NOTE (the real content today, and a fresh migration always)', () => {
    const copy = makeTempDir('complete');
    writeContentDir(copy, fixtureFiles());
    const result = runScript(VALIDATE, ['--dir', copy]);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain('Content OK');
    expect(result.output).not.toContain('NOTE');
    expect(formatNotes([])).toBe('');
  });

  test('notes are still printed next to real errors, and the exit code is 1 because of the errors', () => {
    const { dir, first } = tidiedCopy();
    rmSync(path.join(dir, 'tracks', 'softdev.json'));
    const result = runScript(VALIDATE, ['--dir', dir]);
    expect(result.status, result.output).toBe(1);
    expect(result.stderr).toContain('Content check failed — 1 problem');
    expect(result.stderr).toContain('tracks/softdev.json');
    expect(result.stdout).toContain('NOTE — 2 content files were tidied');
    expect(result.stdout).toContain(`projects/${first}`);
  });
});
