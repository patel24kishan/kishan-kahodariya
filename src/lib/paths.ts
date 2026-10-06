/**
 * URL helpers. The only place that knows how the base path ("/My-Portfolio/") and the site
 * origin are applied. Nothing else in the app may hard-code either of them.
 *
 * Three kinds of address, three helpers:
 *
 *   content asset   "/images/profile.jpg"  → assetUrl()    → "/My-Portfolio/images/profile.jpg"
 *   router path     "/gamedev/unity"       → use as-is with <Link to> / navigate(); the
 *                                            router adds the base itself
 *   plain <a href>  "/gamedev/unity"       → routeHref()   → "/My-Portfolio/gamedev/unity"
 *
 * `createPaths(base, origin)` is the pure implementation (unit-tested in tests/infra). The
 * top-level functions are the same helpers bound to the running build's base and origin.
 * They read `import.meta.env` lazily, so this module can be imported outside Vite too.
 */
import type { TrackProfile } from '@/content';

/** A URL scheme ("https:", "mailto:", "data:", "tel:" …) or a protocol-relative "//host". */
const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/** http(s) or protocol-relative: a link that leaves the site. */
const EXTERNAL_URL = /^(?:https?:)?\/\//i;

/** true for any URL that must not be prefixed with the base ("https://…", "mailto:…", "//cdn…"). */
export function isAbsoluteUrl(url: string): boolean {
  return ABSOLUTE_URL.test(url.trim());
}

/**
 * true for a web link to another origin-qualified address ("https://…", "http://…", "//…").
 * Use it to decide on `target="_blank" rel="noopener noreferrer"`.
 * false for "", site paths, "#hash", "mailto:" and "tel:" (those must not open a new tab).
 */
export function isExternalUrl(url: string): boolean {
  return EXTERNAL_URL.test(url.trim());
}

/**
 * Router path of a page, optionally with a project tab: "/gamedev", "/gamedev/unity".
 * Pass it to `<Link to>` / `navigate()`. For a plain `<a href>` use trackHref().
 */
export function trackPath(track: string | Pick<TrackProfile, 'route'>, tab?: string): string {
  const route = typeof track === 'string' ? track : track.route;
  const page = `/${route.replace(/^\/+|\/+$/g, '')}`;
  return tab ? `${page}/${encodeURIComponent(tab)}` : page;
}

export interface PathHelpers {
  /** The base path, always with a leading and a trailing slash: "/My-Portfolio/" or "/". */
  readonly base: string;
  assetUrl(path: string): string;
  routeHref(routePath: string): string;
  trackHref(track: string | Pick<TrackProfile, 'route'>, tab?: string): string;
  absoluteUrl(routePath: string): string;
  absoluteAssetUrl(path: string): string;
}

export function createPaths(base: string, origin = ''): PathHelpers {
  const trimmedBase = base.replace(/^\/+|\/+$/g, '');
  const normalisedBase = trimmedBase ? `/${trimmedBase}/` : '/';
  const normalisedOrigin = origin.replace(/\/+$/, '');

  const withBase = (path: string): string => `${normalisedBase}${path.replace(/^\/+/, '')}`;

  const helpers: PathHelpers = {
    base: normalisedBase,

    assetUrl(path) {
      if (path === '') return '';
      if (isAbsoluteUrl(path) || path.startsWith('#') || path.startsWith('?')) return path;
      return withBase(path);
    },

    routeHref(routePath) {
      return withBase(routePath);
    },

    trackHref(track, tab) {
      return withBase(trackPath(track, tab));
    },

    absoluteUrl(routePath) {
      return `${normalisedOrigin}${withBase(routePath)}`;
    },

    absoluteAssetUrl(path) {
      if (path === '' || isAbsoluteUrl(path)) return path;
      return `${normalisedOrigin}${helpers.assetUrl(path)}`;
    },
  };
  return helpers;
}

let bound: PathHelpers | undefined;

/** The helpers bound to this build's base path and site origin. */
function paths(): PathHelpers {
  bound ??= createPaths(import.meta.env.BASE_URL, __SITE_ORIGIN__);
  return bound;
}

/**
 * `basename` for the router: the base path WITH its trailing slash ("/My-Portfolio/").
 * React Router uses the basename verbatim as the href of "/", so the trailing slash is what
 * makes a home link point at "/My-Portfolio/" — the address GitHub Pages actually serves —
 * instead of "/My-Portfolio", which is a redirect. Other links are unaffected
 * ("/My-Portfolio/gamedev").
 */
export function routerBasename(): string {
  return paths().base;
}

/**
 * URL for an image / file path that comes from content.
 * - ""                                   → "" (not set; the caller skips rendering)
 * - "https://…", "//…", "data:…", "mailto:…" → unchanged
 * - "/images/profile.jpg"                → "<base>images/profile.jpg"
 * Content never contains the base, so do not pass a value through this function twice.
 */
export function assetUrl(path: string): string {
  return paths().assetUrl(path);
}

/** Router path → value for a plain `<a href>`: "/gamedev/unity" → "<base>gamedev/unity". */
export function routeHref(routePath: string): string {
  return paths().routeHref(routePath);
}

/** trackPath() with the base applied, for a plain `<a href>`. */
export function trackHref(track: string | Pick<TrackProfile, 'route'>, tab?: string): string {
  return paths().trackHref(track, tab);
}

/** Router path → absolute URL on the live site (canonical and Open Graph links). */
export function absoluteUrl(routePath: string): string {
  return paths().absoluteUrl(routePath);
}

/** Content asset path → absolute URL on the live site (og:image). "" stays "". */
export function absoluteAssetUrl(path: string): string {
  return paths().absoluteAssetUrl(path);
}
