/**
 * Tests of the admin page as a server hands it out. The same tests run against the Vite dev
 * server (tests/admin/page.spec.ts) and against the production build served the way GitHub
 * Pages serves it (tests/build/admin.spec.ts): the page must behave the same in both.
 *
 * Addresses are relative to the Playwright baseURL, which ends with the base path.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { adminDir, configText, htmlText, pinnedScript } from './env';
import { ADMIN_PATH, CONFIG_ERROR, LOCAL_BUTTON, TOKEN_BUTTON, cdnSkipMessage, cdnStatus } from './dashboard';

/** Hosts the page may talk to before anyone signs in (found by watching Sveltia CMS 0.230.0). */
const EXPECTED_HOSTS = new Set(['localhost', 'unpkg.com', 'cdn.jsdelivr.net', 'www.githubstatus.com']);

export function defineServedPageTests(mode: 'dev server' | 'production build'): void {
  test.describe(`the admin page on the ${mode}`, () => {
    test('is served at <base>admin/ exactly as it is in the repo', async ({ request }) => {
      const response = await request.get(ADMIN_PATH, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^text\/html/);
      expect(await response.text()).toBe(htmlText());

      const direct = await request.get(`${ADMIN_PATH}index.html`, { maxRedirects: 0 });
      expect(direct.status()).toBe(200);
      expect(await direct.text()).toBe(htmlText());
    });

    test('the address without the trailing slash redirects to it', async ({ request, baseURL }) => {
      const response = await request.get('admin', { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(new URL(response.headers().location ?? '', baseURL).pathname).toBe(`${new URL(baseURL ?? '').pathname}admin/`);
    });

    test('carries noindex, a title and one pinned script with an integrity hash', async ({ page }) => {
      // Only the document: the test must not depend on the CDN.
      await page.route('**/*', (route) => (route.request().resourceType() === 'document' ? route.continue() : route.abort()));
      await page.goto(ADMIN_PATH);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expect(page).toHaveTitle('Portfolio Admin');

      const scripts = await page.locator('script').evaluateAll((nodes) =>
        nodes.map((node) => ({
          src: node.getAttribute('src'),
          integrity: node.getAttribute('integrity'),
          crossorigin: node.getAttribute('crossorigin'),
          inline: (node.textContent ?? '').trim().length > 0,
        })),
      );
      const external = scripts.filter((script) => /^https?:/.test(script.src ?? ''));
      expect(external).toHaveLength(1);
      const pinned = pinnedScript();
      expect(pinned.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(external[0]).toEqual({ src: pinned.src, integrity: pinned.integrity, crossorigin: 'anonymous', inline: false });
      expect(pinned.src).toBe(`https://unpkg.com/@sveltia/cms@${pinned.version}/dist/sveltia-cms.js`);
      expect(pinned.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
      expect(scripts.filter((script) => script.inline), 'no inline scripts').toEqual([]);
      expect(scripts.map((script) => script.src)).toEqual([pinned.src, 'slug-guard.js', 'preview.js']);

      // Nothing else on the page points at another site.
      const others = await page
        .locator('link[href], img[src], iframe[src], source[src], video[src], audio[src], object[data], embed[src]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? node.getAttribute('src') ?? node.getAttribute('data') ?? ''));
      expect(others.filter((address) => /^(?:https?:)?\/\//.test(address))).toEqual([]);
    });

    test('config.yml is served as YAML, parses, and is the file in the repo', async ({ request }) => {
      const response = await request.get(`${ADMIN_PATH}config.yml`, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toMatch(/^(?:text|application)\/(?:x-)?yaml/);
      const body = await response.text();
      expect(body).toBe(configText());
      const config = parse(body) as { backend: { name: string; repo: string; branch: string }; media_folder: string; public_folder: string };
      expect(config.backend).toMatchObject({ name: 'github', repo: 'patel24kishan/kishan-kahodariya', branch: 'master' });
      expect(config.media_folder).toBe('public/uploads');
      expect(config.public_folder).toBe('/uploads');
      // Sveltia asks for the file with a cache-busting query; that must work too.
      expect((await request.get(`${ADMIN_PATH}config.yml?_=1`)).status()).toBe(200);
    });

    test('its own scripts and stylesheet are served with the right types', async ({ request }) => {
      for (const [name, type] of [
        ['slug-guard.js', /javascript/],
        ['preview.js', /javascript/],
        ['preview-logic.js', /javascript/],
        ['preview.css', /^text\/css/],
      ] as const) {
        const response = await request.get(`${ADMIN_PATH}${name}`, { maxRedirects: 0 });
        expect(response.status(), name).toBe(200);
        expect(response.headers()['content-type'], name).toMatch(type);
        expect(await response.text(), name).toBe(readFileSync(path.join(adminDir, name), 'utf8'));
      }
    });

    test('shows the sign-in screen with a token sign-in and no configuration error', async ({ page, request }) => {
      const cdn = await cdnStatus(request);
      test.skip(!cdn.ok, cdnSkipMessage(cdn));

      const hosts = new Set<string>();
      const complaints: string[] = [];
      page.on('request', (outgoing) => {
        const url = new URL(outgoing.url());
        if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.hostname);
      });
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type()) && /config|collection|field|option|schema/i.test(message.text())) complaints.push(message.text());
      });
      page.on('pageerror', (error) => complaints.push(error.message));

      const script = page.waitForResponse((response) => response.url() === pinnedScript().src);
      await page.goto(ADMIN_PATH);
      expect((await script).status(), 'the pinned script loads').toBe(200);

      const tokenButton = page.getByRole('button', { name: TOKEN_BUTTON });
      await expect(tokenButton).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(CONFIG_ERROR), 'Sveltia accepts config.yml').toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Portfolio Admin' })).toBeVisible();
      // No OAuth server exists, so the "Sign In with GitHub" route must not be offered.
      await expect(page.getByRole('button', { name: /GitHub/i })).toHaveCount(0);
      // Both servers under test are on a local host, where Sveltia also offers its local mode.
      await expect(page.getByRole('button', { name: LOCAL_BUTTON })).toBeVisible();
      // The integrity check passed: the script ran and defined its API.
      expect(await page.evaluate(() => typeof (window as unknown as { CMS?: { registerEventListener?: unknown } }).CMS?.registerEventListener)).toBe('function');

      // The token dialog explains what is needed and links to GitHub's token page. No token is typed.
      await tokenButton.click();
      const dialog = page.getByRole('alertdialog', { name: TOKEN_BUTTON });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Personal Access Token' })).toBeVisible();
      await expect(dialog).toContainText('read/write access to the repository content');
      const link = await dialog.getByRole('link').getAttribute('href');
      expect(link).toMatch(/^https:\/\/github\.com\/settings\/personal-access-tokens\/new\?/);
      expect(new URL(link ?? '').searchParams.get('contents')).toBe('write');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);

      expect(complaints, 'Sveltia logs no complaint about the configuration').toEqual([]);
      const unexpected = [...hosts].filter((host) => !EXPECTED_HOSTS.has(host));
      expect(unexpected, 'before sign-in the page talks only to its CDNs and the GitHub status page').toEqual([]);
    });

    test('a broken config.yml is reported on the sign-in screen (so the test above can fail)', async ({ page, request }) => {
      const cdn = await cdnStatus(request);
      test.skip(!cdn.ok, cdnSkipMessage(cdn));
      await page.route('**/admin/config.yml*', (route) =>
        route.fulfill({ status: 200, contentType: 'text/yaml; charset=utf-8', body: 'backend:\n  name: github\ncollections: [unclosed\n' }),
      );
      await page.goto(ADMIN_PATH);
      await expect(page.getByText(CONFIG_ERROR)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: TOKEN_BUTTON })).toHaveCount(0);
    });

    test('a script that does not match the integrity hash is not run', async ({ page, request }) => {
      const cdn = await cdnStatus(request);
      test.skip(!cdn.ok, cdnSkipMessage(cdn));
      const tampered = htmlText().replace(/integrity="sha384-[^"]{4}/, 'integrity="sha384-AAAA');
      expect(tampered).not.toBe(htmlText());
      await page.route(/\/admin\/(?:index\.html)?$/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: tampered }));
      const loaded = page.waitForResponse((response) => response.url() === pinnedScript().src);
      await page.goto(ADMIN_PATH);
      await loaded;
      await page.waitForLoadState('load');
      expect(await page.evaluate(() => typeof (window as unknown as { CMS?: unknown }).CMS), 'the browser refused the script').toBe('undefined');
      await expect(page.getByRole('button', { name: TOKEN_BUTTON })).toHaveCount(0);
    });
  });
}
