/**
 * What the media viewer shows, and how that is written in the address.
 *
 *   ?view=<project slug>&item=video     the gameplay video
 *   ?view=<project slug>&item=<n>       screenshot n (1-based)
 *   ?view=<project slug>                the first screenshot (else the video)
 *
 * Screenshot numbers rather than strip positions, so a link keeps its meaning when the owner
 * later adds or removes a video. Pure functions: usable in Node tests.
 */
import type { Project } from '@/content/types';
import { youtubeVideoId } from './youtube';

export const VIEW_PARAM = 'view';
export const ITEM_PARAM = 'item';
export const VIDEO_ITEM = 'video';

/** Which item of a project the address asks for. */
export type ViewerItemRef = { kind: 'video' } | { kind: 'screenshot'; index: number };

export interface ViewerRequest {
  slug: string;
  item: ViewerItemRef | null;
}

/** One entry of the viewer's strip: the video first (when there is one), then the screenshots. */
export type ViewerItem =
  | { kind: 'video'; key: string; url: string; videoId: string | null }
  | { kind: 'screenshot'; key: string; index: number; src: string; alt: string };

export function viewerItems(project: Pick<Project, 'videoUrl' | 'screenshots'>): ViewerItem[] {
  const items: ViewerItem[] = [];
  const videoUrl = project.videoUrl.trim();
  if (videoUrl !== '') items.push({ kind: 'video', key: 'video', url: videoUrl, videoId: youtubeVideoId(videoUrl) });
  project.screenshots.forEach((shot, index) => {
    items.push({ kind: 'screenshot', key: `screenshot-${index}`, index, src: shot.src, alt: shot.alt });
  });
  return items;
}

/** Index in `items` of the requested item; the first screenshot (else the first item) when
 *  nothing or something that does not exist was asked for. -1 when there are no items. */
export function resolveItemIndex(items: readonly ViewerItem[], ref: ViewerItemRef | null): number {
  if (items.length === 0) return -1;
  if (ref?.kind === 'video') {
    const index = items.findIndex((item) => item.kind === 'video');
    if (index >= 0) return index;
  }
  if (ref?.kind === 'screenshot') {
    const index = items.findIndex((item) => item.kind === 'screenshot' && item.index === ref.index);
    if (index >= 0) return index;
  }
  const firstScreenshot = items.findIndex((item) => item.kind === 'screenshot');
  return firstScreenshot >= 0 ? firstScreenshot : 0;
}

export function itemRefOf(item: ViewerItem): ViewerItemRef {
  return item.kind === 'video' ? { kind: 'video' } : { kind: 'screenshot', index: item.index };
}

/** The viewer request in a query string, or null when the viewer is closed. */
export function parseViewerSearch(search: string): ViewerRequest | null {
  const params = new URLSearchParams(search);
  const slug = params.get(VIEW_PARAM)?.trim() ?? '';
  if (slug === '') return null;
  const raw = params.get(ITEM_PARAM)?.trim() ?? '';
  let item: ViewerItemRef | null = null;
  if (raw === VIDEO_ITEM) item = { kind: 'video' };
  else if (/^\d+$/.test(raw) && Number(raw) >= 1) item = { kind: 'screenshot', index: Number(raw) - 1 };
  return { slug, item };
}

/** `search` with the viewer parameters set to `request` (or removed when null); other
 *  parameters are kept. Returns "" or "?…". */
export function withViewerSearch(search: string, request: ViewerRequest | null): string {
  const params = new URLSearchParams(search);
  params.delete(VIEW_PARAM);
  params.delete(ITEM_PARAM);
  if (request) {
    params.set(VIEW_PARAM, request.slug);
    if (request.item) params.set(ITEM_PARAM, request.item.kind === 'video' ? VIDEO_ITEM : String(request.item.index + 1));
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}
