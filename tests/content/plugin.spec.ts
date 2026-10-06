/**
 * The Vite plugin behind "virtual:content" (scripts/lib/content-plugin.ts): client build,
 * SSR build, dev server, validation failures, and — the point of it — unpublished items
 * never reaching a bundle.
 *
 * Builds go to the operating system's temp folder, never to dist/.
 */
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { build, createServer, type InlineConfig } from 'vite';
import { contentPlugin } from '../../scripts/lib/content-plugin';
import { loadContent, publishedOnly } from '../../scripts/lib/load-content';
import { createContentApi } from '../../src/content/selectors';
import type { ContentSnapshot } from './fixtures/entry';
import {
  PUBLISHED_TITLE,
  UNPUBLISHED_MARKER,
  fixtureBundle,
  fixtureFiles,
  freePort,
  makeProject,
  makeTempDir,
  readTree,
  realContentDir,
  removeTempDirs,
  repoRoot,
  runVite,
  writeContentDir,
  writeJson,
} from './helpers';

const ENTRY = path.join(repoRoot, 'tests', 'content', 'fixtures', 'entry.ts');
const NO_CONTENT_ENTRY = path.join(repoRoot, 'tests', 'content', 'fixtures', 'no-content-entry.ts');
const ENTRY_URL = '/tests/content/fixtures/entry.ts';

/** Strings that only exist in zod's runtime. None of them may appear in a client bundle. */
const ZOD_MARKERS = ['ZodError', 'invalid_type', 'unrecognized_keys', 'safeParse'];

test.describe.configure({ timeout: 120_000 });
test.afterAll(removeTempDirs);

/** A temp content folder holding the fixture content. */
function fixtureContentDir(label: string): string {
  const dir = makeTempDir(label);
  writeContentDir(dir, fixtureFiles());
  return dir;
}

/** Vite config for the fixture builds / servers: only the content plugin, no project config. */
function fixtureConfig(contentDir: string): InlineConfig {
  return {
    configFile: false,
    root: repoRoot,
    logLevel: 'silent',
    publicDir: false,
    // Keep Vite's dependency cache out of node_modules/.vite, which the other dev servers use.
    cacheDir: makeTempDir('vite-cache'),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [contentPlugin({ contentDir })],
  };
}

function allText(dir: string): string {
  return [...readTree(dir).entries()].map(([name, text]) => `/* ${name} */\n${text}`).join('\n');
}

async function buildClient(contentDir: string, entry = ENTRY): Promise<string> {
  const outDir = makeTempDir('client-out');
  await build({
    ...fixtureConfig(contentDir),
    build: { outDir, emptyOutDir: true, copyPublicDir: false, lib: { entry, formats: ['es'], fileName: 'fixture' } },
  });
  return outDir;
}

async function buildSsr(contentDir: string): Promise<string> {
  const outDir = makeTempDir('ssr-out');
  await build({
    ...fixtureConfig(contentDir),
    build: { outDir, emptyOutDir: true, copyPublicDir: false, ssr: ENTRY },
  });
  return outDir;
}

const expectedSnapshot: ContentSnapshot = {
  siteName: 'Fixture Person',
  tracks: ['game', 'softdev'],
  tabs: ['unreal', 'unity', 'webapps', 'all'],
  routes: [
    '/',
    '/gamedev',
    '/gamedev/unreal',
    '/gamedev/unity',
    '/gamedev/webapps',
    '/gamedev/all',
    '/softdev',
    '/softdev/unreal',
    '/softdev/unity',
    '/softdev/webapps',
    '/softdev/all',
  ],
  defaultTabs: ['unity', 'webapps'],
  gameAll: [PUBLISHED_TITLE, 'Beta Web App'],
  softdevAll: ['Beta Web App', PUBLISHED_TITLE],
  hoverTexts: ['View Screenshots', 'View Screenshots'],
  experience: ['Acme Games'],
  skills: ['Game Dev'],
  heroLinks: ['GitHub'],
  footerLinks: ['GitHub'],
  education: ['Example University'],
  certificates: ['Example Certificate'],
};

