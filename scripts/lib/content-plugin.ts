import type { Plugin } from 'vite';

/**
 * CONTRACT (architect): Vite plugin that exposes the /content folder to the app as the
 * virtual module "virtual:content" — read from disk at dev/build time, validated with the
 * zod schema, with unpublished items removed so they never reach the client bundle.
 *
 * Placeholder (no-op) — the content agent (phase 1) implements it. Keep the export name and
 * keep it a function returning a Vite plugin; vite.config.ts already registers it.
 */
export function contentPlugin(): Plugin {
  return { name: 'kk-content' };
}
