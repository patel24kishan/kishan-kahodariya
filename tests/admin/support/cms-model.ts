/**
 * A MODEL of what Sveltia CMS writes when it saves an entry with the field list of
 * public/admin/config.yml. It lets the round-trip check run for every content file without
 * a browser, and it is itself checked against the real CMS in tests/admin/dashboard.spec.ts
 * (the two must produce the same bytes for every file).
 *
 * The rules, each observed in Sveltia CMS 0.230.0 and stated in its data-output docs
 * (https://sveltiacms.app/en/docs/data-output):
 *   - keys are written in the order of the config's field list; nothing else is written;
 *   - every field is written, also when it is empty ("" / [] / false / null);
 *   - text is trimmed; rows of a plain list are trimmed and blank rows are dropped;
 *   - a hidden field keeps the value the file has, and gets its `default` in a new entry;
 *   - JSON with two spaces, LF line ends and one trailing newline.
 */
import { readCmsConfig, type ConfigTarget, type FieldNode } from '../../../scripts/validate-cms-config';
import { configText } from './env';

export type Dict = Record<string, unknown>;

export function isDict(value: unknown): value is Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The file text Sveltia produces for an object. */
export function serialise(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** The entries (files and folders) of the real config. */
export function configTargets(): ConfigTarget[] {
  const model = readCmsConfig(configText());
  if (model.problems.length > 0) throw new Error(`config.yml cannot be read: ${model.problems[0]?.message}`);
  return model.targets;
}

/** The config entry that edits a repo path such as "content/projects/scarfall.json". */
export function targetFor(targets: readonly ConfigTarget[], repoPath: string): ConfigTarget {
  const matches = targets.filter((target) =>
    target.type === 'file'
      ? target.path === repoPath
      : repoPath.startsWith(`${target.path}/`) && !repoPath.slice(target.path.length + 1).includes('/'),
  );
  if (matches.length !== 1 || !matches[0]) throw new Error(`${repoPath} is edited by ${matches.length} config entries`);
  return matches[0];
}

/** What a field holds in a new entry before the owner types anything. */
export function emptyValue(field: FieldNode): unknown {
  const { raw } = field;
  if ('default' in raw) return raw.default;
  switch (field.widget) {
    case 'boolean':
      return false;
    case 'number':
    case 'relation':
      return null;
    case 'list':
      return [];
    default:
      return '';
  }
}

function writeValue(field: FieldNode, present: boolean, value: unknown): unknown {
  if (!present) return emptyValue(field);
  switch (field.widget) {
    case 'string':
    case 'text':
      return typeof value === 'string' ? value.trim() : value;
    case 'list': {
      if (!Array.isArray(value)) return value;
      if (field.fields) return value.map((row) => (isDict(row) ? writeEntry(field.fields ?? [], row) : row));
      return value.filter((row) => typeof row !== 'string' || row.trim() !== '').map((row) => (typeof row === 'string' ? row.trim() : row));
    }
    case 'object':
      return isDict(value) && field.fields ? writeEntry(field.fields, value) : value;
    default:
      // image, select, relation, number, boolean, hidden: written as they are.
      return value;
  }
}

/** The object Sveltia writes when it saves `data` through `fields`. */
export function writeEntry(fields: readonly FieldNode[], data: Dict): Dict {
  const out: Dict = {};
  for (const field of fields) out[field.name] = writeValue(field, field.name in data, data[field.name]);
  return out;
}

/** Keys of `data` (nested rows included) that the field list does not know, as paths. */
export function unknownKeys(fields: readonly FieldNode[], data: unknown, prefix = ''): string[] {
  if (!isDict(data)) return [];
  const known = new Map(fields.map((field) => [field.name, field]));
  const out: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    const field = known.get(key);
    if (!field) {
      out.push(`${prefix}${key}`);
      continue;
    }
    if (field.fields && Array.isArray(value)) value.forEach((row, index) => out.push(...unknownKeys(field.fields ?? [], row, `${prefix}${key}[${index}].`)));
    else if (field.fields) out.push(...unknownKeys(field.fields, value, `${prefix}${key}.`));
  }
  return out;
}

/** Every key path of an object in writing order: ["slug", "tags", "screenshots[0].src", …]. */
export function keyPaths(data: unknown, prefix = ''): string[] {
  if (Array.isArray(data)) return data.flatMap((row, index) => (isDict(row) ? keyPaths(row, `${prefix}[${index}].`) : []));
  if (!isDict(data)) return [];
  return Object.entries(data).flatMap(([key, value]) => [
    `${prefix}${key}`,
    ...(Array.isArray(value) ? keyPaths(value, `${prefix}${key}`) : keyPaths(value, `${prefix}${key}.`)),
  ]);
}

/** A copy with every string trimmed and blank rows of plain lists dropped — what a save tidies. */
export function tidied(data: unknown): unknown {
  if (typeof data === 'string') return data.trim();
  if (Array.isArray(data)) {
    return data.filter((row) => typeof row !== 'string' || row.trim() !== '').map((row) => tidied(row));
  }
  if (isDict(data)) return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, tidied(value)]));
  return data;
}

/** Where two values differ, as readable lines ("shortDescription: "a " → "a""). */
export function differences(before: unknown, after: unknown, at = ''): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    return before.flatMap((row, index) => differences(row, after[index], `${at}[${index}]`));
  }
  if (isDict(before) && isDict(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const lines = keys.flatMap((key) => differences(before[key], after[key], at === '' ? key : `${at}.${key}`));
    if (lines.length === 0) lines.push(`${at || '(file)'}: the keys are in a different order`);
    return lines;
  }
  return [`${at || '(file)'}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
}

/** The fields a new entry cannot be saved without, with a value the owner might type. */
export interface RequiredInput {
  field: FieldNode;
  kind: 'text' | 'choice' | 'relation';
}

/** Top-level fields the owner has to fill before a new entry can be saved. */
export function requiredInputs(fields: readonly FieldNode[]): RequiredInput[] {
  const out: RequiredInput[] = [];
  for (const field of fields) {
    if (field.raw.required === false || 'default' in field.raw) continue;
    if (field.widget === 'string' || field.widget === 'text') out.push({ field, kind: 'text' });
    else if (field.widget === 'select') out.push({ field, kind: 'choice' });
    else if (field.widget === 'relation') out.push({ field, kind: 'relation' });
  }
  return out;
}

/** Option values of a select field, in order. */
export function optionValues(field: FieldNode): string[] {
  const options = Array.isArray(field.raw.options) ? field.raw.options : [];
  return options.map((option: unknown) => String(isDict(option) ? option.value : option));
}

/** Option labels of a select field, in order (the text of the radio buttons). */
export function optionLabels(field: FieldNode): string[] {
  const options = Array.isArray(field.raw.options) ? field.raw.options : [];
  return options.map((option: unknown) => String(isDict(option) ? (option.label ?? option.value) : option));
}

/**
 * A brand-new entry with only the required fields filled: every other field gets what the
 * dashboard gives it by default. `values` supplies the required ones by field name.
 */
export function newEntry(fields: readonly FieldNode[], values: Readonly<Record<string, unknown>>): Dict {
  const draft: Dict = {};
  for (const field of fields) draft[field.name] = field.name in values ? values[field.name] : emptyValue(field);
  return writeEntry(fields, draft);
}
