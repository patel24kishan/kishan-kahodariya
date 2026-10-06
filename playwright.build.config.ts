import { defineConfig, devices } from '@playwright/test';
import { BASE_PATH } from './src/lib/site-config';

/**
 * Production-build tests (tests/build/**): prerendered HTML, deep links, the 404 page,
 * redirects, asset URLs. They run against dist/ served by scripts/serve-pages.ts, which
 * answers the way GitHub Pages does.
 *
 *   PW_BUILD_PORT=4183 npx playwright test -c playwright.build.config.ts
 *
 * The run builds the site once (`npm run build`) and then starts the server.
 * Only infra, admin, qa and the architect run this suite, because it rewrites dist/.
 *
 * Environment
 *   PW_BUILD_PORT   port for the preview server (default 4173). Per agent: see
 *                   ARCHITECTURE.md section 8 (infra 4183, admin 4185, qa 4186, architect 4180).
 *   PW_SKIP_BUILD   set to 1 to serve the dist/ that is already there (CI builds first).
 */
const PORT = Number(process.env.PW_BUILD_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;
const SERVE = 'npx tsx scripts/serve-pages.ts';

export default defineConfig({
  testDir: './tests/build',
  // One output folder per port, so runs that overlap never empty each other's results.
  outputDir: `./test-results/build-${PORT}`,
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: process.env.PW_SKIP_BUILD === '1' ? SERVE : `npm run build && ${SERVE}`,
    url: BASE_URL,
    env: { PORT: String(PORT) },
    // A server left over from an earlier run would serve a stale build: always start fresh.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
  },
});
