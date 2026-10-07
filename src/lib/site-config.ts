/**
 * Build-time site settings — the ONE place the deploy location is written down.
 *
 * Imported by config files and Node scripts only (vite.config.ts, the Playwright configs,
 * scripts/prerender.ts, scripts/serve-pages.ts). App code never imports this file: it reads
 * the base from `import.meta.env.BASE_URL` and the origin from `__SITE_ORIGIN__`, both of
 * which Vite fills in from the values below (see vite.config.ts and src/lib/paths.ts).
 *
 * Keep this file free of imports so every tool can load it.
 */

/**
 * Path the site is served under. GitHub Pages serves a project site under "/<repo name>/".
 * Change it only if the repository is renamed (or to "/" for a custom domain).
 * Must start and end with "/".
 */
export const BASE_PATH: string = '/kishan-kahodariya/';

/**
 * Scheme + host of the live site, without a trailing slash. Used for canonical and Open
 * Graph URLs, which must be absolute. The deploy workflow overrides it with the origin
 * GitHub Pages reports (environment variable SITE_ORIGIN), so this is the local default.
 */
export const DEFAULT_SITE_ORIGIN: string = 'https://patel24kishan.github.io';

/** Directory (relative to the repo root) the production build is written to. */
export const DIST_DIR = 'dist';
