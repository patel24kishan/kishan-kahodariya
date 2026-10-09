/**
 * Shared ground for the admin specs: where things are, temp folders, running the project's
 * scripts the way `npm run …` does.
 *
 * Everything written to disk goes to the operating system's temp folder — never to the real
 * /content, public/ or dist/, and not to test-results/ (another Playwright run empties it).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const adminDir = path.join(repoRoot, 'public', 'admin');
export const configPath = path.join(adminDir, 'config.yml');
export const htmlPath = path.join(adminDir, 'index.html');
export const deployPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
export const contentDir = path.join(repoRoot, 'content');

export const configText = (): string => readFileSync(configPath, 'utf8');
export const htmlText = (): string => readFileSync(htmlPath, 'utf8');

/** The one script the admin page loads from another site, as written in index.html. */
export function pinnedScript(html = htmlText()): { src: string; version: string; integrity: string } {
  const tag = /<script\b[^>]*\ssrc\s*=\s*"(https:\/\/[^"]+)"[^>]*>/i.exec(html.replace(/<!--[\s\S]*?-->/g, ''));
  const src = tag?.[1] ?? '';
  return {
    src,
    version: /@sveltia\/cms@([^/]+)\//.exec(src)?.[1] ?? '',
    integrity: /\sintegrity\s*=\s*"([^"]+)"/i.exec(tag?.[0] ?? '')?.[1] ?? '',
  };
}

// ---------------------------------------------------------------------------------------
// Temp folders
// ---------------------------------------------------------------------------------------

const tempDirs: string[] = [];

export function makeTempDir(label: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `kk-admin-${label}-`));
  tempDirs.push(dir);
  return dir;
}

/** Call from test.afterAll. */
export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // The OS temp folder is cleaned later.
    }
  }
}

/** Writes { "relative/path": text } under `dir`. */
export function writeTree(dir: string, files: Readonly<Record<string, string>>): void {
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(dir, ...relative.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  }
}

/** Every file under `dir` as { "relative/path": text }, with forward slashes. */
export function readTree(dir: string, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string, relative: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(current, entry.name), rel);
      else out[rel] = readFileSync(path.join(current, entry.name), 'utf8');
    }
  };
  walk(dir, prefix);
  return out;
}

/** The real content as { "content/site.json": text, … } — the paths the dashboard uses. */
export function contentTree(): Record<string, string> {
  return readTree(contentDir, 'content');
}

/** A temp copy of the admin folder, the deploy workflow and the content, for the validator. */
export function copyProjectInputs(label: string): { dir: string; config: string; html: string; deploy: string; content: string } {
  const dir = makeTempDir(label);
  cpSync(adminDir, path.join(dir, 'admin'), { recursive: true });
  cpSync(contentDir, path.join(dir, 'content'), { recursive: true });
  cpSync(deployPath, path.join(dir, 'deploy.yml'));
  return {
    dir,
    config: path.join(dir, 'admin', 'config.yml'),
    html: path.join(dir, 'admin', 'index.html'),
    deploy: path.join(dir, 'deploy.yml'),
    content: path.join(dir, 'content'),
  };
}

// ---------------------------------------------------------------------------------------
// Running the project's scripts
// ---------------------------------------------------------------------------------------

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout and stderr together. */
  output: string;
}

/** Runs a TypeScript script the way the npm scripts do (tsx). */
export function runScript(script: string, args: readonly string[] = []): RunResult {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    // Never inherit GITHUB_ACTIONS: the scripts would add annotation lines to their output.
    env: { ...process.env, GITHUB_ACTIONS: '' },
    timeout: 110_000,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, output: `${stdout}\n${stderr}` };
}

export const validateCms = (args: readonly string[] = []): RunResult => runScript('scripts/validate-cms-config.ts', args);
export const validateContent = (dir: string): RunResult => runScript('scripts/validate-content.ts', ['--dir', dir]);

// ---------------------------------------------------------------------------------------
// The "NOTE — N content files were tidied" part of the content check
// ---------------------------------------------------------------------------------------

/**
 * The tidied values a content check printed, one string per value: "projects/x.json | field:
 * what was done". The path is cut at the content folder, so two runs on different copies can
 * be compared.
 */
export function tidiedValues(stdout: string): string[] {
  const lines = stdout.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('NOTE —'));
  if (start < 0) return [];
  const found: string[] = [];
  let file = '';
  for (const line of lines.slice(start + 1)) {
    const fileMatch = /^ {2}\S.*?((?:(?:projects|experience|skills|links|education|certificates|tracks)[\\/][^\\/]+|site)\.json)\s*$/.exec(line);
    if (fileMatch) file = (fileMatch[1] ?? '').replace(/\\/g, '/');
    else if (/^ {4}\S/.test(line) && file) found.push(`${file} | ${line.trim()}`);
  }
  return found;
}

let baseline: string[] | undefined;

/** What the owner's real content already has tidied today (for example blank screenshot rows). */
export function realContentTidiedValues(): string[] {
  baseline ??= tidiedValues(validateContent(contentDir).stdout);
  return baseline;
}

/**
 * Fails when the content check tidied anything that the real content does not already have
 * tidied: the dashboard wrote every key, so the reader had nothing of its own to fill in.
 * The owner's own files may carry tidied values; their count must not matter to the test.
 */
export function expectNoNewNotes(stdout: string, message = 'the reader filled in nothing'): void {
  const known = realContentTidiedValues();
  const extra = tidiedValues(stdout).filter((value) => !known.includes(value));
  if (extra.length > 0) {
    throw new Error(`${message}\nThe content check tidied values that the real content does not already have tidied:\n  ${extra.join('\n  ')}`);
  }
}

/** Replaces one exact piece of text, and fails loudly when it is not there exactly once. */
export function replaceOnce(text: string, find: string, replacement: string): string {
  const parts = text.split(find);
  if (parts.length !== 2) {
    throw new Error(`Expected exactly one occurrence of ${JSON.stringify(find.slice(0, 80))}, found ${parts.length - 1}`);
  }
  return parts.join(replacement);
}
