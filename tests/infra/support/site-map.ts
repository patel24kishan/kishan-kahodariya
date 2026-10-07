/**
 * The site as the content API describes it, for tests that must cover EVERY route.
 *
 * Tests run in Node and cannot import "@/content" (it needs Vite's virtual module), so the
 * list is produced once by a child process (print-site-map.ts) that loads the real content
 * API through Vite. It is synchronous on purpose: Playwright needs the routes while it
 * collects the test files, to create one test per route.
 *
 * The result is cached in an environment variable, which the Playwright workers inherit,
 * so the child process runs once per test run.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SiteMapTrack {
  id: 'game' | 'softdev';
  route: string;
  label: string;
  defaultTab: string;
  metaTitle: string;
  metaDescription: string;
}

export interface SiteMap {
  /** Base path with a trailing slash ("/kishan-kahodariya/"). */
  base: string;
  /** Scheme + host used for canonical URLs. */
  origin: string;
  siteName: string;
  /** getAllRoutes(): router paths without the base and without a trailing slash. */
  routes: string[];
  tabs: Array<{ id: string; label: string }>;
  tracks: SiteMapTrack[];
}

const MARKER = '@@KK_SITE_MAP@@';
const CACHE = 'KK_SITE_MAP_JSON';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function load(): SiteMap {
  const cached = process.env[CACHE];
  if (cached) return JSON.parse(cached) as SiteMap;

  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'tests/infra/support/print-site-map.ts')],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the site map from the content API (is the content valid?).\n${detail}`);
  }
  const json = output.split(MARKER)[1];
  if (!json) throw new Error(`print-site-map.ts printed no site map. Output was:\n${output}`);
  process.env[CACHE] = json;
  return JSON.parse(json) as SiteMap;
}

export const siteMap: SiteMap = load();

/** The page that "/" shows (ARCHITECTURE.md section 3). */
export const HOME_TRACK_ID = 'game';

export interface ExpectedView {
  route: string;
  track: SiteMapTrack;
  tab: string;
  /** Router path of the canonical URL (see src/lib/routing.ts). */
  canonicalPath: string;
  /** Absolute canonical URL. */
  canonicalUrl: string;
}

function mustFindTrack(predicate: (track: SiteMapTrack) => boolean, what: string): SiteMapTrack {
  const track = siteMap.tracks.find(predicate);
  if (!track) throw new Error(`The site map has no track for ${what}.`);
  return track;
}

/**
 * What a route must show, worked out from the route string and the content alone —
 * deliberately not by calling the app's own routing code.
 */
export function expectedView(route: string): ExpectedView {
  const [pageSegment, tabSegment] = route.split('/').filter(Boolean);
  const track =
    pageSegment === undefined
      ? mustFindTrack((candidate) => candidate.id === HOME_TRACK_ID, '"/"')
      : mustFindTrack((candidate) => candidate.route === pageSegment, `"${route}"`);
  const tab = tabSegment ?? track.defaultTab;

  let canonicalPath: string;
  if (tab !== track.defaultTab) canonicalPath = `/${track.route}/${tab}`;
  else canonicalPath = track.id === HOME_TRACK_ID ? '/' : `/${track.route}`;

  return { route, track, tab, canonicalPath, canonicalUrl: `${siteMap.origin}${withBase(canonicalPath)}` };
}

/** Router path → URL path with the base: "/gamedev/unity" → "/kishan-kahodariya/gamedev/unity". */
export function withBase(routePath: string): string {
  return `${siteMap.base}${routePath.replace(/^\/+/, '')}`;
}

/** Router path → address relative to Playwright's baseURL: "/" → "./", "/gamedev" → "./gamedev". */
export function relative(routePath: string): string {
  return `./${routePath.replace(/^\/+/, '')}`;
}

/**
 * What <title> must be for a page: its metaTitle when the content sets one. When it is empty
 * the app composes a title itself; all a test can then demand is that the site name is in it.
 */
export function titleMatcher(track: SiteMapTrack): string | RegExp {
  const explicit = track.metaTitle.replace(/\s+/g, ' ').trim();
  if (explicit) return explicit;
  return new RegExp(siteMap.siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/** true when `title` is acceptable for the page (see titleMatcher). */
export function titleMatches(track: SiteMapTrack, title: string): boolean {
  const matcher = titleMatcher(track);
  const normalised = title.replace(/\s+/g, ' ').trim();
  return typeof matcher === 'string' ? normalised === matcher : matcher.test(normalised);
}

export function trackById(id: SiteMapTrack['id']): SiteMapTrack {
  return mustFindTrack((candidate) => candidate.id === id, `id "${id}"`);
}
