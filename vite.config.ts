import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { contentPlugin } from './scripts/lib/content-plugin';
import { BASE_PATH, DEFAULT_SITE_ORIGIN, DIST_DIR } from './src/lib/site-config';

// GitHub Pages serves this repo under /My-Portfolio/. The value lives in
// src/lib/site-config.ts (so the Playwright configs and the scripts can read it without
// loading Vite); change it there, and only if the repo is renamed.
export const BASE = BASE_PATH;

// Scheme + host of the live site, for canonical and Open Graph URLs. The deploy workflow
// passes the origin GitHub Pages reports; everywhere else the default applies.
export const SITE_ORIGIN = (process.env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');

export default defineConfig({
  base: BASE,
  // contentPlugin() provides "virtual:content" (owned by the content agent) — keep it registered.
  plugins: [react(), contentPlugin()],
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
