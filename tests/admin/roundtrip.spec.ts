/**
 * ROUND-TRIP SAFETY, without a browser: what the dashboard would write for every existing
 * content file, and for a brand-new item with only the required fields filled.
 *
 * It uses a model of Sveltia's writer (support/cms-model.ts). The model is not taken on
 * trust: tests/admin/dashboard.spec.ts saves every file through the real CMS and requires
 * the same bytes.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loadContent } from '../../scripts/lib/load-content';
import { COLLECTION_FOLDERS } from '../../src/content/schema';
import {
  configTargets,
  differences,
  isDict,
  keyPaths,
  newEntry,
  optionValues,
  requiredInputs,
  serialise,
  targetFor,
  tidied,
  unknownKeys,
  writeEntry,
  type Dict,
} from './support/cms-model';
import { contentDir, contentTree, makeTempDir, removeTempDirs, validateContent, writeTree } from './support/env';

test.afterAll(removeTempDirs);

const targets = configTargets();
const tree = contentTree();
const paths = Object.keys(tree).sort();

function parsed(repoPath: string): Dict {
  const data: unknown = JSON.parse(tree[repoPath] ?? 'null');
  if (!isDict(data)) throw new Error(`${repoPath} is not a JSON object`);
  return data;
}

test.describe('saving an existing file through the dashboard', () => {
  test('there is content to check, and every file has exactly one form', () => {
    expect(paths.length).toBeGreaterThanOrEqual(3 + COLLECTION_FOLDERS.length);
    for (const repoPath of paths) expect(() => targetFor(targets, repoPath), repoPath).not.toThrow();
  });

  test('no file has a key the dashboard would drop', () => {
    const dropped = paths.flatMap((repoPath) => unknownKeys(targetFor(targets, repoPath).fields, parsed(repoPath)).map((key) => `${repoPath}: ${key}`));
    expect(dropped).toEqual([]);
  });

  test('the dashboard writes the same keys in the same order as every file has (nested rows included)', () => {
    const mismatches: string[] = [];
    for (const repoPath of paths) {
      const original = parsed(repoPath);
      const written = writeEntry(targetFor(targets, repoPath).fields, original);
      if (keyPaths(written).join('|') !== keyPaths(original).join('|')) {
        mismatches.push(`${repoPath}\n  file:      ${keyPaths(original).join(', ')}\n  dashboard: ${keyPaths(written).join(', ')}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('a save changes nothing except spaces around a text (and reports which files that touches)', () => {
    const identical: string[] = [];
    const tidiedOnly: string[] = [];
    const unexplained: string[] = [];
    for (const repoPath of paths) {
      const original = parsed(repoPath);
      const written = writeEntry(targetFor(targets, repoPath).fields, original);
      if (serialise(written) === tree[repoPath]) {
        identical.push(repoPath);
      } else if (JSON.stringify(written) === JSON.stringify(tidied(original)) && serialise(original) === tree[repoPath]) {
        tidiedOnly.push(`${repoPath} — ${differences(original, written).join('; ')}`);
      } else {
        unexplained.push(`${repoPath} — ${differences(original, written).join('; ') || 'formatting of the file differs'}`);
      }
    }
    test.info().annotations.push({
      type: 'round trip',
      description: `${identical.length} of ${paths.length} files byte-identical after a save; ${tidiedOnly.length} lose only surrounding spaces: ${tidiedOnly.join(' | ') || 'none'}`,
    });
    console.log(`[round trip] ${identical.length}/${paths.length} byte-identical; trimmed on first save: ${tidiedOnly.length}`);
    for (const line of tidiedOnly) console.log(`[round trip]   ${line}`);
    expect(unexplained).toEqual([]);
    expect(identical.length + tidiedOnly.length).toBe(paths.length);
  });

  test('what the dashboard writes for every file still passes the content check', () => {
    const dir = makeTempDir('roundtrip');
    const rewritten: Record<string, string> = {};
    for (const repoPath of paths) {
      rewritten[repoPath.slice('content/'.length)] = serialise(writeEntry(targetFor(targets, repoPath).fields, parsed(repoPath)));
    }
    writeTree(dir, rewritten);
    const result = validateContent(dir);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout, 'nothing had to be tidied by the reader').not.toContain('NOTE');
    const before = loadContent(contentDir);
    const after = loadContent(dir);
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.content).toEqual(tidied(before.content));
  });
});

test.describe('a brand-new item with only the required fields filled', () => {
  const site = parsed('content/site.json');
  const firstTab = String((site.categories as Dict[])[0]?.id);

  /** What the owner must type or choose, by field name. */
  function minimalValues(folder: string, fields: ReturnType<typeof targetFor>['fields']): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const input of requiredInputs(fields)) {
      if (input.kind === 'relation') values[input.field.name] = firstTab;
      else if (input.kind === 'choice') values[input.field.name] = optionValues(input.field)[0];
      else values[input.field.name] = input.field.name === 'slug' ? `new-${folder}-item` : 'New Item';
    }
    return values;
  }

  for (const folder of COLLECTION_FOLDERS) {
    test(`${folder}: the file the dashboard writes passes validate:content and is not published`, () => {
      const target = targetFor(targets, `content/${folder}/x.json`);
      const required = requiredInputs(target.fields);
      expect(required.map((input) => input.field.name), 'the short name is always asked for').toContain('slug');

      const entry = newEntry(target.fields, minimalValues(folder, target.fields));
      expect(entry.published, 'a new item starts as a draft').toBe(false);
      if ('featured' in entry) expect(entry.featured).toBe(false);

      // Same keys, in the same order, as an existing file of this kind.
      const sibling = paths.find((repoPath) => repoPath.startsWith(`content/${folder}/`));
      if (sibling) expect(Object.keys(entry)).toEqual(Object.keys(parsed(sibling)));

      const dir = makeTempDir(`new-${folder}`);
      const files: Record<string, string> = {};
      for (const repoPath of paths) files[repoPath.slice('content/'.length)] = tree[repoPath] ?? '';
      const fileName = `${folder}/${String(entry.slug)}.json`;
      files[fileName] = serialise(entry);
      writeTree(dir, files);

      const result = validateContent(dir);
      expect(result.status, result.output).toBe(0);
      expect(result.stdout).toContain('Content OK');
      // The reader had nothing to fill in for the new file: every field was written.
      expect(result.stdout).not.toContain(fileName);
      expect(existsSync(path.join(dir, ...fileName.split('/')))).toBe(true);
      expect(readFileSync(path.join(dir, ...fileName.split('/')), 'utf8').endsWith('}\n')).toBe(true);
    });
  }

  test('all six at once, next to the real content', () => {
    const dir = makeTempDir('new-all');
    const files: Record<string, string> = {};
    for (const repoPath of paths) files[repoPath.slice('content/'.length)] = tree[repoPath] ?? '';
    for (const folder of COLLECTION_FOLDERS) {
      const target = targetFor(targets, `content/${folder}/x.json`);
      const entry = newEntry(target.fields, minimalValues(folder, target.fields));
      files[`${folder}/${String(entry.slug)}.json`] = serialise(entry);
    }
    writeTree(dir, files);
    const result = validateContent(dir);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).not.toContain('NOTE');
  });

  test('without a required field the content check would refuse the file (so "required" matters)', () => {
    const target = targetFor(targets, 'content/projects/x.json');
    const values = minimalValues('projects', target.fields);
    delete values.title;
    const entry = newEntry(target.fields, values);
    const dir = makeTempDir('new-invalid');
    const files: Record<string, string> = {};
    for (const repoPath of paths) files[repoPath.slice('content/'.length)] = tree[repoPath] ?? '';
    files[`projects/${String(entry.slug)}.json`] = serialise(entry);
    writeTree(dir, files);
    const result = validateContent(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/field:\s+title/);
  });
});
