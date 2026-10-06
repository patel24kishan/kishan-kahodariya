/**
 * Which page and tab an address shows, the address the browser should display for it, and
 * its canonical URL. Pure functions over the content API — safe in the browser bundle and in
 * the prerender bundle.
 *
 * Three different "addresses" exist for one view, on purpose:
 *
 *   what the visitor typed   /gamedev/unity/     /gamedev/nope     /            /softdev/webapps
 *   path  (address bar)      /gamedev/unity      /gamedev          /            /softdev/webapps
 *   canonicalPath (SEO)      /                   /                 /            /softdev
 *
 * - `path` only repairs an address (trailing slash, letter case, unknown tab). It never moves
 *   a visitor off a valid URL, so "/gamedev/unity" stays "/gamedev/unity": the address always
 *   reflects the open tab (ARCHITECTURE.md section 3).
 * - `canonicalPath` is what `<link rel="canonical">` and og:url point at. A page's default
 *   view has several valid URLs; exactly one of them is canonical: "/" for the home page's
 *   default tab, "/<route>" for any other page's default tab, "/<route>/<tab>" otherwise.
 */
import { getTrack, resolveTab, type TrackId, type TrackProfile } from '@/content';
import { trackPath } from './paths';

/** The page shown at "/". */
export const HOME_TRACK: TrackId = 'game';

/** Old address of the game page; "/game" and "/game/…" redirect to the game page's route. */
export const LEGACY_GAME_SEGMENT = 'game';

export interface TrackView {
  track: TrackProfile;
  /** Always a valid tab id (an unknown one has already fallen back to the page default). */
  tab: string;
  isDefaultTab: boolean;
  /** Router path the address bar should show for this view. */
  path: string;
  /** Router path of the canonical URL for this view. */
  canonicalPath: string;
}

/** Canonical router path for one page + tab. */
export function canonicalPath(track: TrackProfile, tab: string): string {
  if (tab !== track.defaultTab) return trackPath(track, tab);
  return track.id === HOME_TRACK ? '/' : trackPath(track);
}

/**
 * Resolve one page view.
 * @param tabSegment the raw ":tab" URL segment, or undefined when the address has none
 * @param isHome     true when the address is "/" itself
 */
export function resolveTrackView(trackId: TrackId, tabSegment: string | undefined, isHome = false): TrackView {
  const track = getTrack(trackId);
  const tab = resolveTab(trackId, tabSegment);
  const tabInAddressIsValid = tabSegment !== undefined && tabSegment === tab;

  let path: string;
  if (isHome) path = '/';
  else if (tabInAddressIsValid) path = trackPath(track, tab);
  else path = trackPath(track);

  return {
    track,
    tab,
    isDefaultTab: tab === track.defaultTab,
    path,
    canonicalPath: canonicalPath(track, tab),
  };
}

/** Where "/game" and "/game/<rest>" go: the game page's route with the rest kept. */
export function legacyGameTarget(rest: string | undefined): string {
  const page = trackPath(getTrack(HOME_TRACK));
  const tail = (rest ?? '').replace(/^\/+|\/+$/g, '');
  return tail ? `${page}/${tail}` : page;
}
