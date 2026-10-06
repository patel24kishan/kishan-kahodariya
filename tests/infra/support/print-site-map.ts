/**
 * Prints the site map (routes, pages, tabs) as JSON, read from the real content API.
 *
 * Run by site-map.ts in a child process:  tsx tests/infra/support/print-site-map.ts
 * It loads src/content/index.ts through Vite (so the "virtual:content" plugin and the
 * "@/…" alias work exactly as in the app) and calls the same functions the app calls.
 * The JSON is wrapped in markers because Vite may print warnings to stdout around it.
 */
import { createServer } from 'vite';
import type * as Content from '../../../src/content';

const SITE_MAP_MARKER = '@@KK_SITE_MAP@@';

const server = await createServer({
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const content = (await server.ssrLoadModule('/src/content/index.ts')) as typeof Content;
  const origin: unknown = server.config.define?.__SITE_ORIGIN__;
  const siteMap = {
    base: server.config.base,
    origin: typeof origin === 'string' ? (JSON.parse(origin) as string) : '',
    siteName: content.getSite().name,
    routes: content.getAllRoutes(),
    tabs: content.getTabs(),
    tracks: content.getTracks().map((track) => ({
      id: track.id,
      route: track.route,
      label: track.label,
      defaultTab: track.defaultTab,
      metaTitle: track.metaTitle,
      metaDescription: track.metaDescription,
    })),
  };
  process.stdout.write(`${SITE_MAP_MARKER}${JSON.stringify(siteMap)}${SITE_MAP_MARKER}\n`);
} finally {
  await server.close();
}