test.describe('content plugin — client build', () => {
  test('the bundle holds the published content, no unpublished item and no zod', async () => {
    const outDir = await buildClient(fixtureContentDir('client'));
    const output = allText(outDir);
    expect(output.length).toBeGreaterThan(500);

    // Published content is really in there, so the checks below are not vacuous.
    expect(output).toContain(PUBLISHED_TITLE);
    expect(output).toContain('Beta Web App');
    expect(output).toContain('Acme Games');

    // The fixture has one unpublished item in every collection, each carrying the marker.
    expect(JSON.stringify(fixtureBundle()).split(UNPUBLISHED_MARKER).length - 1).toBe(6);
    expect(output).not.toContain(UNPUBLISHED_MARKER);
    for (const slug of ['hidden-draft', 'hidden-job', 'hidden-skills', 'hidden-link', 'hidden-school', 'hidden-cert']) {
      expect(output, slug).not.toContain(slug);
    }
    for (const marker of ZOD_MARKERS) expect(output, marker).not.toContain(marker);
  });

  test('invalid content fails the build with the file, the field and the reason', async () => {
    const contentDir = fixtureContentDir('client-invalid');
    writeJson(contentDir, 'projects/alpha.json', makeProject({ hoverText: 'one two three four five', category: 'nope' }));
    rmSync(path.join(contentDir, 'tracks', 'softdev.json'));

    const error = await buildClient(contentDir).then(
      () => undefined,
      (reason: unknown) => (reason instanceof Error ? reason : new Error(String(reason))),
    );
    expect(error, 'the build should have failed').toBeDefined();
    const message = error?.message ?? '';
    expect(message).toContain('Content check failed — 3 problems');
    expect(message).toMatch(/projects\/alpha\.json\s+field:\s+hoverText\s+problem:\s+must be at most 4 words \(it has 5\)/);
    expect(message).toMatch(/projects\/alpha\.json\s+field:\s+category\s+problem:\s+"nope" is not a category id/);
    expect(message).toMatch(/tracks\/softdev\.json\s+field:\s+\(file\)\s+problem:\s+this file is required/);
  });

  test('invalid content fails the build even when nothing imports the content', async () => {
    const contentDir = fixtureContentDir('client-invalid-unused');
    writeJson(contentDir, 'links/github.json', { slug: 'github' });
    await expect(buildClient(contentDir, NO_CONTENT_ENTRY)).rejects.toThrow(
      /Content check failed[\s\S]*links\/github\.json\s+field:\s+label\s+problem:\s+is required/,
    );
    // …and the same entry builds when the content is valid.
    const outDir = await buildClient(fixtureContentDir('client-valid-unused'), NO_CONTENT_ENTRY);
    expect(allText(outDir)).toContain('42');
  });
});

