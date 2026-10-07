/**
 * The admin dashboard in the production build (added by the admin agent; it lives here
 * because playwright.build.config.ts only runs tests/build/).
 *
 * dist/ is served by scripts/serve-pages.ts, which answers the way GitHub Pages does, so
 * this is the closest thing to the live address /My-Portfolio/admin/ that can be checked
 * without deploying.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DIST_DIR } from '../../src/lib/site-config';
import { adminDir, repoRoot } from '../admin/support/env';
import { defineServedPageTests } from '../admin/support/served-page';

defineServedPageTests('production build');

const DIST = path.join(repoRoot, DIST_DIR);

function htmlFiles(directory: string, relative = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) return htmlFiles(path.join(directory, entry.name), rel);
    return entry.name.endsWith('.html') ? [rel] : [];
  });
}

test.describe('the admin dashboard in dist/', () => {
  test('public/admin is copied to dist/admin byte for byte, and nothing else is added', () => {
    const source = readdirSync(adminDir).sort();
    expect(readdirSync(path.join(DIST, 'admin')).sort()).toEqual(source);
    for (const name of source) {
      expect(readFileSync(path.join(DIST, 'admin', name)).equals(readFileSync(path.join(adminDir, name))), name).toBe(true);
    }
  });

  test('no public page links to the dashboard', () => {
    const pages = htmlFiles(DIST).filter((file) => !file.startsWith('admin/'));
    expect(pages.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of pages) {
      const html = readFileSync(path.join(DIST, file), 'utf8');
      for (const match of html.matchAll(/\s(?:href|src|action|content)\s*=\s*"([^"]*)"/gi)) {
        if (/(?:^|\/)admin(?:\/|$|\?|#)/i.test(match[1] ?? '')) offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the app bundle does not mention the dashboard address', () => {
    const assets = path.join(DIST, 'assets');
    expect(existsSync(assets)).toBe(true);
    const hits = readdirSync(assets)
      .filter((name) => /\.(?:js|css)$/.test(name))
      .filter((name) => /["'`/]admin\/?["'`]/.test(readFileSync(path.join(assets, name), 'utf8')));
    expect(hits).toEqual([]);
  });

  test('the build that produced dist/ checks the dashboard config first', () => {
    const scripts = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    const steps = (scripts.build ?? '').split('&&').map((step) => step.trim());
    expect(steps.indexOf('npm run validate:cms')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('npm run validate:cms')).toBeLessThan(steps.indexOf('vite build'));
  });
});
