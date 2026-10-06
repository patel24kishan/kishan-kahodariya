import { defineConfig, devices } from '@playwright/test';

/**
 * Feature tests run against the Vite dev server.
 * PW_PORT lets every agent / run use its own port so parallel runs never collide.
 * Tests under tests/build/ need a production build and run with playwright.build.config.ts.
 */
const PORT = Number(process.env.PW_PORT ?? 5173);
const BASE_URL = `http://localhost:${PORT}/My-Portfolio/`;

export default defineConfig({
  testDir: './tests',
  testIgnore: ['build/**'],
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
    command: `npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