test.describe('content plugin — SSR build', () => {
  test('the server bundle runs in plain Node and returns the published content', async () => {
    const outDir = await buildSsr(fixtureContentDir('ssr'));
    const files = [...readTree(outDir).keys()].filter((name) => /\.m?js$/.test(name));
    expect(files).toHaveLength(1);
    const file = path.join(outDir, files[0] ?? '');
    const output = readFileSync(file, 'utf8');

    expect(output).toContain(PUBLISHED_TITLE);
    expect(output).not.toContain(UNPUBLISHED_MARKER);
    // The server bundle does not pull in zod either (bundled or as an import).
    expect(output).not.toMatch(/from\s*["']zod/);
    for (const marker of ZOD_MARKERS) expect(output, marker).not.toContain(marker);

    const module = (await import(pathToFileURL(file).href)) as { snapshot: () => ContentSnapshot };
    expect(module.snapshot()).toEqual(expectedSnapshot);
  });

  test('incomplete files are tidied, not rejected: defaults, dropped blanks, no publish flag means hidden', async () => {
    const contentDir = fixtureContentDir('ssr-tidied');
    // Only identity fields plus what the test needs: the reader fills in the rest.
    writeJson(contentDir, 'projects/sparse.json', {
      slug: 'sparse',
      title: 'Sparse But Published',
      category: 'unity',
      published: true,
      tags: ['Kept Tag', '', '   '],
      links: [{ label: '', url: '' }],
    });
    // No `published` key at all: must be treated as not published.
    writeJson(contentDir, 'projects/no-flag.json', {
      slug: 'no-flag',
      title: `No Publish Flag ${UNPUBLISHED_MARKER}`,
      category: 'unity',
    });
    // A published link without an address: valid content, but never handed to a renderer.
    writeJson(contentDir, 'links/dead-button.json', {
      slug: 'dead-button',
      label: 'Dead Button Label',
      showInHero: true,
      showInFooter: true,
      published: true,
    });

    const outDir = await buildSsr(contentDir);
    const files = [...readTree(outDir).keys()].filter((name) => /\.m?js$/.test(name));
    const file = path.join(outDir, files[0] ?? '');
    const output = readFileSync(file, 'utf8');
    expect(output).toContain('Sparse But Published');
    expect(output).toContain('Kept Tag');
    expect(output).not.toContain(UNPUBLISHED_MARKER);

    const module = (await import(pathToFileURL(file).href)) as { snapshot: () => ContentSnapshot };
    const snapshot = module.snapshot();
    // Order 0 (the default) sorts the sparse project first; audience defaults to "both".
    expect(snapshot.gameAll).toEqual(['Sparse But Published', PUBLISHED_TITLE, 'Beta Web App']);
    expect(snapshot.softdevAll).toEqual(['Sparse But Published', 'Beta Web App', PUBLISHED_TITLE]);
    expect(snapshot.hoverTexts[0]).toBe('View Screenshots');
    expect(snapshot.heroLinks).toEqual(['GitHub']);
    expect(snapshot.footerLinks).toEqual(['GitHub']);
  });
});

test.describe('content plugin — the real project build', () => {
  test('`vite build --outDir <temp>`: no unpublished item and no zod in the output', () => {
    const outDir = makeTempDir('real-build');
    const result = runVite(['build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn']);
    expect(result.status, result.output).toBe(0);

    const output = allText(outDir);
    expect(output.length).toBeGreaterThan(1000);
    for (const marker of ZOD_MARKERS) expect(output, marker).not.toContain(marker);

    const loaded = loadContent(realContentDir);
    expect(loaded.ok, JSON.stringify(loaded.issues, null, 2)).toBe(true);
    if (!loaded.ok) return;
    const publishedText = JSON.stringify(publishedOnly(loaded.content));

    const hidden = [
      ...loaded.content.projects,
      ...loaded.content.experience,
      ...loaded.content.skills,
      ...loaded.content.links,
      ...loaded.content.education,
      ...loaded.content.certificates,
    ].filter((item) => !item.published);

    // Every text of an unpublished item that does not also belong to a published one.
    const collect = (value: unknown, into: Set<string>): void => {
      if (typeof value === 'string') {
        if (value.length >= 8 && !publishedText.includes(JSON.stringify(value).slice(1, -1))) into.add(value);
      } else if (Array.isArray(value)) {
        for (const entry of value) collect(entry, into);
      } else if (value !== null && typeof value === 'object') {
        for (const entry of Object.values(value)) collect(entry, into);
      }
    };
    const secrets = new Set<string>();
    for (const item of hidden) collect(item, secrets);

    for (const secret of secrets) {
      expect(output.includes(secret), `the build output contains unpublished text: ${secret}`).toBe(false);
      expect(output.includes(JSON.stringify(secret).slice(1, -1)), `unpublished text (escaped): ${secret}`).toBe(false);
    }
    for (const project of loaded.content.projects.filter((item) => !item.published)) {
      // The unpublished project's title must be among the texts that were searched for.
      if (!publishedText.includes(project.title)) expect([...secrets]).toContain(project.title);
    }
    test.info().annotations.push({
      type: 'unpublished items checked',
      description: `${hidden.length} item(s), ${secrets.size} distinct text(s): ${hidden.map((item) => item.slug).join(', ') || 'none'}`,
    });
  });
});

test.describe('content plugin — dev server', () => {
  test('SSR: a module loaded through the dev server sees a changed content file', async () => {
    const contentDir = fixtureContentDir('dev-ssr');
    const server = await createServer({
      ...fixtureConfig(contentDir),
      appType: 'custom',
      server: { middlewareMode: true, ws: false },
    });
    try {
      const load = async (): Promise<ContentSnapshot> => {
        const module = (await server.ssrLoadModule(ENTRY_URL)) as { snapshot: () => ContentSnapshot };
        return module.snapshot();
      };
      expect(await load()).toEqual(expectedSnapshot);

      writeJson(contentDir, 'projects/alpha.json', makeProject({ title: 'Alpha Renamed On Disk' }));
      await expect.poll(async () => (await load()).gameAll, { timeout: 30_000 }).toEqual(['Alpha Renamed On Disk', 'Beta Web App']);

      // Publishing a draft makes it appear; it sorts first because its order is 5.
      const draft = fixtureBundle().projects.find((project) => project.slug === 'hidden-draft');
      if (!draft) throw new Error('fixture draft missing');
      writeJson(contentDir, 'projects/hidden-draft.json', { ...draft, title: 'Draft Now Published', published: true });
      await expect
        .poll(async () => (await load()).gameAll, { timeout: 30_000 })
        .toEqual(['Draft Now Published', 'Alpha Renamed On Disk', 'Beta Web App']);
    } finally {
      await server.close();
    }
  });

  test('SSR: invalid content is reported when the module loads, and loads again once fixed', async () => {
    const contentDir = fixtureContentDir('dev-ssr-invalid');
    writeJson(contentDir, 'projects/alpha.json', makeProject({ videoUrl: 'not a url' }));
    const server = await createServer({
      ...fixtureConfig(contentDir),
      appType: 'custom',
      server: { middlewareMode: true, ws: false },
    });
    try {
      await expect(server.ssrLoadModule(ENTRY_URL)).rejects.toThrow(/Content check failed[\s\S]*projects\/alpha\.json[\s\S]*videoUrl/);
      writeJson(contentDir, 'projects/alpha.json', makeProject());
      await expect
        .poll(
          async () => {
            try {
              const module = (await server.ssrLoadModule(ENTRY_URL)) as { snapshot: () => ContentSnapshot };
              return module.snapshot().gameAll;
            } catch {
              return 'still failing';
            }
          },
          { timeout: 30_000 },
        )
        .toEqual(expectedSnapshot.gameAll);
    } finally {
      await server.close();
    }
  });

  test('browser: the page reloads with the new content when a file changes, is added or is removed', async ({ page }) => {
    const contentDir = fixtureContentDir('dev-browser');
    const port = await freePort();
    const server = await createServer({
      ...fixtureConfig(contentDir),
      appType: 'custom',
      server: { host: '127.0.0.1', port, strictPort: true },
    });
    // A minimal page: Vite's client (for reloads and the error overlay) plus the fixture entry.
    server.middlewares.use('/__content-fixture', (_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>content fixture</title>' +
          '<script type="module" src="/@vite/client"></script></head>' +
          `<body><pre id="content-snapshot"></pre><script type="module" src="${ENTRY_URL}"></script></body></html>`,
      );
    });
    await server.listen();
    try {
      // Everything the browser downloads while the page loads.
      const downloaded: Promise<string>[] = [];
      page.on('response', (response) => {
        if (response.url().startsWith(`http://127.0.0.1:${port}/`) && response.status() === 200) {
          downloaded.push(response.text().catch(() => ''));
        }
      });

      await page.goto(`http://127.0.0.1:${port}/__content-fixture`);
      const shown = page.locator('#content-snapshot');
      await expect(shown).toContainText(PUBLISHED_TITLE);
      await expect(shown).not.toContainText(UNPUBLISHED_MARKER);
      expect(JSON.parse((await shown.textContent()) ?? '{}')).toEqual(expectedSnapshot);

      // What the browser received holds the published content, no unpublished item, no zod.
      const received = (await Promise.all(downloaded)).join('\n');
      expect(received).toContain(PUBLISHED_TITLE);
      expect(received).not.toContain(UNPUBLISHED_MARKER);
      for (const marker of ZOD_MARKERS) expect(received, marker).not.toContain(marker);

      // Change a file.
      writeJson(contentDir, 'projects/alpha.json', makeProject({ title: 'Alpha Renamed Live' }));
      await expect(shown).toContainText('Alpha Renamed Live', { timeout: 30_000 });

      // Add a file.
      writeJson(contentDir, 'projects/gamma.json', makeProject({ slug: 'gamma', title: 'Gamma Added Live', orderGame: 30 }));
      await expect(shown).toContainText('Gamma Added Live', { timeout: 30_000 });

      // Remove it again.
      rmSync(path.join(contentDir, 'projects', 'gamma.json'));
      await expect(shown).not.toContainText('Gamma Added Live', { timeout: 30_000 });
      await expect(shown).toContainText('Alpha Renamed Live');

      // Break a file: the problem is shown instead of a silently broken page.
      writeJson(contentDir, 'projects/alpha.json', makeProject({ hoverText: 'one two three four five' }));
      const overlay = page.locator('vite-error-overlay');
      await expect(overlay).toContainText('Content check failed', { timeout: 30_000 });
      await expect(overlay).toContainText('hoverText');

      // Fix it: the page comes back by itself.
      writeJson(contentDir, 'projects/alpha.json', makeProject({ title: 'Alpha Fixed Live' }));
      await expect(shown).toContainText('Alpha Fixed Live', { timeout: 30_000 });
      await expect(overlay).toHaveCount(0);
    } finally {
      await server.close();
    }
  });

  test('the project dev server serves the real content through @/content', async ({ page, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is not configured');
    const response = await page.goto('./');
    expect(response?.ok()).toBe(true);

    const moduleUrl = new URL('src/content/index.ts', baseURL).href;
    const inBrowser = await page.evaluate(async (url) => {
      const api = (await import(url)) as typeof import('../../src/content/index');
      return {
        siteName: api.getSite().name,
        tabs: api.getTabs(),
        routes: api.getAllRoutes(),
        gameAll: api.getProjects('game', 'all').map((project) => project.slug),
        softdevAll: api.getProjects('softdev', 'all').map((project) => project.slug),
        experience: api.getExperience('softdev').map((entry) => [entry.slug, entry.resolvedBullets.length]),
        skills: api.getSkillGroups('softdev').map((group) => group.slug),
        heroLinks: api.getLinks('game', 'hero').map((link) => link.slug),
        footerLinks: api.getLinks('softdev', 'footer').map((link) => link.slug),
        education: api.getEducation().map((entry) => entry.slug),
        certificates: api.getCertificates('softdev').map((certificate) => certificate.slug),
      };
    }, moduleUrl);

    // The same API over the files on disk, computed here in Node.
    const loaded = loadContent(realContentDir);
    expect(loaded.ok, JSON.stringify(loaded.issues, null, 2)).toBe(true);
    if (!loaded.ok) return;
    const api = createContentApi(publishedOnly(loaded.content));
    expect(inBrowser).toEqual({
      siteName: api.getSite().name,
      tabs: api.getTabs(),
      routes: api.getAllRoutes(),
      gameAll: api.getProjects('game', 'all').map((project) => project.slug),
      softdevAll: api.getProjects('softdev', 'all').map((project) => project.slug),
      experience: api.getExperience('softdev').map((entry) => [entry.slug, entry.resolvedBullets.length]),
      skills: api.getSkillGroups('softdev').map((group) => group.slug),
      heroLinks: api.getLinks('game', 'hero').map((link) => link.slug),
      footerLinks: api.getLinks('softdev', 'footer').map((link) => link.slug),
      education: api.getEducation().map((entry) => entry.slug),
      certificates: api.getCertificates('softdev').map((certificate) => certificate.slug),
    });

    const unpublished = loaded.content.projects.filter((project) => !project.published).map((project) => project.slug);
    for (const slug of unpublished) {
      expect(inBrowser.gameAll).not.toContain(slug);
      expect(inBrowser.softdevAll).not.toContain(slug);
    }
  });
});
