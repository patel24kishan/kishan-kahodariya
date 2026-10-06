import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { DIST_DIR } from '../../src/lib/site-config';
import { siteMap } from '../infra/support/site-map';

/**
 * The files in dist/ themselves: what the prerenderer must have written, and what must
 * never be published (source maps, .env content, secrets, dev-only code).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, DIST_DIR);
const TEXT_FILE = /\.(?:html?|js|mjs|css|json|txt|xml|svg|map|ya?ml|webmanifest|md)$/i;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const inDist = (file: string): string => path.relative(DIST, file).split(path.sep).join('/');
const allFiles = (): string[] => walk(DIST);
const textFiles = (): Array<{ name: string; text: string }> =>
  allFiles()
    .filter((file) => TEXT_FILE.test(file))
    .map((file) => ({ name: inDist(file), text: readFileSync(file, 'utf8') }));

test.describe('prerender output', () => {
  test('every route is written as <route>.html and <route>/index.html, identical', () => {
    for (const route of siteMap.routes) {
      if (route === '/') {
        expect(existsSync(path.join(DIST, 'index.html')), 'index.html').toBe(true);
        continue;
      }
      const flat = path.join(DIST, `${route.slice(1)}.html`);
      const folder = path.join(DIST, route.slice(1), 'index.html');
      expect(existsSync(flat), `${route}.html`).toBe(true);
      expect(existsSync(folder), `${route}/index.html`).toBe(true);
      expect(readFileSync(folder, 'utf8'), route).toBe(readFileSync(flat, 'utf8'));
    }
  });

  test('no HTML page is left over from another build', () => {
    const expected = new Set<string>(['index.html', '404.html', 'game.html', 'game/index.html']);
    for (const route of siteMap.routes) {
      if (route === '/') continue;
      expected.add(`${route.slice(1)}.html`);
      expected.add(`${route.slice(1)}/index.html`);
    }
    // The admin dashboard (public/admin/) is a static page of its own, not a route.
    const pages = allFiles()
      .map(inDist)
      .filter((file) => file.endsWith('.html') && !file.startsWith('admin/'));
    expect(pages.sort()).toEqual([...expected].sort());
  });

  test('404.html, .nojekyll and robots.txt are in place', () => {
    expect(statSync(path.join(DIST, '404.html')).size).toBeGreaterThan(500);
    expect(existsSync(path.join(DIST, '.nojekyll'))).toBe(true);

    const robots = readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent:\s*\*$/m);
    // Crawlers read paths from the host root, so the admin path carries the base.
    expect(robots).toMatch(new RegExp(`^Disallow:\\s*${siteMap.base}admin/$`, 'm'));
    // …and nothing blocks the site itself.
    const blocked = Array.from(robots.matchAll(/^Disallow:[ \t]*(\S*)[ \t]*$/gm), (match) => match[1]);
    expect(blocked).not.toContain('/');
    expect(blocked).not.toContain(siteMap.base);
  });

  test('the server bundle is cleaned up and never published', () => {
    expect(existsSync(path.join(ROOT, 'dist-server')), 'dist-server/ is removed after prerendering').toBe(false);
    expect(allFiles().map(inDist).filter((file) => /entry-server/.test(file))).toEqual([]);
  });
});

test.describe('nothing private is published', () => {
  test('no source maps', () => {
    expect(allFiles().map(inDist).filter((file) => file.endsWith('.map'))).toEqual([]);
    const pointing = textFiles().filter(({ name, text }) => /\.(?:js|mjs|css)$/.test(name) && /[#@]\s*sourceMappingURL=/.test(text));
    expect(pointing.map(({ name }) => name)).toEqual([]);
  });

  test('no .env files and none of their values', () => {
    const published = allFiles()
      .map(inDist)
      .filter((file) => /(^|\/)\.env(\..*)?$/.test(file));
    expect(published).toEqual([]);

    // Values from any local .env file must not appear anywhere in the build. (Only the
    // variable names are ever reported, never the values.)
    const leaks: string[] = [];
    const sources = textFiles();
    for (const entry of readdirSync(ROOT)) {
      if (!/^\.env(\..*)?$/.test(entry) || !statSync(path.join(ROOT, entry)).isFile()) continue;
      for (const line of readFileSync(path.join(ROOT, entry), 'utf8').split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        const value = (match[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
        if (value.length < 8) continue;
        for (const { name, text } of sources) {
          if (text.includes(value)) leaks.push(`${entry}: ${match[1]} appears in ${name}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  test('no tokens, keys or credentials', () => {
    const patterns: Array<[string, RegExp]> = [
      ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
      ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
      ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
      ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
      ['API secret key', /\bsk-[A-Za-z0-9_-]{24,}\b/],
      ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
      ['inline credentials in a URL', /\bhttps?:\/\/[^\s/:@"']+:[^\s/@"']+@/],
    ];
    const hits: string[] = [];
    for (const { name, text } of textFiles()) {
      for (const [label, pattern] of patterns) {
        if (pattern.test(text)) hits.push(`${label} in ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test('no dev-only code: the component kit and the test hook are not in the bundle', () => {
    const hits = textFiles()
      .filter(({ text }) => text.includes('__kit') || text.includes('__kkNavigate'))
      .map(({ name }) => name);
    expect(hits).toEqual([]);
    expect(allFiles().map(inDist).filter((file) => /(^|\/)Kit[-.]/.test(file))).toEqual([]);
  });

  test('no page points at a local address', () => {
    const hits = textFiles()
      .filter(({ name, text }) => name.endsWith('.html') && /\b(?:localhost|127\.0\.0\.1)\b/.test(text))
      .map(({ name }) => name);
    expect(hits).toEqual([]);
  });
});
