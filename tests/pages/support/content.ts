/**
 * The content as the page must render it, read from /content on disk (Node), so every
 * expectation in tests/pages is computed from the owner's content and keeps passing when the
 * owner edits it. Mirrors how the app reads content (ARCHITECTURE.md §11): loadContent() +
 * publishedOnly() + createContentApi().
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, publishedOnly } from '../../../scripts/lib/load-content';
import { youtubeVideoId } from '../../../src/components/viewer/youtube';
import { createContentApi, type ContentApi } from '../../../src/content/selectors';
import type { Project, TrackId, TrackProfile } from '../../../src/content/types';
import { BASE_PATH } from '../../../src/lib/site-config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loaded = loadContent(path.join(ROOT, 'content'));
if (!loaded.ok) {
  throw new Error(`The content under /content is not valid:\n${loaded.issues.map((issue) => `  ${issue.file} · ${issue.field}: ${issue.message}`).join('\n')}`);
}

/** The content API over the published content, exactly what "@/content" exposes to the page. */
export const content: ContentApi = createContentApi(publishedOnly(loaded.content));

export const TRACK_IDS: readonly TrackId[] = ['game', 'softdev'];

/** The anchored sections in page order (src/components/layout/sections.ts). */
export const SECTION_IDS = ['about', 'projects', 'experience', 'skills', 'education'] as const;
export const SECTION_LABELS = ['About', 'Projects', 'Experience', 'Skills', 'Education'] as const;

/** Base path with its trailing slash ("/My-Portfolio/"). */
export const base = BASE_PATH;

/** Router path of a page view: "/gamedev", "/gamedev/unity". */
export function routeOf(track: TrackProfile, tab?: string): string {
  return tab ? `/${track.route}/${tab}` : `/${track.route}`;
}

/** Router path → URL path with the base ("/gamedev/unity" → "/My-Portfolio/gamedev/unity"). */
export function withBase(routePath: string): string {
  return `${base}${routePath.replace(/^\/+/, '')}`;
}

/** Router path → address relative to the Playwright baseURL ("/gamedev" → "./gamedev"). */
export function relative(routePath: string): string {
  return `./${routePath.replace(/^\/+/, '')}`;
}

/** assetUrl() as the app applies it: absolute URLs unchanged, site paths get the base. */
export function assetHref(assetPath: string): string {
  if (assetPath === '') return '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(assetPath) || assetPath.startsWith('#')) return assetPath;
  return withBase(assetPath);
}

/** true for an address that opens in a new tab (src/lib/paths.ts isExternalUrl). */
export function isExternal(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url.trim());
}

/** The owner's text split the way the page renders it: blank lines separate paragraphs. */
export function paragraphsOf(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.trim() !== '');
}

export function normaliseSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The viewer's strip for a project: the video first, then the screenshots. */
export function viewerItemCount(project: Project): number {
  return (project.videoUrl.trim() !== '' ? 1 : 0) + project.screenshots.length;
}

export function hasParseableVideo(project: Project): boolean {
  return project.videoUrl.trim() !== '' && youtubeVideoId(project.videoUrl) !== null;
}

/** A YouTube address in a non-standard form that still carries a readable id (one migrated project). */
export function hasNonStandardVideoAddress(project: Project): boolean {
  const url = project.videoUrl.trim();
  if (url === '' || youtubeVideoId(url) === null) return false;
  return !/youtube\.com\/watch\?|youtu\.be\/|\/embed\/|\/shorts\//i.test(url);
}

export { youtubeVideoId };
