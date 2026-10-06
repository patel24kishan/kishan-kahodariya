/**
 * Ambient declarations for values the infra layer injects.
 * This file has no imports or exports on purpose: that is what makes it global.
 */

/**
 * Scheme + host of the live site without a trailing slash ("https://example.github.io").
 * Replaced at build time by Vite (`define` in vite.config.ts). Read it through
 * absoluteUrl() / absoluteAssetUrl() in src/lib/paths.ts rather than directly.
 */
declare const __SITE_ORIGIN__: string;

interface Window {
  /**
   * DEV BUILDS ONLY — a test hook that performs a router navigation exactly like a
   * `<Link>` click (a history push, or a replace with `{ replace: true }`).
   * It does not exist in the production bundle. Used by tests/infra.
   */
  __kkNavigate?: (to: string, options?: { replace?: boolean }) => void;
}
