/**
 * One-time migration — `npm run migrate`.
 *
 * Reads legacy/constants.js (the old site's content), writes one JSON file per item under
 * /content (see ARCHITECTURE.md section 4) and writes docs/migration-report.md.
 *
 * SAFETY: after go-live the owner edits /content through the admin. This script therefore
 * refuses to run when the content folder already holds content files, unless --force is
 * passed. With --force it overwrites the files it generates and deletes nothing.
 *
 * Usage: tsx scripts/migrate-legacy.ts [--force] [--out <content folder>]
 *                                      [--report <markdown file>] [--legacy <constants.js>]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MigrationError, migrateLegacy } from './lib/legacy-migration';
import { formatIssues, readContentDir } from './lib/load-content';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Options {
  force: boolean;
  out: string;
  report: string;
  legacy: string;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    force: false,
    out: path.join(repoRoot, 'content'),
    report: path.join(repoRoot, 'docs', 'migration-report.md'),
    legacy: path.join(repoRoot, 'legacy', 'constants.js'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--out' || arg === '--report' || arg === '--legacy') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} needs a path`);
      options[arg === '--out' ? 'out' : arg === '--report' ? 'report' : 'legacy'] = path.resolve(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function show(file: string): string {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative.split(path.sep).join('/');
}

async function main(): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      'Usage: tsx scripts/migrate-legacy.ts [--force] [--out <content folder>] [--report <file>] [--legacy <file>]',
    );
    return 2;
  }

  if (!existsSync(options.legacy)) {
    console.error(`Legacy content file not found: ${show(options.legacy)}`);
    return 1;
  }

  // Overwrite guard: any content file at all means the folder is in use.
  const existing = existsSync(options.out) ? readContentDir(options.out).absolutePaths : [];
  if (existing.length > 0 && !options.force) {
    console.error(
      [
        `Refusing to migrate: ${show(options.out)} already holds ${existing.length} content file(s).`,
        'The content there may have been edited in the admin, and a migration would overwrite it',
        'with the old site’s values. Nothing was written.',
        '',
        'To overwrite on purpose, run:  npm run migrate -- --force',
      ].join('\n'),
    );
    return 1;
  }

  const legacyModule: unknown = await import(pathToFileURL(options.legacy).href);

  let result: ReturnType<typeof migrateLegacy>;
  try {
    // Spread into a plain object: a module namespace is not a plain object for the parser.
    result = migrateLegacy({ ...(legacyModule as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof MigrationError) {
      console.error(error.message);
      if (error.issues.length > 0) console.error(formatIssues(error.issues, show(options.out)));
      return 1;
    }
    throw error;
  }

  for (const file of result.files) {
    const target = path.join(options.out, ...file.path.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(file.data, null, 2)}\n`, 'utf8');
  }
  mkdirSync(path.dirname(options.report), { recursive: true });
  writeFileSync(options.report, result.report, 'utf8');

  const { source, migrated } = result;
  const row = (label: string, from: number, to: number): string =>
    `  ${label.padEnd(26)} ${String(from).padStart(3)} → ${String(to).padStart(3)}${from === to ? '' : '   <-- differs'}`;
  console.log(
    [
      `Migrated ${show(options.legacy)} → ${show(options.out)} (${migrated.files} files${
        existing.length > 0 ? ', existing files overwritten' : ''
      })`,
      row('projects (published)', source.projectsPublished, migrated.projectsPublished),
      row('projects (unpublished)', source.projectsUnpublished, migrated.projectsUnpublished),
      row('experience', source.experience, migrated.experience),
      row('skill groups', source.skillGroups, migrated.skillGroups),
      row('skills', source.skills, migrated.skills),
      row('education', source.education, migrated.education),
      row('certificates', source.certificates, migrated.certificates),
      row('profile links', source.links, migrated.links),
      row('resume links', source.resumeLinks, migrated.resumeLinks),
      `  tracks: ${migrated.tracks}, site settings: ${migrated.site}`,
      `Report: ${show(options.report)}`,
    ].join('\n'),
  );
  return 0;
}

process.exitCode = await main();
