import { defineConfig, devices } from '@playwright/test';
import { BASE_PATH } from './src/lib/site-config';

/**
 * Feature tests run against the Vite dev server.
 * PW_PORT lets every agent / run use its own port so parallel runs never collide
 * (ARCHITECTURE.md section 8):  PW_PORT=5183 npx playwright test tests/infra
 * Tests under tests/build/ need a production build and run with playwright.build.config.ts.
 *
 * `baseURL` ends with the base path, so tests navigate with relative addresses:
 * page.goto('./') is the home page, page.goto('gamedev/unity') a deep link.
 */
const PORT = Number(process.env.PW_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/tests/build/**'],
  // One output folder per port. Playwright empties its output folder when a run starts, so
  // agents running at the same time in one checkout must not share it (a shared folder made
  // one run delete the traces another run was still writing).
  outputDir: `./test-results/dev-${PORT}`,
  fullyParallel: true,
  // The suite drives a real CMS and many layout measurements; with Playwright's default (half
  // the CPU cores) timing-sensitive tests failed at random on a 20-core machine and passed
  // with fewer workers. Four is stable; override with PW_WORKERS.
  workers: Number(process.env.PW_WORKERS ?? 4),
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
    command: `npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
