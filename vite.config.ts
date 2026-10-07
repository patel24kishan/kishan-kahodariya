import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { contentPlugin } from './scripts/lib/content-plugin';
import { BASE_PATH, DEFAULT_SITE_ORIGIN, DIST_DIR } from './src/lib/site-config';

// GitHub Pages serves this repo under /kishan-kahodariya/. The value lives in
// src/lib/site-config.ts (so the Playwright configs and the scripts can read it without
// loading Vite); change it there, and only if the repo is renamed.
export const BASE = BASE_PATH;

// Scheme + host of the live site, for canonical and Open Graph URLs. The deploy workflow
// passes the origin GitHub Pages reports; everywhere else the default applies.
export const SITE_ORIGIN = (process.env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');

/**
 * Dev server only (added by the admin agent). The dashboard is a static page,
 * public/admin/index.html, not a route of the app. GitHub Pages and scripts/serve-pages.ts
 * answer "<base>admin/" with that file and redirect "<base>admin" to it; the Vite dev server
 * would answer both with the app's index.html instead. This gives the dev server the same
 * two rules, so /kishan-kahodariya/admin/ opens the dashboard everywhere.
 */
function adminPage(): Plugin {
  const folder = `${BASE}admin`;
  return {
    name: 'kk-admin-page',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [pathname, ...rest] = (request.url ?? '').split('?');
        const query = rest.length > 0 ? `?${rest.join('?')}` : '';
        if (pathname === folder) {
          response.writeHead(301, { Location: `${folder}/${query}`, 'Content-Length': 0 });
          response.end();
          return;
        }
        if (pathname === `${folder}/`) request.url = `${folder}/index.html${query}`;
        next();
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  // contentPlugin() provides "virtual:content" (owned by the content agent) — keep it registered.
  plugins: [react(), contentPlugin(), adminPage()],
  define: {
    // Declared in src/lib/globals.d.ts, read through src/lib/paths.ts.
    __SITE_ORIGIN__: JSON.stringify(SITE_ORIGIN),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: DIST_DIR,
    // Never publish source maps: the site is public and the sources are in the repo anyway.
    sourcemap: false,
  },
  server: {
    // Each agent / test run picks its own port through PW_PORT so runs never collide.
    port: Number(process.env.PW_PORT ?? 5173),
    strictPort: true,
  },
});
