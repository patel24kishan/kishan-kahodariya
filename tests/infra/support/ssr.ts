/**
 * Server-rendered markup for every route, produced with React's development build
 * (see print-ssr.ts). Loaded synchronously, once per test run: the first process writes the
 * result to a temp file and passes its path to the Playwright workers through an
 * environment variable. (The markup is too large for the variable itself.)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DevSsr {
  /** route → markup that belongs inside #root. */
  pages: Record<string, string>;
  /** Markup of the hydration fixture (tests/infra/support/hydration-fixture.tsx). */
  fixture: string;
  /** Anything React logged with console.error while rendering on the server. */
  serverErrors: string[];
}

const CACHE = 'KK_DEV_SSR_FILE';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function load(): DevSsr {
  let file = process.env[CACHE];
  if (!file || !existsSync(file)) {
    const folder = mkdtempSync(path.join(tmpdir(), 'kk-dev-ssr-'));
    file = path.join(folder, 'ssr.json');
    // The process that created the folder is the test runner itself; it outlives its workers.
    process.on('exit', () => rmSync(folder, { recursive: true, force: true }));
    try {
      execFileSync(
        process.execPath,
        [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), path.join(ROOT, 'tests/infra/support/print-ssr.ts'), file],
        {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120_000,
          env: { ...process.env, NODE_ENV: 'development' },
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not render the routes on the server (development build).\n${detail}`);
    }
    process.env[CACHE] = file;
  }
  return JSON.parse(readFileSync(file, 'utf8')) as DevSsr;
}

export const devSsr: DevSsr = load();
