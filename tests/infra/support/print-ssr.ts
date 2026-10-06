/**
 * Renders every route (and the hydration fixture) to HTML with the DEVELOPMENT build of
 * React, through Vite's dev pipeline, and writes the result as JSON to the file given as the
 * first argument.
 *
 * Run by ssr.ts in a child process:  tsx tests/infra/support/print-ssr.ts <output file>
 *
 * Why: the dev server normally renders in the browser only, and production React stays
 * silent about attribute-only hydration mismatches. Feeding this markup to the dev client
 * makes React's development build compare every attribute and report any difference.
 */
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import type * as ServerEntry from '../../../src/entry-server';
import type * as FixtureModule from './hydration-fixture';

const outputFile = process.argv[2];
if (!outputFile) throw new Error('usage: print-ssr.ts <output file>');

const server = await createServer({
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

// React's development build reports invalid markup (bad nesting, unknown props…) here.
const serverErrors: string[] = [];
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  serverErrors.push(args.map(String).join(' '));
};

try {
  const entry = (await server.ssrLoadModule('/src/entry-server.tsx')) as typeof ServerEntry;
  const fixture = (await server.ssrLoadModule('/tests/infra/support/hydration-fixture.tsx')) as typeof FixtureModule;

  const pages: Record<string, string> = {};
  for (const route of entry.getManifest().routes) pages[route] = entry.render(route).html;

  writeFileSync(
    outputFile,
    JSON.stringify({ pages, fixture: renderToString(createElement(fixture.Fixture)), serverErrors }),
    'utf8',
  );
} finally {
  console.error = originalConsoleError;
  await server.close();
}
