/**
 * Shared helpers for the content specs. These specs are plain Node tests run by Playwright:
 * most of them need no page.
 *
 * Everything that is written to disk goes to the operating system's temp folder — never to
 * the real /content, never to dist/, and not to test-results/ (another agent's Playwright
 * run would wipe that folder while a test is using it).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ContentBundle } from '../../src/content/bundle';
import type { RawContentFile } from '../../src/content/schema';
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

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const realContentDir = path.join(repoRoot, 'content');
export const legacyFile = path.join(repoRoot, 'legacy', 'constants.js');

/** A text that exists only inside unpublished fixture items. It must never reach a bundle. */
export const UNPUBLISHED_MARKER = 'zq7-unpublished-fixture';
/** Title of a published fixture project. It must reach the bundle. */
export const PUBLISHED_TITLE = 'Alpha Published Fixture';

// ---------------------------------------------------------------------------------------
// Temp folders
// ---------------------------------------------------------------------------------------

const tempDirs: string[] = [];

export function makeTempDir(label: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `kk-content-${label}-`));
  tempDirs.push(dir);
  return dir;
}

/** Call from test.afterAll. */
export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // A file watcher may still hold the folder on Windows; the OS temp folder is cleaned later.
    }
  }
}

export function writeContentDir(dir: string, files: readonly RawContentFile[]): void {
  for (const file of files) {
    const target = path.join(dir, ...file.path.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(file.data, null, 2)}\n`, 'utf8');
  }
}

export function writeJson(dir: string, relativePath: string, data: unknown): void {
  writeContentDir(dir, [{ path: relativePath, data }]);
}

/** Every file under `dir` (recursively) as { relative path → text }. */
export function readTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string, relative: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else out.set(rel, readFileSync(path.join(current, entry.name), 'utf8'));
    }
  };
  walk(dir, '');
  return out;
}

// ---------------------------------------------------------------------------------------
// Running the project's scripts
// ---------------------------------------------------------------------------------------

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  output: string;
}

function run(args: readonly string[], env: Record<string, string> = {}): RunResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 110_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, output: `${stdout}\n${stderr}` };
}

/** Runs a TypeScript script the way the npm scripts do (tsx). */
export function runScript(script: string, args: readonly string[] = [], env: Record<string, string> = {}): RunResult {
  return run([path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), script, ...args], env);
}

/** Runs the Vite CLI with the project's real vite.config.ts. */
export function runVite(args: readonly string[]): RunResult {
  return run([path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), ...args]);
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/** The old site's content, exactly as legacy/constants.js exports it. */
export async function loadLegacyModule(): Promise<Record<string, unknown>> {
  const module: unknown = await import(pathToFileURL(legacyFile).href);
  return { ...(module as Record<string, unknown>) };
}

// ---------------------------------------------------------------------------------------
// A small, valid content set with one unpublished item in every collection
// ---------------------------------------------------------------------------------------

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: 'alpha',
    title: PUBLISHED_TITLE,
    shortDescription: 'Short text.',
    longDescription: '',
    dateDisplay: '2024',
    tags: ['Unity', 'C#'],
    category: 'unity',
    audience: 'game',
    featured: false,
    published: true,
    orderGame: 10,
    orderSoftdev: 10,
    hoverText: '',
    screenshots: [{ src: '/uploads/alpha.webp', alt: 'Alpha cover image' }],
    videoUrl: '',
    links: [{ label: 'View Code', url: 'https://example.com/alpha', kind: 'code' }],
    legacyId: null,
    ...overrides,
  };
}

export function makeExperience(overrides: Partial<Experience> = {}): Experience {
  return {
    slug: 'acme',
    company: 'Acme Games',
    role: 'Developer',
    location: '',
    remote: false,
    startDate: '2024-06',
    endDate: '',
    present: true,
    dateDisplay: 'June 2024 - Present',
    logo: '',
    bullets: ['Default bullet.'],
    bulletsGame: [],
    bulletsSoftdev: [],
    tags: ['Unity'],
    audience: 'game',
    orderGame: 10,
    orderSoftdev: 10,
    published: true,
    ...overrides,
  };
}

export function makeSkillGroup(overrides: Partial<SkillGroup> = {}): SkillGroup {
  return {
    slug: 'game-dev',
    title: 'Game Dev',
    skills: ['Unity3D'],
    emphasis: 'game',
    orderGame: 10,
    orderSoftdev: 20,
    published: true,
    ...overrides,
  };
}

export function makeLink(overrides: Partial<SocialLink> = {}): SocialLink {
  return {
    slug: 'github',
    label: 'GitHub',
    url: 'https://github.com/example',
    icon: 'github',
    audience: 'both',
    order: 10,
    showInHero: true,
    showInFooter: true,
    published: true,
    ...overrides,
  };
}

export function makeEducation(overrides: Partial<Education> = {}): Education {
  return {
    slug: 'school',
    school: 'Example University',
    degree: 'Degree',
    dateDisplay: '2019 - 2021',
    grade: '',
    description: '',
    order: 10,
    published: true,
    ...overrides,
  };
}

export function makeCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return {
    slug: 'cert',
    title: 'Example Certificate',
    dateDisplay: '2023',
    description: '',
    image: '/uploads/cert.png',
    imageAlt: 'Example Certificate badge',
    url: 'https://example.com/cert',
    orderGame: 10,
    orderSoftdev: 10,
    published: true,
    ...overrides,
  };
}

export function makeSite(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return {
    name: 'Fixture Person',
    monogram: 'FP',
    email: 'person@example.com',
    credit: ['Line one.', 'Line two.'],
    roles: ['a Developer'],
    allTabLabel: 'All',
    categories: [
      { id: 'unreal', label: 'Unreal', order: 10, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
      { id: 'unity', label: 'Unity3D', order: 20, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
      { id: 'webapps', label: 'Web Apps', order: 30, hoverWithVideo: 'View Demo & Screenshots', hoverWithoutVideo: 'View Screenshots' },
    ],
    ...overrides,
  };
}

export function makeTrack(id: 'game' | 'softdev', overrides: Partial<TrackProfile> = {}): TrackProfile {
  const game = id === 'game';
  return {
    id,
    route: game ? 'gamedev' : 'softdev',
    label: game ? 'Game Dev' : 'Software',
    headline: game ? 'Game Developer' : 'Software Engineer',
    summary: 'Summary.',
    resumeUrl: 'https://example.com/resume',
    resumeLabel: game ? 'Game Dev Resume' : 'Software Resume',
    defaultTab: game ? 'unity' : 'webapps',
    photo: '/images/profile.jpg',
    photoAlt: 'Fixture Person',
    certificatesFirst: !game,
    metaTitle: 'Fixture Person',
    metaDescription: '',
    ...overrides,
  };
}

/** Valid content: published items plus one unpublished item (carrying the marker) per collection. */
export function fixtureBundle(): ContentBundle {
  return {
    site: makeSite(),
    tracks: [makeTrack('game'), makeTrack('softdev')],
    projects: [
      makeProject(),
      makeProject({ slug: 'beta', title: 'Beta Web App', category: 'webapps', audience: 'softdev', orderGame: 20, orderSoftdev: 20 }),
      makeProject({ slug: 'hidden-draft', title: `Hidden Draft ${UNPUBLISHED_MARKER}`, published: false, orderGame: 5, orderSoftdev: 5 }),
    ],
    experience: [
      makeExperience(),
      makeExperience({ slug: 'hidden-job', company: `Hidden Job ${UNPUBLISHED_MARKER}`, published: false }),
    ],
    skills: [
      makeSkillGroup(),
      makeSkillGroup({ slug: 'hidden-skills', title: `Hidden Skills ${UNPUBLISHED_MARKER}`, published: false }),
    ],
    links: [
      makeLink(),
      makeLink({ slug: 'hidden-link', label: `Hidden Link ${UNPUBLISHED_MARKER}`, published: false }),
    ],
    education: [
      makeEducation(),
      makeEducation({ slug: 'hidden-school', school: `Hidden School ${UNPUBLISHED_MARKER}`, published: false }),
    ],
    certificates: [
      makeCertificate(),
      makeCertificate({ slug: 'hidden-cert', title: `Hidden Cert ${UNPUBLISHED_MARKER}`, published: false }),
    ],
  };
}

/** The same content as files, the way it sits on disk. */
export function bundleToFiles(bundle: ContentBundle): RawContentFile[] {
  return [
    { path: 'site.json', data: bundle.site },
    ...bundle.tracks.map((item) => ({ path: `tracks/${item.id}.json`, data: item })),
    ...bundle.projects.map((item) => ({ path: `projects/${item.slug}.json`, data: item })),
    ...bundle.experience.map((item) => ({ path: `experience/${item.slug}.json`, data: item })),
    ...bundle.skills.map((item) => ({ path: `skills/${item.slug}.json`, data: item })),
    ...bundle.links.map((item) => ({ path: `links/${item.slug}.json`, data: item })),
    ...bundle.education.map((item) => ({ path: `education/${item.slug}.json`, data: item })),
    ...bundle.certificates.map((item) => ({ path: `certificates/${item.slug}.json`, data: item })),
  ];
}

export function fixtureFiles(): RawContentFile[] {
  return bundleToFiles(fixtureBundle());
}
