/**
 * Node side of the content pipeline: read /content from disk, validate it with the schema,
 * and strip unpublished items. Shared by the validation script, the Vite plugin, the
 * migration and the tests.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ContentBundle } from '../../src/content/bundle';
import {
  validateContent,
  type ContentIssue,
  type ContentNote,
  type RawContentFile,
} from '../../src/content/schema';

export interface ReadContentResult {
  /** Every *.json file that parsed, with its path relative to the content folder. */
  files: RawContentFile[];
  /** Files that exist but are not valid JSON (and a missing content folder). */
  issues: ContentIssue[];
  /** Relative paths of the files that could not be parsed. */
  unreadable: string[];
  /** Absolute paths of every JSON file found (for watch lists). */
  absolutePaths: string[];
}

/**
 * `notes` lists what was tidied while reading (a default filled in, a blank row dropped).
 * Notes never make the result fail.
 */
export type LoadContentResult =
  | { ok: true; content: ContentBundle; issues: []; notes: ContentNote[]; absolutePaths: string[] }
  | { ok: false; issues: ContentIssue[]; notes: ContentNote[]; absolutePaths: string[] };

const BYTE_ORDER_MARK = 0xfeff;

function walkJsonFiles(dir: string, relative: string, out: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) walkJsonFiles(path.join(dir, entry.name), rel, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) out.push(rel);
  }
}

/** Reads every JSON file under `contentDir`. Other files (.gitkeep, notes) are ignored. */
export function readContentDir(contentDir: string): ReadContentResult {
  const result: ReadContentResult = { files: [], issues: [], unreadable: [], absolutePaths: [] };

  if (!existsSync(contentDir) || !statSync(contentDir).isDirectory()) {
    result.issues.push({
      file: '(content folder)',
      field: '(file)',
      message: `the content folder was not found at ${contentDir}`,
    });
    return result;
  }

  const relativePaths: string[] = [];
  walkJsonFiles(contentDir, '', relativePaths);

  for (const rel of relativePaths) {
    const absolute = path.join(contentDir, ...rel.split('/'));
    result.absolutePaths.push(absolute);
    try {
      const text = readFileSync(absolute, 'utf8');
      const data: unknown = JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text);
      result.files.push({ path: rel, data });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.unreadable.push(rel);
      result.issues.push({ file: rel, field: '(file)', message: `is not valid JSON: ${reason}` });
    }
  }
  return result;
}

/**
 * Reads and validates a content folder. `content` is tidied (defaults filled in, blank rows
 * dropped — see src/content/schema.ts) and still includes unpublished items.
 */
export function loadContent(contentDir: string): LoadContentResult {
  const read = readContentDir(contentDir);
  if (read.files.length === 0 && read.unreadable.length === 0 && read.issues.length > 0) {
    return { ok: false, issues: read.issues, notes: [], absolutePaths: read.absolutePaths };
  }
  const validation = validateContent(read.files, { unreadable: read.unreadable });
  const issues = [...read.issues, ...(validation.ok ? [] : validation.issues)];
  if (validation.ok && issues.length === 0) {
    return {
      ok: true,
      content: validation.content,
      issues: [],
      notes: validation.notes,
      absolutePaths: read.absolutePaths,
    };
  }
  return { ok: false, issues, notes: validation.notes, absolutePaths: read.absolutePaths };
}

/**
 * The bundle that is allowed to leave the build machine: every item with
 * `published: false` is removed, so drafts never reach the client bundle or the HTML.
 */
export function publishedOnly(content: ContentBundle): ContentBundle {
  const live = <T extends { published: boolean }>(items: readonly T[]): T[] =>
    items.filter((item) => item.published);
  return {
    site: content.site,
    tracks: [...content.tracks],
    projects: live(content.projects),
    experience: live(content.experience),
    skills: live(content.skills),
    links: live(content.links),
    education: live(content.education),
    certificates: live(content.certificates),
  };
}

/** Human-readable list of problems: one block per problem with file, field and reason. */
export function formatIssues(issues: readonly ContentIssue[], contentLabel = 'content'): string {
  const count = issues.length === 1 ? '1 problem' : `${issues.length} problems`;
  const blocks = issues.map(
    (issue) =>
      `  ${issue.file.startsWith('(') ? issue.file : `${contentLabel}/${issue.file}`}\n` +
      `    field:   ${issue.field}\n` +
      `    problem: ${issue.message}`,
  );
  return `Content check failed — ${count}:\n\n${blocks.join('\n\n')}\n`;
}

/**
 * Human-readable list of what was tidied while reading, grouped by file. Informational only:
 * nothing in it blocks a deploy. Returns "" when there is nothing to report.
 */
export function formatNotes(notes: readonly ContentNote[], contentLabel = 'content'): string {
  if (notes.length === 0) return '';
  const byFile = new Map<string, ContentNote[]>();
  for (const note of notes) {
    const list = byFile.get(note.file);
    if (list) list.push(note);
    else byFile.set(note.file, [note]);
  }
  const files = byFile.size === 1 ? '1 content file was' : `${byFile.size} content files were`;
  const blocks = [...byFile.entries()].map(
    ([file, list]) =>
      `  ${contentLabel}/${file}\n` + list.map((note) => `    ${note.field}: ${note.message}`).join('\n'),
  );
  return (
    `NOTE — ${files} tidied while reading (${notes.length === 1 ? '1 value' : `${notes.length} values`}). ` +
    'This is not an error and nothing is blocked: the site uses the tidied values.\n' +
    'An empty optional field was read as its default, and blank list entries were dropped.\n\n' +
    `${blocks.join('\n\n')}\n`
  );
}
