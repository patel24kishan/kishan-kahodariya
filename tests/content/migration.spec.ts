/**
 * Migration fidelity. These tests migrate legacy/constants.js into a temp folder (or in
 * memory) and compare the result with the legacy file itself. They never read the real
 * /content, because after go-live the owner edits that folder in the admin and it is
 * expected to drift away from the old site.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  COMMENTED_OUT_PROJECTS,
  migrateLegacy,
  parseDateRange,
  type LegacyProject,
  type MigrationResult,
} from '../../scripts/lib/legacy-migration';
import { validateContent } from '../../src/content/schema';
import type {
  Certificate,
  Education,
  Experience,
  Project,
  SiteSettings,
  SkillGroup,
  SocialLink,
  TrackProfile,
} from '../../src/content/types';
import {
  legacyFile,
  loadLegacyModule,
  makeTempDir,
  readTree,
  realContentDir,
  removeTempDirs,
  repoRoot,
  runScript,
} from './helpers';

const MIGRATE = 'scripts/migrate-legacy.ts';

// --- The legacy file, read directly (not through the migration's own parser) -------------

interface LegacyBio {
  name: string;
  roles: string[];
  description: string;
  github: string;
  resume_gamedeveloper: string;
  resume_softwaredeveloper: string;
  linkedin: string;
  email: string;
  twitter: string;
  itchio: string;
  discord: string;
  facebook: string;
  blog: string;
}
interface LegacyFile {
  Bio: LegacyBio;
  skills: { title: string; skills: { name: string; image: string }[] }[];
  experiences: { id: number; img: string; role: string; company: string; date: string; desc: string; skills: string[]; doc: string }[];
  projects: LegacyProject[];
  education: { id: number; img: string; school: string; date: string; grade: string; desc: string; degree: string }[];
  certificate: { id: number; title: string; date: string; description: string; image: string; certificate_url: string }[];
}

let legacy: LegacyFile;
let result: MigrationResult;

function items<T>(folder: string): T[] {
  return result.files.filter((file) => file.path.startsWith(`${folder}/`)).map((file) => file.data as T);
}
function single<T>(filePath: string): T {
  const file = result.files.find((candidate) => candidate.path === filePath);
  if (!file) throw new Error(`Migration did not produce ${filePath}`);
  return file.data as T;
}
function projectByTitle(title: string): Project {
  const matches = items<Project>('projects').filter((project) => project.title === title);
  expect(matches, `projects titled "${title}"`).toHaveLength(1);
  return matches[0] as Project;
}

/** The commented-out project blocks of legacy/constants.js, evaluated as data. */
function commentedOutProjectsFromSource(): LegacyProject[] {
  const source = readFileSync(legacyFile, 'utf8');
  const found: LegacyProject[] = [];
  for (const match of source.matchAll(/\/\*\s*(\{[\s\S]*?\})\s*,?\s*\*\//g)) {
    const body = match[1] ?? '';
    if (!/\btitle\s*:/.test(body)) continue;
    // The block is an object literal from the owner's own file; evaluate it as data.
    found.push(new Function(`return (${body});`)() as LegacyProject);
  }
  return found;
}

test.beforeAll(async () => {
  legacy = (await loadLegacyModule()) as unknown as LegacyFile;
  result = migrateLegacy(legacy);
});

test.afterAll(removeTempDirs);

test.describe('migration — counts', () => {
  test('migrated counts equal the source counts', () => {
    const commented = commentedOutProjectsFromSource();
    expect(result.source).toEqual({
      projectsPublished: legacy.projects.length,
      projectsUnpublished: commented.length,
      experience: legacy.experiences.length,
      skillGroups: legacy.skills.length,
      skills: legacy.skills.reduce((total, group) => total + group.skills.length, 0),
      education: legacy.education.length,
      certificates: legacy.certificate.length,
      links: [legacy.Bio.github, legacy.Bio.linkedin, legacy.Bio.itchio, legacy.Bio.blog, legacy.Bio.email, legacy.Bio.twitter, legacy.Bio.discord, legacy.Bio.facebook].filter((value) => value !== '').length,
      resumeLinks: 2,
    });
    const { tracks, site, files, ...migrated } = result.migrated;
    expect(migrated).toEqual(result.source);
    expect({ tracks, site }).toEqual({ tracks: 2, site: 1 });
    expect(files).toBe(result.files.length);
  });

  test('the numbers for the current legacy file', () => {
    // legacy/constants.js is frozen. It holds 21 live projects (5 Unreal, 11 Unity, 5 web)
    // plus 1 inside a comment.
    expect(result.migrated).toEqual({
      projectsPublished: 21,
      projectsUnpublished: 1,
      experience: 5,
      skillGroups: 4,
      skills: 22,
      education: 2,
      certificates: 3,
      links: 5,
      resumeLinks: 2,
      tracks: 2,
      site: 1,
      files: 44,
    });
    expect(items<Project>('projects').filter((project) => project.published)).toHaveLength(21);
    expect(items<Project>('projects').filter((project) => !project.published).map((project) => project.title)).toEqual(['Unity Tools']);
    expect(items<Experience>('experience')).toHaveLength(5);
    expect(items<SkillGroup>('skills')).toHaveLength(4);
    expect(items<SkillGroup>('skills').flatMap((group) => group.skills)).toHaveLength(22);
    expect(items<Education>('education')).toHaveLength(2);
    expect(items<Certificate>('certificates')).toHaveLength(3);
    expect(items<SocialLink>('links')).toHaveLength(5);
    expect(items<TrackProfile>('tracks')).toHaveLength(2);
  });

  test('the migrated files pass the content schema and file names are the slugs', () => {
    const validation = validateContent(result.files);
    expect(validation.ok, JSON.stringify(validation.issues, null, 2)).toBe(true);
    // Complete files: the reader has nothing to tidy (no default to fill, no blank row).
    expect(validation.notes).toEqual([]);
    for (const file of result.files) {
      const data = file.data as { slug?: string };
      if (data.slug !== undefined) expect(file.path.endsWith(`/${data.slug}.json`), file.path).toBe(true);
    }
    expect(new Set(result.files.map((file) => file.path)).size).toBe(result.files.length);
  });
});

test.describe('migration — projects are carried over unchanged', () => {
  test('every legacy title, description, tag list and URL appears unchanged', () => {
    const everything = [...legacy.projects, ...commentedOutProjectsFromSource()];
    expect(everything.length).toBeGreaterThan(0);
    for (const source of everything) {
      const project = projectByTitle(source.title);
      expect(project.shortDescription, source.title).toBe(source.description);
      expect(project.longDescription, source.title).toBe('');
      expect(project.dateDisplay, source.title).toBe(source.date);
      expect(project.tags, source.title).toEqual(source.tags.filter((tag) => tag !== ''));
      expect(project.legacyId, source.title).toBe(source.id);
      expect(project.featured, source.title).toBe(false);
      expect(project.hoverText, source.title).toBe('');

      // image → first screenshot
      expect(project.screenshots, source.title).toEqual([{ src: source.image, alt: `${source.title} cover image` }]);

      // github → "View Code" link (empty address when the legacy value is empty or not a URL)
      const codeLinks = project.links.filter((link) => link.kind === 'code');
      expect(codeLinks, source.title).toHaveLength(1);
      expect(codeLinks[0]?.label, source.title).toBe('View Code');
      const githubIsUrl = /^https?:\/\//.test(source.github);
      expect(codeLinks[0]?.url, source.title).toBe(githubIsUrl ? source.github : '');

      // action → video (YouTube) or a link with the legacy button text
      const isYouTube = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(source.action);
      const otherLinks = project.links.filter((link) => link.kind !== 'code');
      if (isYouTube) {
        expect(project.videoUrl, source.title).toBe(source.action);
        expect(otherLinks, source.title).toEqual([]);
      } else {
        expect(project.videoUrl, source.title).toBe('');
        if (source.action === '' && source.actionBtn === '') {
          expect(otherLinks, source.title).toEqual([]);
        } else {
          expect(otherLinks, source.title).toHaveLength(1);
          expect(otherLinks[0]?.label, source.title).toBe(source.actionBtn);
          expect(otherLinks[0]?.url, source.title).toBe(source.action);
        }
      }
    }
  });

  test('every legacy project URL is present somewhere in its migrated file', () => {
    for (const source of legacy.projects) {
      const project = projectByTitle(source.title);
      const serialised = JSON.stringify(project);
      for (const url of [source.image, source.github, source.action]) {
        if (/^https?:\/\//.test(url)) expect(serialised, `${source.title}: ${url}`).toContain(JSON.stringify(url).slice(1, -1));
      }
    }
  });

  test('categories, audiences, order and published follow the migration table', () => {
    const expected = new Map([
      ['unreal', { category: 'unreal', audience: 'game' }],
      ['unity', { category: 'unity', audience: 'game' }],
      ['webapp', { category: 'webapps', audience: 'softdev' }],
    ]);
    for (const source of legacy.projects) {
      const project = projectByTitle(source.title);
      expect({ category: project.category, audience: project.audience }, source.title).toEqual(expected.get(source.category));
      expect(project.published, source.title).toBe(true);
    }
    // Order = position in the legacy file × 10, the commented-out project keeping its place.
    const inFileOrder = items<Project>('projects').sort((a, b) => a.orderGame - b.orderGame);
    expect(inFileOrder.map((project) => project.orderGame)).toEqual(inFileOrder.map((_, index) => (index + 1) * 10));
    expect(inFileOrder.map((project) => project.orderSoftdev)).toEqual(inFileOrder.map((project) => project.orderGame));
    const titles = inFileOrder.map((project) => project.title);
    expect(titles.filter((title) => title !== 'Unity Tools')).toEqual(legacy.projects.map((project) => project.title));
    expect(titles.indexOf('Unity Tools')).toBe(titles.indexOf('Paint it 3D') + 1);
  });

  test('the commented-out project in the script matches the comment in the legacy file', () => {
    const fromSource = commentedOutProjectsFromSource();
    expect(fromSource).toHaveLength(1);
    expect(COMMENTED_OUT_PROJECTS.map((entry) => entry.project)).toEqual(fromSource);
    const unityTools = projectByTitle('Unity Tools');
    expect(unityTools.published).toBe(false);
    expect(unityTools.slug).toBe('unity-tools');
  });

  test('doubtful values are kept or emptied, never fixed', () => {
    // github: "GH" is not an address → empty code link
    expect(projectByTitle('Crypto Tracker').links).toEqual([
      { label: 'View Code', url: '', kind: 'code' },
      { label: 'More', url: '', kind: 'other' },
    ]);
    // malformed YouTube address kept as written
    expect(projectByTitle('Target Shooter').videoUrl).toBe('https://www.youtube.com/Gameplay?v=Lp46QFgKyKM');
    // a button label with no URL keeps its label
    expect(projectByTitle('3D Platformer').links).toContainEqual({ label: 'Gameplay', url: '', kind: 'video' });
    expect(projectByTitle('My Runner').links).toContainEqual({ label: 'Play', url: '', kind: 'play' });
    // a "Gameplay" button that is not YouTube stays a link with its label
    expect(projectByTitle('Paint it 3D').links).toContainEqual({
      label: 'Gameplay',
      url: 'https://apps.apple.com/us/app/kolor-it/id1477042251',
      kind: 'store',
    });
    expect(projectByTitle('My Portfolio').links).toContainEqual({
      label: 'WEBSITE',
      url: 'https://patel24kishan.github.io/My-Portfolio/',
      kind: 'demo',
    });
    // duplicate legacy ids are kept
    expect(projectByTitle('3D Platformer').legacyId).toBe(-4);
    expect(projectByTitle('Tank it').legacyId).toBe(-4);
    expect(projectByTitle('Dating Square').legacyId).toBe(2);
    expect(projectByTitle('Fruit-Punch').legacyId).toBe(2);
    // the empty tag is the only thing removed from a tag list
    expect(projectByTitle('Tank it').tags).toEqual(['Unreal', 'C++', 'Blueprint', 'AnimGraph']);
    // typos and stray spaces stay
    expect(projectByTitle('Dating Square').shortDescription).toContain('Developd');
    expect(projectByTitle('OuiChef').shortDescription).toContain('palyer');
    expect(projectByTitle('Staycation').shortDescription.startsWith(' Interactive')).toBe(true);
  });
});

test.describe('migration — everything else', () => {
  test('site settings and both tracks', () => {
    const site = single<SiteSettings>('site.json');
    expect(site.name).toBe('Kishan Kahodariya');
    expect(site.monogram).toBe('KK');
    expect(site.roles).toEqual(legacy.Bio.roles);
    expect(site.email).toBe(legacy.Bio.email);
    expect(site.categories.map((category) => category.id)).toEqual(['unreal', 'unity', 'webapps']);

    const game = single<TrackProfile>('tracks/game.json');
    const softdev = single<TrackProfile>('tracks/softdev.json');
    expect(game.summary).toBe(legacy.Bio.description);
    expect(softdev.summary).toBe(legacy.Bio.description);
    expect(game.resumeUrl).toBe(legacy.Bio.resume_gamedeveloper);
    expect(softdev.resumeUrl).toBe(legacy.Bio.resume_softwaredeveloper);
    expect([game.headline, softdev.headline]).toEqual(['Game Developer', 'Software Engineer']);
    expect([game.route, softdev.route]).toEqual(['gamedev', 'softdev']);
    expect([game.defaultTab, softdev.defaultTab]).toEqual(['unity', 'webapps']);
  });

  test('one link per non-empty Bio link, empty ones skipped', () => {
    const links = items<SocialLink>('links');
    const bySlug = new Map(links.map((link) => [link.slug, link]));
    for (const key of ['github', 'linkedin', 'itchio', 'blog'] as const) {
      expect(legacy.Bio[key], key).not.toBe('');
      expect(bySlug.get(key)?.url, key).toBe(legacy.Bio[key]);
    }
    expect(bySlug.get('email')?.url).toBe(`mailto:${legacy.Bio.email}`);
    for (const key of ['twitter', 'discord', 'facebook'] as const) {
      expect(legacy.Bio[key], key).toBe('');
      expect(bySlug.has(key), key).toBe(false);
    }
    expect(links.every((link) => link.published && link.url !== '')).toBe(true);
  });

  test('experience: text, dates, logo and tags', () => {
    const experience = items<Experience>('experience');
    for (const [index, source] of legacy.experiences.entries()) {
      const entry = experience.find((candidate) => candidate.company === source.company);
      expect(entry, source.company).toBeDefined();
      if (!entry) continue;
      expect(entry.role).toBe(source.role);
      expect(entry.bullets).toEqual([source.desc]);
      expect(entry.bulletsGame).toEqual([]);
      expect(entry.bulletsSoftdev).toEqual([]);
      expect(entry.dateDisplay).toBe(source.date);
      expect(entry.logo).toBe(source.img);
      expect(entry.tags).toEqual([...new Set(source.skills)]);
      expect([entry.orderGame, entry.orderSoftdev]).toEqual([(index + 1) * 10, (index + 1) * 10]);
      expect(entry.published).toBe(true);
    }
    const audience = Object.fromEntries(experience.map((entry) => [entry.slug, entry.audience]));
    expect(audience).toEqual({
      'astro-game-studio': 'game',
      helpupdefend: 'game',
      'xsquad-studios-by-escrow-infotech': 'game',
      'ibm-canada': 'softdev',
      achievers: 'softdev',
    });
    // The owner's spelling of the company is kept.
    expect(experience.map((entry) => entry.company)).toContain('HelpUpDefend');
    // The duplicated "Unity" tag is the only removal.
    const xsquad = experience.find((entry) => entry.slug === 'xsquad-studios-by-escrow-infotech');
    expect(xsquad?.tags).toEqual(['Unity', 'C#', 'Photoshop', 'Git', 'Unity Plugins', 'Photon Engine']);
    const dates = Object.fromEntries(experience.map((entry) => [entry.slug, [entry.startDate, entry.endDate, entry.present]]));
    expect(dates).toEqual({
      'astro-game-studio': ['2024-06', '', true],
      helpupdefend: ['2024-12', '2025-02', false],
      'ibm-canada': ['2023-12', '2024-02', false],
      achievers: ['2022-05', '2022-08', false],
      'xsquad-studios-by-escrow-infotech': ['2019-06', '2020-09', false],
    });
  });

  test('free-text dates are read on a best-effort basis', () => {
    expect(parseDateRange('June 2024 - Present')).toMatchObject({ startDate: '2024-06', endDate: '', present: true, notes: [] });
    expect(parseDateRange('Dec 2024 - Feb 2025')).toMatchObject({ startDate: '2024-12', endDate: '2025-02', present: false });
    expect(parseDateRange('Sept 2019 – Dec 2019')).toMatchObject({ startDate: '2019-09', endDate: '2019-12' });
    const assumed = parseDateRange('May - August 2022');
    expect(assumed).toMatchObject({ startDate: '2022-05', endDate: '2022-08', present: false });
    expect(assumed.notes.join(' ')).toContain('2022 was assumed');
    expect(parseDateRange('2018')).toMatchObject({ startDate: '', endDate: '', present: false });
    expect(parseDateRange('sometime')).toMatchObject({ startDate: '', endDate: '', present: false });
  });

  test('skills: names verbatim, emphasis and order per page', () => {
    const groups = items<SkillGroup>('skills');
    for (const source of legacy.skills) {
      const group = groups.find((candidate) => candidate.title === source.title);
      expect(group?.skills, source.title).toEqual(source.skills.map((skill) => skill.name));
    }
    const byTitle = (list: SkillGroup[]) => list.map((group) => group.title);
    expect(byTitle([...groups].sort((a, b) => a.orderGame - b.orderGame))).toEqual(['Game Dev', 'Programming', 'Backend', 'Cloud']);
    expect(byTitle([...groups].sort((a, b) => a.orderSoftdev - b.orderSoftdev))).toEqual(['Backend', 'Cloud', 'Programming', 'Game Dev']);
    expect(Object.fromEntries(groups.map((group) => [group.title, group.emphasis]))).toEqual({
      'Game Dev': 'game',
      Programming: 'game',
      Backend: 'softdev',
      Cloud: 'softdev',
    });
    // Icon URLs are dropped: no skill file mentions an image.
    for (const file of result.files.filter((candidate) => candidate.path.startsWith('skills/'))) {
      expect(JSON.stringify(file.data)).not.toMatch(/https?:|data:image/);
    }
  });

  test('education and certificates', () => {
    const education = items<Education>('education');
    for (const [index, source] of legacy.education.entries()) {
      const entry = education.find((candidate) => candidate.school === source.school);
      expect(entry, source.school).toMatchObject({
        school: source.school,
        degree: source.degree,
        dateDisplay: source.date,
        grade: source.grade,
        description: source.desc,
        order: (index + 1) * 10,
        published: true,
      });
      expect(JSON.stringify(entry)).not.toContain(source.img);
    }
    const certificates = items<Certificate>('certificates');
    for (const [index, source] of legacy.certificate.entries()) {
      const entry = certificates.find((candidate) => candidate.title === source.title);
      expect(entry, source.title).toMatchObject({
        title: source.title,
        dateDisplay: source.date,
        description: '',
        image: source.image,
        url: source.certificate_url,
        orderGame: (index + 1) * 10,
        orderSoftdev: (index + 1) * 10,
        published: true,
      });
    }
    // The duplicated Credly address is kept on both certificates.
    const urls = certificates.map((certificate) => certificate.url);
    expect(urls.filter((url) => url === urls[0])).toHaveLength(2);
  });
});

test.describe('migration — the legacy certificate descriptions are not copied anywhere', () => {
  /** Distinctive pieces of the legacy text, taken from the legacy file at run time. */
  function fragments(): string[] {
    const out = new Set<string>();
    for (const certificate of legacy.certificate) {
      const text = certificate.description;
      expect(text.length).toBeGreaterThan(40);
      out.add(text);
      out.add(text.slice(0, 40));
      for (const word of text.split(/\s+/)) {
        // addresses and anything with digits or symbols mixed into a word (the test logins)
        if (word.includes('@') || /\d/.test(word)) out.add(word.replace(/^[^\w]+|[^\w]+$/g, ''));
      }
    }
    return [...out].filter((fragment) => fragment.length >= 6);
  }

  function expectClean(label: string, text: string): void {
    for (const fragment of fragments()) {
      expect(text.includes(fragment), `${label} contains a piece of the legacy certificate description`).toBe(false);
    }
  }

  test('migration output and report', () => {
    expect(fragments().length).toBeGreaterThan(3);
    for (const file of result.files) expectClean(file.path, JSON.stringify(file.data));
    expectClean('report', result.report);
    expect(result.report).toMatch(/Certificate descriptions were emptied/);
  });

  test('files on disk: content/, the report, the scripts and the tests', () => {
    for (const [name, text] of readTree(realContentDir)) expectClean(`content/${name}`, text);
    const others = [
      'docs/migration-report.md',
      'scripts/migrate-legacy.ts',
      'scripts/lib/legacy-migration.ts',
      'scripts/validate-content.ts',
      'src/content/schema.ts',
    ];
    for (const relative of others) {
      const file = path.join(repoRoot, relative);
      expect(existsSync(file), relative).toBe(true);
      expectClean(relative, readFileSync(file, 'utf8'));
    }
    for (const [name, text] of readTree(path.join(repoRoot, 'tests', 'content'))) expectClean(`tests/content/${name}`, text);
  });
});

test.describe('migration — report', () => {
  test('has the count table and lists the flagged items', () => {
    const { report } = result;
    expect(report).toContain('| Projects shown on the old site | 21 | 21 published |');
    expect(report).toContain('| Projects switched off in the old site (inside a comment) | 1 | 1 unpublished | Unity Tools |');
    expect(report).toContain('| Experience entries | 5 | 5 |');
    expect(report).toContain('| Skill groups | 4 | 4 |');
    expect(report).toContain('| Skills (all groups together) | 22 | 22 |');
    expect(report).toContain('| Education entries | 2 | 2 |');
    expect(report).toContain('| Certificates | 3 | 3 |');
    expect(report).toContain('| Profile links that had a value | 5 | 5 link files | empty and skipped: twitter, discord, facebook |');

    const mustMention = [
      'Crypto Tracker: the old value was `GH`', // invalid link
      '3D Platformer ("Gameplay")', // label without URL
      'https://www.youtube.com/Gameplay?v=Lp46QFgKyKM', // malformed video URL
      'id -4: 3D Platformer, Tank it', // duplicate ids
      'id 2: Dating Square, Fruit-Punch',
      'https://www.credly.com/badges/508d3f6b-cadd-40d1-91aa-7f782c8beebe/public_url', // duplicated certificate URL
      '"May - August 2022"', // derived date
      'Astro Game Studio ("June 2024 - Present") and HelpUpDefend ("Dec 2024 - Feb 2025")', // overlap
      '"Dec 2024 - Mar 2025"', // project vs experience date
      '"HelpUpDefend" spelling',
      'Skill icons were dropped',
      'Education pictures were dropped',
      'Project images are loaded from other websites',
      'Headlines are derived',
      'Both pages share one summary',
      'Certificate descriptions were emptied',
      'Empty social links skipped',
      'Tank it (1 empty tag)',
      '"Unity" was listed twice',
      'Unity Tools',
    ];
    for (const text of mustMention) expect(report, text).toContain(text);

    // One numbered list, numbered without gaps.
    const numbers = [...report.matchAll(/^(\d+)\. \*\*/gm)].map((match) => Number(match[1]));
    expect(numbers.length).toBeGreaterThan(20);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });
});

test.describe('migrate script — writing and the overwrite guard', () => {
  test('writes the files, refuses to overwrite, and overwrites only with --force', () => {
    const root = makeTempDir('migrate');
    const out = path.join(root, 'content');
    const report = path.join(root, 'docs', 'migration-report.md');
    const args = ['--out', out, '--report', report];

    // 1. First run into an empty folder: everything is written.
    const first = runScript(MIGRATE, args);
    expect(first.status, first.output).toBe(0);
    const written = readTree(out);
    expect([...written.keys()].sort()).toEqual(result.files.map((file) => file.path).sort());
    for (const file of result.files) {
      expect(written.get(file.path), file.path).toBe(`${JSON.stringify(file.data, null, 2)}\n`);
    }
    expect(readFileSync(report, 'utf8')).toBe(result.report);

    // 2. The owner edits a file and adds one of their own.
    const edited = path.join(out, 'projects', 'scarfall.json');
    const ownersVersion = readFileSync(edited, 'utf8').replace('"Scarfall"', '"Scarfall (edited in the admin)"');
    expect(ownersVersion).toContain('edited in the admin');
    writeFileSync(edited, ownersVersion);
    const ownersFile = path.join(out, 'projects', 'made-later.json');
    writeFileSync(ownersFile, '{"note":"created after go-live"}\n');
    writeFileSync(report, 'report edited by hand\n');

    // 3. A second run without --force writes nothing.
    const second = runScript(MIGRATE, args);
    expect(second.status, second.output).toBe(1);
    expect(second.stderr).toContain('Refusing to migrate');
    expect(second.stderr).toContain('--force');
    expect(readFileSync(edited, 'utf8')).toBe(ownersVersion);
    expect(readFileSync(ownersFile, 'utf8')).toBe('{"note":"created after go-live"}\n');
    expect(readFileSync(report, 'utf8')).toBe('report edited by hand\n');

    // 4. With --force the generated files are rewritten; files it does not generate stay.
    const forced = runScript(MIGRATE, [...args, '--force']);
    expect(forced.status, forced.output).toBe(0);
    expect(readFileSync(edited, 'utf8')).not.toContain('edited in the admin');
    expect(readFileSync(ownersFile, 'utf8')).toBe('{"note":"created after go-live"}\n');
    expect(readFileSync(report, 'utf8')).toBe(result.report);
  });

  test('refuses when the folder holds any content file, even one it would not write', () => {
    // An owner who removed every migrated item and kept only something they created later:
    // none of the migration's own files exist, but the folder is clearly in use.
    const root = makeTempDir('guard');
    const out = path.join(root, 'content');
    const report = path.join(root, 'report.md');
    mkdirSync(path.join(out, 'projects'), { recursive: true });
    writeFileSync(path.join(out, 'projects', 'made-later.json'), '{"note":"created after go-live"}\n');
    const before = readTree(out);

    const refused = runScript(MIGRATE, ['--out', out, '--report', report]);
    expect(refused.status, refused.output).toBe(1);
    expect(refused.stderr).toContain('Refusing to migrate');
    expect(readTree(out)).toEqual(before);
    expect(existsSync(report)).toBe(false);
  });

  test('rejects unknown arguments', () => {
    const usage = runScript(MIGRATE, ['--overwrite']);
    expect(usage.status, usage.output).toBe(2);
    expect(usage.stderr).toContain('Unknown argument: --overwrite');
  });
});
