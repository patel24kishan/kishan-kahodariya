/**
 * CMS CONFIG GATE — `npm run validate:cms` (part of `npm run build`).
 *
 * The dashboard at /admin (Sveltia CMS) rewrites a whole content file from the field list in
 * public/admin/config.yml every time the owner saves. So a mistake in that file can lose
 * data (a field that is not listed is dropped) or block every deploy (a field the schema
 * does not know fails `validate:content`). This script proves, against the REAL schema
 * (src/content/schema.ts), that the config cannot do either:
 *
 *   fields      every schema field of every content kind is in the config, in the schema's
 *               order, and the config has no field the schema does not know (nested lists
 *               included);
 *   required    identity fields are required; an optional field never writes a value the
 *               schema rejects when it is left empty; every optional field has an explicit
 *               default the schema accepts; a new item is never published by default;
 *   choices     select options are exactly the schema's options;
 *   text rules  for every text field, the form (required + pattern, as Sveltia applies them)
 *               and the schema give the same verdict on a table of sample values — addresses,
 *               hover texts, slugs, dates, emails;
 *   plumbing    backend repo and branch (the branch equals the one deploy.yml publishes),
 *               token-only sign-in, media folders, JSON output, the file name of an item is
 *               its `slug` field, every file under /content belongs to exactly one entry;
 *   the page    public/admin/index.html pins one exact Sveltia version with an integrity
 *               hash, carries `noindex`, and loads nothing else from another site.
 *
 * Only problems of the CONFIG fail the run (exit code 1). Content values that the form would
 * refuse today (hand-edited files) are printed as notes and never block a deploy.
 *
 * Usage
 *   tsx scripts/validate-cms-config.ts
 *       [--config <config.yml>] [--html <index.html>] [--deploy <deploy.yml>] [--content <dir>]
 *   tsx scripts/validate-cms-config.ts --integrity [version]
 *       prints the integrity hash of that Sveltia release (needs the network; see
 *       docs/admin-guide.md, "For developers").
 *
 * The functions are exported for the tests under tests/admin.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import {
  ALL_TAB_ID,
  COLLECTION_FOLDERS,
  TRACK_IDS,
  certificateSchema,
  educationSchema,
  experienceSchema,
  projectSchema,
  siteSchema,
  skillGroupSchema,
  socialLinkSchema,
  trackSchema,
  type CollectionFolder,
} from '../src/content/schema';
import type {
  Certificate,
  Education,
  Experience,
  Project,
  SiteSettings,
  SkillGroup,
  SocialLink,
  TrackProfile,
} from '../src/content/types';
import { BASE_PATH, DEFAULT_SITE_ORIGIN } from '../src/lib/site-config';

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function quote(value: unknown): string {
  return JSON.stringify(value);
}

function listOf(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.map((value) => `"${value}"`).join(', ');
}

/** "content/projects" from "/content/projects/", "./content\\projects"… */
export function normalisePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** One problem. `file` is the file to open, `where` the place inside it. */
export interface CmsProblem {
  file: string;
  where: string;
  message: string;
}

// ---------------------------------------------------------------------------------------
// The schema, described structurally
// ---------------------------------------------------------------------------------------

/** What a schema field holds, with zod's wrappers (defaults, tidying) removed. */
export type Shape =
  | { kind: 'string' }
  | { kind: 'number'; nullable: boolean }
  | { kind: 'boolean' }
  | { kind: 'choice'; options: string[] }
  | { kind: 'list'; item: Shape }
  | { kind: 'object'; fields: ShapeField[] }
  | { kind: 'other'; description: string };

export interface ShapeField {
  name: string;
  shape: Shape;
}

interface Checkable {
  safeParse(data: unknown): { success: boolean };
}

/** Reads a zod 4 schema through its public `def` (see node_modules/zod/v4/core/schemas). */
export function shapeOf(schema: unknown, nullable = false): Shape {
  const def = isDict(schema) && isDict(schema.def) ? schema.def : {};
  switch (def.type) {
    case 'pipe':
      // z.preprocess(fn, inner): `in` is the tidying transform, `out` the real rule.
      return shapeOf(def.out, nullable);
    case 'nullable':
      return shapeOf(def.innerType, true);
    case 'optional':
    case 'default':
    case 'prefault':
    case 'nonoptional':
    case 'readonly':
      return shapeOf(def.innerType, nullable);
    case 'string':
      return { kind: 'string' };
    case 'number':
      return { kind: 'number', nullable };
    case 'boolean':
      return { kind: 'boolean' };
    case 'enum':
      return { kind: 'choice', options: isDict(def.entries) ? Object.values(def.entries).map(String) : [] };
    case 'array':
      return { kind: 'list', item: shapeOf(def.element) };
    case 'object':
      return {
        kind: 'object',
        fields: isDict(def.shape) ? Object.entries(def.shape).map(([name, inner]) => ({ name, shape: shapeOf(inner) })) : [],
      };
    default:
      return { kind: 'other', description: String(def.type) };
  }
}

// ---------------------------------------------------------------------------------------
// The content kinds: where each lives, its schema, and one valid sample
// ---------------------------------------------------------------------------------------

/**
 * One valid item per kind. The checks change one value at a time in these samples and ask
 * the real schema whether the result is still valid, so every list of rows has one row.
 * They are typed with src/content/types.ts: `tsc` fails here if the contract changes shape.
 */
const SAMPLE_SITE = {
  name: 'Sample Person',
  monogram: 'SP',
  logo: '/uploads/logo.webp',
  logoAlt: 'Sample Person',
  email: 'person@example.com',
  credit: ['Line one.'],
  roles: ['a Developer'],
  allTabLabel: 'All',
  workLabel: 'See my work',
  contactLabel: 'Get in touch',
  stats: [{ source: 'custom', value: '12+', label: 'Things made' }],
  categories: [
    { id: 'sample-tab', label: 'Sample Tab', order: 10, hoverWithVideo: 'View Demo', hoverWithoutVideo: 'View Screenshots' },
  ],
} satisfies SiteSettings;

function sampleTrack(id: (typeof TRACK_IDS)[number]): TrackProfile {
  return {
    id,
    route: id === 'game' ? 'gamedev' : 'softdev',
    label: 'Sample Page',
    headline: 'Headline',
    summary: 'Summary.',
    resumeUrl: 'https://example.com/resume',
    resumeLabel: 'Resume',
    tabResumes: [{ tab: 'sample-tab', url: 'https://example.com/tab-resume', label: 'Tab Resume', summary: 'Tab summary.' }],
    defaultTab: 'sample-tab',
    photo: '/images/profile.jpg',
    photoAlt: 'Sample Person',
    heroVideo: 'https://example.com/hero.mp4',
    heroPoster: '/uploads/hero-poster.webp',
    badgeLine1: 'Line one',
    badgeLine2: 'Line two',
    certificatesFirst: false,
    metaTitle: 'Sample Person',
    metaDescription: 'A description.',
  };
}

const SAMPLE_PROJECT = {
  slug: 'sample-project',
  title: 'Sample Project',
  shortDescription: 'Short text.',
  longDescription: 'Long text.',
  dateDisplay: '2024',
  tags: ['Tag'],
  category: 'sample-tab',
  audience: 'game',
  featured: false,
  published: true,
  orderGame: 10,
  orderSoftdev: 10,
  hoverText: 'View It',
  screenshots: [{ src: '/uploads/sample.webp', alt: 'A sample picture' }],
  videoUrl: 'https://www.youtube.com/watch?v=sample',
  links: [{ label: 'View Code', url: 'https://example.com/code', kind: 'code' }],
  legacyId: null,
} satisfies Project;

const SAMPLE_EXPERIENCE = {
  slug: 'sample-job',
  company: 'Sample Company',
  role: 'Developer',
  location: 'Somewhere',
  remote: false,
  startDate: '2024-06',
  endDate: '2025-01',
  present: false,
  dateDisplay: 'June 2024 - Jan 2025',
  logo: '/uploads/logo.webp',
  bullets: ['Did a thing.'],
  bulletsGame: ['Did a game thing.'],
  bulletsSoftdev: ['Did a software thing.'],
  tags: ['Tag'],
  audience: 'both',
  orderGame: 10,
  orderSoftdev: 10,
  published: true,
} satisfies Experience;

const SAMPLE_SKILLS = {
  slug: 'sample-skills',
  title: 'Sample Skills',
  skills: ['Skill'],
  emphasis: 'none',
  orderGame: 10,
  orderSoftdev: 10,
  published: true,
} satisfies SkillGroup;

const SAMPLE_LINK = {
  slug: 'sample-link',
  label: 'Sample',
  url: 'https://example.com',
  icon: 'link',
  audience: 'both',
  order: 10,
  orderFooter: 20,
  showInHero: true,
  showInFooter: true,
  published: true,
} satisfies SocialLink;

const SAMPLE_EDUCATION = {
  slug: 'sample-school',
  school: 'Sample University',
  degree: 'Degree',
  dateDisplay: '2019 - 2021',
  grade: 'A',
  description: 'Notes.',
  order: 10,
  published: true,
} satisfies Education;

const SAMPLE_CERTIFICATE = {
  slug: 'sample-certificate',
  title: 'Sample Certificate',
  dateDisplay: '2023',
  description: 'Notes.',
  image: '/uploads/badge.webp',
  imageAlt: 'Sample badge',
  url: 'https://example.com/certificate',
  orderGame: 10,
  orderSoftdev: 10,
  published: true,
} satisfies Certificate;

export interface ContentKind {
  /** "site", "tracks/game", "projects"… */
  id: string;
  /** Words for messages: "Site settings", "the game page", "Projects". */
  title: string;
  schema: Checkable;
  shape: Shape;
  sample: Dict;
  /** Repo-relative location, forward slashes: one file, or a folder of <slug>.json files. */
  location: { type: 'file'; path: string } | { type: 'folder'; path: string };
}

const FOLDER_KINDS: Record<CollectionFolder, { title: string; schema: unknown; sample: Dict }> = {
  projects: { title: 'Projects', schema: projectSchema, sample: SAMPLE_PROJECT },
  experience: { title: 'Experience', schema: experienceSchema, sample: SAMPLE_EXPERIENCE },
  skills: { title: 'Skill groups', schema: skillGroupSchema, sample: SAMPLE_SKILLS },
  links: { title: 'Links', schema: socialLinkSchema, sample: SAMPLE_LINK },
  education: { title: 'Education', schema: educationSchema, sample: SAMPLE_EDUCATION },
  certificates: { title: 'Certificates', schema: certificateSchema, sample: SAMPLE_CERTIFICATE },
};

/** The content folder as the repository (and therefore the dashboard config) names it. */
export const CONTENT_ROOT = 'content';

/** Every kind of content file the schema knows, with where it lives under the content folder. */
export function contentKinds(contentFolder = CONTENT_ROOT): ContentKind[] {
  const kinds: ContentKind[] = [
    {
      id: 'site',
      title: 'Site settings',
      schema: siteSchema,
      shape: shapeOf(siteSchema),
      sample: SAMPLE_SITE,
      location: { type: 'file', path: `${contentFolder}/site.json` },
    },
  ];
  for (const id of TRACK_IDS) {
    kinds.push({
      id: `tracks/${id}`,
      title: `the ${id === 'game' ? 'game' : 'software'} page`,
      schema: trackSchema,
      shape: shapeOf(trackSchema),
      sample: { ...sampleTrack(id) },
      location: { type: 'file', path: `${contentFolder}/tracks/${id}.json` },
    });
  }
  for (const folder of COLLECTION_FOLDERS) {
    const kind = FOLDER_KINDS[folder];
    kinds.push({
      id: folder,
      title: kind.title,
      schema: kind.schema as Checkable,
      shape: shapeOf(kind.schema),
      sample: kind.sample,
      location: { type: 'folder', path: `${contentFolder}/${folder}` },
    });
  }
  return kinds;
}

/**
 * Fields whose value points at something in another file. The per-file schemas accept any
 * non-empty text for them; the cross-file rules in validateContent() check the target.
 * In the form they must be choices driven by Site settings, not free text.
 *
 * `path` is the field's place in the file, with the names joined by dots and list positions
 * left out: "category", or "tabResumes.tab" for the `tab` key of every row of `tabResumes`.
 */
const REFERENCES: Record<string, readonly { path: string; allowAll: boolean }[]> = {
  projects: [{ path: 'category', allowAll: false }],
  'tracks/game': [
    { path: 'defaultTab', allowAll: true },
    { path: 'tabResumes.tab', allowAll: true },
  ],
  'tracks/softdev': [
    { path: 'defaultTab', allowAll: true },
    { path: 'tabResumes.tab', allowAll: true },
  ],
};

/** "tabResumes.tab" for ["tabResumes", 0, "tab"]. */
function namePath(dataPath: ReadonlyArray<string | number>): string {
  return dataPath.filter((key) => typeof key === 'string').join('.');
}

/** The schema's shape at a name path ("tabResumes.tab" looks inside the rows of the list). */
function shapeAt(shape: Shape, path: string): Shape | undefined {
  let current: Shape | undefined = shape;
  for (const name of path.split('.')) {
    while (current?.kind === 'list') current = current.item;
    if (current?.kind !== 'object') return undefined;
    current = current.fields.find((field) => field.name === name)?.shape;
  }
  return current;
}

// ---------------------------------------------------------------------------------------
// The config, read into a small model
// ---------------------------------------------------------------------------------------

export interface FieldNode {
  name: string;
  /** Sveltia field type; "string" when the config leaves it out. */
  widget: string;
  /** Human path for messages: "Projects › Buttons › Address". */
  where: string;
  raw: Dict;
  /** Sub-fields of a list of rows (`fields:`) or of an object. */
  fields?: FieldNode[];
  /** The single sub-field of a list written with `field:`. */
  field?: FieldNode;
}

export interface ConfigTarget {
  /** "file": a singleton or one file of a file collection. "folder": an entry collection. */
  type: 'file' | 'folder';
  /** Name used in the dashboard's addresses. */
  name: string;
  /** "_singletons" for a singleton, otherwise the collection's name. */
  collection: string;
  label: string;
  /** Repo-relative path of the file or the folder. */
  path: string;
  raw: Dict;
  /** The file collection a file belongs to (undefined for singletons and entry collections). */
  parent?: Dict;
  fields: FieldNode[];
}

export interface CmsConfigModel {
  root: Dict;
  targets: ConfigTarget[];
  /** Problems found while reading (syntax, structure). */
  problems: CmsProblem[];
}

function readFields(value: unknown, where: string, file: string, problems: CmsProblem[]): FieldNode[] {
  if (!Array.isArray(value)) {
    problems.push({ file, where, message: 'has no `fields` list' });
    return [];
  }
  const nodes: FieldNode[] = [];
  const seen = new Set<string>();
  value.forEach((entry: unknown, index) => {
    if (!isDict(entry) || typeof entry.name !== 'string' || entry.name === '') {
      problems.push({ file, where, message: `field #${index + 1} has no \`name\`` });
      return;
    }
    if (seen.has(entry.name)) {
      problems.push({ file, where, message: `the field "${entry.name}" is listed twice` });
      return;
    }
    seen.add(entry.name);
    nodes.push(readField(entry, where, file, problems));
  });
  return nodes;
}

function readField(entry: Dict, parentWhere: string, file: string, problems: CmsProblem[]): FieldNode {
  const name = String(entry.name);
  const label = typeof entry.label === 'string' && entry.label !== '' ? `${entry.label} (${name})` : name;
  const where = `${parentWhere} › ${label}`;
  const node: FieldNode = { name, widget: typeof entry.widget === 'string' ? entry.widget : 'string', where, raw: entry };
  if (entry.fields !== undefined) node.fields = readFields(entry.fields, where, file, problems);
  if (entry.field !== undefined) {
    if (isDict(entry.field) && typeof entry.field.name === 'string') node.field = readField(entry.field, where, file, problems);
    else problems.push({ file, where, message: '`field` must be one field definition with a `name`' });
  }
  return node;
}

/** Parses config.yml into the entries (files and folders) the dashboard edits. */
export function readCmsConfig(text: string, file = 'public/admin/config.yml'): CmsConfigModel {
  const problems: CmsProblem[] = [];
  const document = parseDocument(text, { prettyErrors: true });
  for (const error of document.errors) {
    problems.push({ file, where: '(file)', message: `is not valid YAML: ${error.message.split('\n')[0] ?? error.message}` });
  }
  const root: unknown = document.errors.length > 0 ? {} : document.toJS();
  if (!isDict(root)) {
    problems.push({ file, where: '(file)', message: 'must contain a YAML mapping (backend:, collections:, …)' });
    return { root: {}, targets: [], problems };
  }

  const targets: ConfigTarget[] = [];
  const addFile = (entry: unknown, collection: string, parentLabel: string, parent: Dict | undefined): void => {
    if (!isDict(entry)) return;
    if (entry.divider === true) return;
    const name = typeof entry.name === 'string' ? entry.name : '';
    const label = typeof entry.label === 'string' ? entry.label : name;
    const where = parentLabel === '' ? label : `${parentLabel} › ${label}`;
    if (name === '' || typeof entry.file !== 'string') {
      problems.push({ file, where: where || '(a file entry)', message: 'needs a `name` and a `file`' });
      return;
    }
    targets.push({
      type: 'file',
      name,
      collection,
      label: where,
      path: normalisePath(entry.file),
      raw: entry,
      parent,
      fields: readFields(entry.fields, where, file, problems),
    });
  };

  if (root.singletons !== undefined) {
    if (Array.isArray(root.singletons)) root.singletons.forEach((entry: unknown) => addFile(entry, '_singletons', '', undefined));
    else problems.push({ file, where: 'singletons', message: 'must be a list' });
  }
  if (root.collections !== undefined) {
    if (!Array.isArray(root.collections)) {
      problems.push({ file, where: 'collections', message: 'must be a list' });
    } else {
      for (const entry of root.collections as unknown[]) {
        if (!isDict(entry) || entry.divider === true) continue;
        const name = typeof entry.name === 'string' ? entry.name : '';
        const label = typeof entry.label === 'string' ? entry.label : name;
        if (name === '') {
          problems.push({ file, where: 'collections', message: 'a collection has no `name`' });
          continue;
        }
        if (Array.isArray(entry.files)) {
          entry.files.forEach((item: unknown) => addFile(item, name, label, entry));
        } else if (typeof entry.folder === 'string') {
          targets.push({
            type: 'folder',
            name,
            collection: name,
            label,
            path: normalisePath(entry.folder),
            raw: entry,
            fields: readFields(entry.fields, label, file, problems),
          });
        } else {
          problems.push({ file, where: label, message: 'is neither a folder collection (`folder:`) nor a file collection (`files:`)' });
        }
      }
    }
  }
  return { root, targets, problems };
}

// ---------------------------------------------------------------------------------------
// How Sveltia applies `required` and `pattern` to a typed value
// ---------------------------------------------------------------------------------------

const DELIMITED_PATTERN = /^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/;

/**
 * A `pattern` as Sveltia CMS 0.230 reads it: plain regex source, or "/source/flags" (the g and
 * y flags are dropped). Returns undefined for something that is not a regular expression —
 * Sveltia then applies no rule at all, which is why that is reported as a problem here.
 */
export function parsePattern(source: unknown): RegExp | undefined {
  if (typeof source !== 'string' || source === '') return undefined;
  const match = DELIMITED_PATTERN.exec(source);
  const body = match?.groups?.pattern ?? source;
  const flags = (match?.groups?.flags ?? '').replace(/[gy]/g, '');
  try {
    return new RegExp(body, flags);
  } catch {
    return undefined;
  }
}

/**
 * Would the form let this text be saved in this field? Sveltia trims the text first, treats
 * an empty value as "left empty" (allowed only when the field is optional) and tests the
 * pattern against the trimmed text. The trimmed text is what gets written to the file.
 */
export function formAcceptsText(field: FieldNode, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return field.raw.required === false;
  const pattern = Array.isArray(field.raw.pattern) ? parsePattern((field.raw.pattern as unknown[])[0]) : undefined;
  return pattern ? pattern.test(trimmed) : true;
}

/**
 * The name Sveltia tests an image field's pattern against while a picture has been picked
 * but the item is not saved yet: the bare file name, already lower-cased and hyphenated
 * (`slugify_filename`). The saved value is /uploads/<that name>.
 */
export const BARE_UPLOAD_NAME = /^[a-z0-9_~-][a-z0-9._~-]*\.[a-z0-9]+$/;

/** Upload names the image fields must accept, or the owner could not upload at all. */
export const UPLOAD_NAME_SAMPLES = ['screenshot.png', 'my-shot-1-final.webp', 'logo_2.svg', '3d-platformer.jpg'] as const;

/**
 * Sample values for every text field. For each one the form (formAcceptsText) and the real
 * schema must give the same verdict. They are ordinary mistakes and ordinary good values —
 * not an exhaustive grammar.
 */
export const TEXT_SAMPLES: readonly string[] = [
  // left empty
  '',
  '   ',
  // ordinary text
  'Hello',
  'Two words',
  'three little words',
  'View Gameplay & Screenshots',
  'one two three four five',
  'a\tb c d e',
  'Developed scalable cloud-backed services, with commas: colons; and more.',
  'Ünïcödé — text © 2026',
  // slugs and ids
  'my-game',
  'my--game',
  '-game',
  'game-',
  'My-Game',
  'my game',
  'my_game',
  '3d-platformer',
  'web-apps',
  'a',
  ALL_TAB_ID,
  // year-month
  '2024-06',
  '2024-13',
  '2024-00',
  '2024-6',
  '24-06',
  '2024/06',
  '2024-06-01',
  'June 2024',
  // email
  'name@example.com',
  'first.last@sub.example.co',
  'name@example',
  '@example.com',
  'na me@example.com',
  'name@exa mple.com',
  // web addresses
  'https://example.com',
  'http://example.com/path?x=1#y',
  'HTTPS://EXAMPLE.COM/Path',
  'https://example.com:8080/x',
  'https://sub.example.co.uk/a,b~c/%2Bd.jpg?format=1500w',
  'https://www.youtube.com/watch?v=abc123',
  'https://youtu.be/abc123',
  'https://www.youtube.com/Gameplay?v=Lp46QFgKyKM',
  'https://drive.google.com/file/d/1S5b_6Pfrs/view?usp=drive_link',
  'https://example.com/a b',
  'https:// example.com',
  'https://',
  'https:///path',
  'http://?x',
  'https://#frag',
  'htps://example.com',
  'example.com',
  'www.example.com/page',
  'example.com/a.png',
  '//example.com/x',
  'ftp://example.com/file',
  'javascript:alert(1)',
  'data:text/plain,hi',
  'tel:+15551234',
  // site paths
  '/',
  '/uploads/a.webp',
  '/images/profile.jpg',
  '/a b',
  'uploads/a.webp',
  './a.webp',
  '../a.webp',
  // mailto
  'mailto:name@example.com',
  'MAILTO:Name@Example.com',
  'mailto:name',
  'mailto:',
  'mailto:name@example',
  'mailto:na me@example.com',
  // bare file names (what an image field sees right after an upload)
  ...UPLOAD_NAME_SAMPLES,
  // surrounded by spaces (the form trims before it checks and before it saves)
  '  padded text  ',
  ' https://example.com ',
  ' my-game ',
];

// ---------------------------------------------------------------------------------------
// Asking the real schema
// ---------------------------------------------------------------------------------------

type DataPath = ReadonlyArray<string | number>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A copy of `sample` with the value at `path` replaced (or removed when `remove` is true). */
function changed(sample: Dict, dataPath: DataPath, value: unknown, remove = false): Dict {
  const copy = clone(sample);
  let cursor: unknown = copy;
  for (const key of dataPath.slice(0, -1)) {
    if (Array.isArray(cursor) && typeof key === 'number') cursor = cursor[key];
    else if (isDict(cursor) && typeof key === 'string') cursor = cursor[key];
    else return copy;
  }
  const last = dataPath[dataPath.length - 1];
  if (isDict(cursor) && typeof last === 'string') {
    if (remove) delete cursor[last];
    else cursor[last] = value;
  }
  return copy;
}

function schemaAccepts(kind: ContentKind, dataPath: DataPath, value: unknown): boolean {
  return kind.schema.safeParse(changed(kind.sample, dataPath, value)).success;
}

function schemaAcceptsWithout(kind: ContentKind, dataPath: DataPath): boolean {
  return kind.schema.safeParse(changed(kind.sample, dataPath, undefined, true)).success;
}

// ---------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------

export interface CmsCheckInput {
  /** Text of config.yml. */
  configText: string;
  /** Text of the admin index.html. */
  htmlText: string;
  /** Text of the deploy workflow. */
  deployText: string;
  /** Absolute path of the content folder. */
  contentDir: string;
  /** Names of the files that sit next to index.html (to check local scripts exist). */
  adminFiles: readonly string[];
  /** Labels used in messages. */
  labels?: { config?: string; html?: string; deploy?: string; content?: string };
}

export interface CmsCheckResult {
  ok: boolean;
  problems: CmsProblem[];
  /** Things worth knowing that do not fail the run. */
  notes: CmsProblem[];
  summary: {
    version: string;
    branch: string;
    kinds: number;
    fields: number;
    textFields: number;
    samples: number;
    contentFiles: number;
  };
}

const TEXT_WIDGETS = new Set(['string', 'text', 'image']);
const SCRIPT_URL = /^https:\/\/unpkg\.com\/@sveltia\/cms@(\d+\.\d+\.\d+)\/dist\/sveltia-cms\.js$/;
const SCHEMA_COMMENT = /^#\s*yaml-language-server:\s*\$schema=https:\/\/unpkg\.com\/@sveltia\/cms@([^/\s]+)\/schema\/sveltia-cms\.json\s*$/m;

/** The repository this site is deployed from, derived from where it is served. */
export function expectedRepo(): string {
  const owner = new URL(DEFAULT_SITE_ORIGIN).hostname.split('.')[0] ?? '';
  const repo = BASE_PATH.replace(/^\/+|\/+$/g, '');
  return `${owner}/${repo}`;
}

export function expectedSiteUrl(): string {
  return `${DEFAULT_SITE_ORIGIN.replace(/\/+$/, '')}${BASE_PATH}`.replace(/\/+$/, '');
}

/** The branch(es) the deploy workflow publishes on a push. */
export function deployBranches(deployText: string): string[] {
  const document = parseDocument(deployText);
  if (document.errors.length > 0) return [];
  const root: unknown = document.toJS();
  // YAML 1.1 parsers read the key `on` as the boolean true; the `yaml` package (1.2) keeps "on".
  const on = isDict(root) ? (root.on ?? root.true) : undefined;
  const push = isDict(on) ? on.push : undefined;
  const branches = isDict(push) ? push.branches : undefined;
  return Array.isArray(branches) ? branches.filter((branch): branch is string => typeof branch === 'string') : [];
}

function walkJson(dir: string, relative: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) walkJson(path.join(dir, entry.name), rel, out);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) out.push(rel);
  }
}

/** Runs every check. Pure apart from reading the content folder. */
export function checkCmsConfig(input: CmsCheckInput): CmsCheckResult {
  const files = {
    config: input.labels?.config ?? 'public/admin/config.yml',
    html: input.labels?.html ?? 'public/admin/index.html',
    deploy: input.labels?.deploy ?? '.github/workflows/deploy.yml',
    content: input.labels?.content ?? 'content',
  };
  const model = readCmsConfig(input.configText, files.config);
  const problems: CmsProblem[] = [...model.problems];
  const notes: CmsProblem[] = [];
  const problem = (where: string, message: string, file = files.config): void => {
    problems.push({ file, where, message });
  };
  const summary = { version: '', branch: '', kinds: 0, fields: 0, textFields: 0, samples: TEXT_SAMPLES.length, contentFiles: 0 };

  const { root, targets } = model;
  // The config names content by its path in the repository, always "content/…", wherever the
  // folder being checked happens to be on disk (the tests point --content at a temp copy).
  const kinds = contentKinds(CONTENT_ROOT);
  summary.kinds = kinds.length;

  // The samples must be valid, or every answer below would be meaningless.
  for (const kind of kinds) {
    if (!kind.schema.safeParse(kind.sample).success) {
      problem(
        '(validator)',
        `the built-in sample for ${kind.title} no longer passes the schema — update the SAMPLE_… constant for it`,
        'scripts/validate-cms-config.ts',
      );
    }
  }

  // ---- merge keys: keep the file within what every YAML reader understands the same way ----
  const hasMergeKey = (value: unknown): boolean =>
    Array.isArray(value) ? value.some(hasMergeKey) : isDict(value) ? '<<' in value || Object.values(value).some(hasMergeKey) : false;
  if (hasMergeKey(root)) {
    problem('(file)', 'uses a YAML merge key ("<<"). Use plain anchors and aliases (&name / *name) instead: not every YAML reader merges the same way');
  }

  // ---- backend ---------------------------------------------------------------------------
  const backend = isDict(root.backend) ? root.backend : {};
  if (backend.name !== 'github') problem('backend › name', `must be "github" (it is ${quote(backend.name)})`);
  if (backend.repo !== expectedRepo()) {
    problem('backend › repo', `must be "${expectedRepo()}" — the repository this site is deployed from (it is ${quote(backend.repo)})`);
  }
  const branches = deployBranches(input.deployText);
  if (branches.length !== 1) {
    problem(
      'on › push › branches',
      `must name exactly one production branch (found: ${listOf(branches)}) — the dashboard commits to one branch`,
      files.deploy,
    );
  }
  if (typeof backend.branch !== 'string' || backend.branch === '') {
    problem(
      'backend › branch',
      'must be written out. Without it the dashboard commits to the repository\'s default branch, which may not be the branch that is deployed',
    );
  } else {
    summary.branch = backend.branch;
    if (branches.length === 1 && backend.branch !== branches[0]) {
      problem(
        'backend › branch',
        `is "${backend.branch}" but ${files.deploy} deploys pushes to "${branches[0]}". The two must be the same branch, or a save in the dashboard never reaches the live site`,
      );
    }
  }
  const authMethods = Array.isArray(backend.auth_methods) ? backend.auth_methods : undefined;
  if (!authMethods || authMethods.length !== 1 || authMethods[0] !== 'token') {
    problem(
      'backend › auth_methods',
      'must be [token]. Any other sign-in method needs an OAuth server, which this site does not have: the button would open a page that cannot sign anyone in',
    );
  }
  for (const key of ['base_url', 'auth_endpoint', 'app_id', 'api_root', 'graphql_api_root', 'open_authoring']) {
    if (backend[key] !== undefined) problem(`backend › ${key}`, 'is not used by this site (token sign-in on github.com only) — remove it');
  }
  if (backend.skip_ci !== undefined || backend.automatic_deployments !== undefined) {
    problem('backend › skip_ci', 'must not be set: a save has to start the deploy workflow, and that is what the owner is told');
  }
  if (root.publish_mode !== undefined && root.publish_mode !== 'simple' && root.publish_mode !== '') {
    problem('publish_mode', `must be left out or "simple" (it is ${quote(root.publish_mode)}): a save is a commit on the production branch`);
  }
  if (root.site_url !== expectedSiteUrl()) {
    problem('site_url', `must be "${expectedSiteUrl()}" (origin + base path from src/lib/site-config.ts); it is ${quote(root.site_url)}`);
  }
  if (root.readonly === true) problem('readonly', 'is true: nobody could save anything');

  // ---- media -----------------------------------------------------------------------------
  if (typeof root.media_folder !== 'string' || normalisePath(root.media_folder) !== 'public/uploads') {
    problem('media_folder', `must be "public/uploads" (it is ${quote(root.media_folder)})`);
  }
  if (root.public_folder !== '/uploads') {
    problem('public_folder', `must be "/uploads" (it is ${quote(root.public_folder)}) — content stores image paths without the site's base path`);
  }
  const libraries = isDict(root.media_libraries) ? root.media_libraries : {};
  const defaultLibrary = isDict(libraries.default) && isDict(libraries.default.config) ? libraries.default.config : {};
  const sharedLibrary = isDict(libraries.all) ? libraries.all : {};
  const slugifies = defaultLibrary.slugify_filename ?? sharedLibrary.slugify_filename;
  if (slugifies !== true) {
    problem(
      'media_libraries › default › config › slugify_filename',
      'must be true. Without it an uploaded "My Photo.png" is saved under a path with a space, which the content check rejects, and the image fields\' pattern would refuse the upload',
    );
  }
  const slugOptions = isDict(root.slug) ? root.slug : {};
  if (slugOptions.encoding !== 'ascii') {
    problem('slug › encoding', 'must be "ascii", so file names of uploads contain only letters, digits, "-", "_" and "~"');
  }
  if (slugOptions.lowercase === false) problem('slug › lowercase', 'must not be false: upload names and item file names are lower case');

  // ---- output ----------------------------------------------------------------------------
  const output = isDict(root.output) ? root.output : {};
  if (output.omit_empty_optional_fields === true) {
    problem('output › omit_empty_optional_fields', 'must not be true: every field is always written ("" / [] / false when empty)');
  }
  const json = isDict(output.json) ? output.json : {};
  if ((json.indent_style ?? 'space') !== 'space' || (json.indent_size ?? 2) !== 2) {
    problem('output › json', 'must be two-space indentation (indent_style: space, indent_size: 2), the format of the files under /content');
  }
  if (output.encode_file_path === true) problem('output › encode_file_path', 'must not be true: image paths are stored as written');

  // ---- every content kind has exactly one entry, in JSON ------------------------------------
  const byKind = new Map<string, ConfigTarget>();
  for (const kind of kinds) {
    const matching = targets.filter((target) => target.type === kind.location.type && target.path === kind.location.path);
    if (matching.length === 0) {
      problem(
        '(collections)',
        kind.location.type === 'file'
          ? `nothing edits ${kind.location.path} (${kind.title}). Add a file entry for it`
          : `no collection has \`folder: ${kind.location.path}\` (${kind.title})`,
      );
      continue;
    }
    if (matching.length > 1) {
      problem(
        '(collections)',
        `${kind.location.path} is edited by ${matching.length} entries (${matching.map((target) => target.label).join(', ')}). Two forms writing one file overwrite each other`,
      );
    }
    const first = matching[0];
    if (first) byKind.set(kind.id, first);
  }
  for (const target of targets) {
    const known = kinds.some((kind) => kind.location.type === target.type && kind.location.path === target.path);
    if (!known) {
      problem(
        target.label,
        `edits "${target.path}", which is not a content location the schema knows (${kinds.map((kind) => kind.location.path).join(', ')})`,
      );
    }
    const format = target.raw.format ?? target.parent?.format;
    if (target.type === 'folder') {
      if (format !== 'json') problem(target.label, `needs \`format: json\` (it is ${quote(format)})`);
      if (target.raw.extension !== 'json') problem(target.label, `needs \`extension: json\` (it is ${quote(target.raw.extension)}) — without it no existing item is listed`);
    } else {
      if (!target.path.endsWith('.json')) problem(target.label, `must be a .json file (it is "${target.path}")`);
      if (format !== undefined && format !== 'json') problem(target.label, `must use \`format: json\` (it is ${quote(format)})`);
    }
    for (const owner of [target.raw, target.parent ?? {}]) {
      for (const key of ['media_folder', 'public_folder']) {
        if (owner[key] !== undefined) problem(`${target.label} › ${key}`, 'must not be set: all uploads go to public/uploads, served at /uploads');
      }
    }
  }

  // ---- folder collections: the file name is the item's `slug` field ------------------------
  for (const target of targets) {
    if (target.type !== 'folder') continue;
    const slug = isDict(target.raw.slug) ? target.raw.slug : {};
    if (slug.template !== '{{fields.slug}}') {
      problem(
        `${target.label} › slug › template`,
        `must be "{{fields.slug}}" (it is ${quote(isDict(target.raw.slug) ? slug.template : target.raw.slug)}): the content check requires the file name to equal the item's "slug" field`,
      );
    }
    if (slug.editable !== false) {
      problem(`${target.label} › slug › editable`, 'must be false: renaming the file in the side panel would leave the "slug" field behind');
    }
    if (target.raw.path !== undefined) problem(`${target.label} › path`, 'must not be set: items are files directly inside the folder');
    if (target.raw.nested !== undefined) problem(`${target.label} › nested`, 'must not be set: sub-folders are not content locations');
    if (target.raw.duplicate !== false) {
      problem(
        `${target.label} › duplicate`,
        'must be false: a duplicated item copies "Published: on", so saving the copy would put a half-edited item on the site',
      );
    }
    if (target.raw.reorder !== undefined && target.raw.reorder !== false) {
      problem(
        `${target.label} › reorder`,
        'must not be set. Sveltia then writes the order key as the first key of every file it saves, in another position than the schema\'s (see logs/issues/admin-02-*.md before enabling it)',
      );
    }
    if (target.raw.create === false) problem(`${target.label} › create`, 'is false: the owner could not add items');
    const identifier = typeof target.raw.identifier_field === 'string' ? target.raw.identifier_field : 'title';
    if (!target.fields.some((field) => field.name === identifier)) {
      problem(`${target.label} › identifier_field`, `"${identifier}" is not one of the fields — the list would show slugs instead of names`);
    }
  }

  // ---- fields against the schema -----------------------------------------------------------
  const siteTarget = byKind.get('site');

  // Every reference must name a text field the schema really has, or its check below would
  // silently never run (a renamed field, a typing mistake in REFERENCES).
  for (const kind of kinds) {
    for (const reference of REFERENCES[kind.id] ?? []) {
      if (shapeAt(kind.shape, reference.path)?.kind !== 'string') {
        problem(
          '(validator)',
          `REFERENCES names "${reference.path}" for ${kind.title}, but the schema has no text field there — update REFERENCES`,
          'scripts/validate-cms-config.ts',
        );
      }
    }
  }

  const checkLeaf = (kind: ContentKind, field: FieldNode, shape: Shape, dataPath: DataPath): void => {
    summary.fields += 1;
    const { raw, widget, where } = field;
    const identity = !schemaAcceptsWithout(kind, dataPath);
    const isReference = (REFERENCES[kind.id] ?? []).some((reference) => reference.path === namePath(dataPath));

    // -- widget fits the kind of value --
    const allowed: Record<Shape['kind'], string[]> = {
      string: isReference ? ['relation', 'select'] : ['string', 'text', 'image', 'hidden'],
      number: ['number', 'hidden'],
      boolean: ['boolean'],
      choice: ['select', 'hidden'],
      list: ['list'],
      object: ['object'],
      other: [],
    };
    if (!allowed[shape.kind].includes(widget)) {
      problem(
        where,
        isReference
          ? `must be a choice driven by Site settings (widget: relation), not "${widget}" — free text here could name a tab that does not exist`
          : `is a ${shape.kind} in the schema, so the field type must be one of ${allowed[shape.kind].join(', ')} (it is "${widget}")`,
      );
      return;
    }

    // -- hidden fields: fixed values the owner never sees --
    if (widget === 'hidden') {
      if (!('default' in raw)) {
        problem(where, 'is hidden and needs a `default`: that is the value a new item gets');
        return;
      }
      if (!schemaAccepts(kind, dataPath, raw.default)) {
        problem(where, `is hidden with the default ${quote(raw.default)}, which the schema rejects`);
      }
      return;
    }

    // -- required / optional --
    const required = raw.required !== false;
    if (identity && !required) {
      problem(where, 'is an identity field (the content check fails without it) and must be required — remove `required: false`');
    }

    // -- per kind of value --
    if (widget === 'boolean') {
      if (typeof raw.default !== 'boolean') problem(where, 'needs an explicit `default: true` or `default: false`');
      else if ((field.name === 'published' || field.name === 'featured') && raw.default !== false) {
        problem(where, 'must default to false: a new item must not be published (or featured) before the owner decides so');
      }
      if (raw.required !== false) problem(where, 'is a switch and should say `required: false` (off is a valid answer)');
      return;
    }

    if (widget === 'number') {
      if (shape.kind !== 'number') return;
      if (raw.value_type !== undefined && raw.value_type !== 'int' && raw.value_type !== 'float') {
        problem(where, `\`value_type: ${String(raw.value_type)}\` would store the number as text, which the schema rejects`);
      }
      if (required) {
        if (typeof raw.default !== 'number') {
          problem(where, 'is required, so it needs a numeric `default` — otherwise a new item cannot be saved until a number is typed');
        } else if (!schemaAccepts(kind, dataPath, raw.default)) {
          problem(where, `has the default ${quote(raw.default)}, which the schema rejects`);
        }
      } else if (!schemaAccepts(kind, dataPath, null)) {
        problem(where, 'is optional, and Sveltia writes null for an empty number, which the schema rejects here — make it required with a default');
      }
      return;
    }

    if (widget === 'select') {
      const options = Array.isArray(raw.options) ? raw.options.map((option: unknown) => (isDict(option) ? option.value : option)) : [];
      if (options.length === 0 || options.some((option) => typeof option !== 'string')) {
        problem(where, 'needs `options` whose values are text');
        return;
      }
      const values = options as string[];
      if (new Set(values).size !== values.length) problem(where, 'lists an option twice');
      if (shape.kind === 'choice') {
        const missing = shape.options.filter((option) => !values.includes(option));
        const extra = values.filter((option) => !shape.options.includes(option));
        if (missing.length > 0) problem(where, `is missing the option(s) ${listOf(missing)} that the schema allows`);
        if (extra.length > 0) {
          problem(where, `offers the option(s) ${listOf(extra)} that the schema rejects — choosing one would block the deploy`);
        }
      }
      if (raw.multiple === true) problem(where, 'must not be `multiple`: the schema expects one value');
      if (!required && !schemaAccepts(kind, dataPath, '')) {
        problem(where, 'must be required: an unselected choice is saved as "", which the schema rejects');
      }
      if ('default' in raw) {
        if (typeof raw.default !== 'string' || !values.includes(raw.default)) {
          problem(where, `has the default ${quote(raw.default)}, which is not one of its options`);
        }
      }
      return;
    }

    if (widget === 'relation') {
      const site = siteTarget;
      const pointsAtSite = site !== undefined && raw.collection === site.collection && raw.file === site.name;
      const valueField = typeof raw.value_field === 'string' ? raw.value_field.replace(/^\{\{|\}\}$/g, '') : '';
      if (!pointsAtSite || valueField !== 'categories.*.id') {
        problem(
          where,
          `must list the project tabs of Site settings: collection: ${site?.collection ?? '_singletons'}, file: ${site?.name ?? 'site'}, value_field: 'categories.*.id'`,
        );
      }
      if (raw.multiple === true) problem(where, 'must not be `multiple`: the schema expects one tab');
      if (!required) problem(where, 'must be required: Sveltia writes null for an unselected relation, which the schema rejects');
      return;
    }

    if (widget === 'list') {
      if (shape.kind !== 'list') return;
      if (raw.required !== false) problem(where, 'is a list and should say `required: false` (an empty list is valid)');
      if (!Array.isArray(raw.default) || raw.default.length !== 0) problem(where, 'needs an explicit `default: []`');
      if (raw.root === true) problem(where, 'must not be `root`: the list is a named key of the file');
      if (typeof raw.max === 'number' && raw.max < 2) problem(where, 'must not limit the list to one row: Sveltia would show it as a single object');
      if (shape.item.kind === 'object') {
        if (field.field !== undefined || field.fields === undefined) {
          problem(where, 'is a list of rows in the schema and needs `fields:` (one per key of a row)');
          return;
        }
        checkFields(kind, field.fields, shape.item.fields, [...dataPath, 0], where);
      } else if (shape.item.kind === 'string') {
        if (field.fields !== undefined) problem(where, 'is a list of plain text in the schema: remove `fields:` (a row would be written as an object)');
        if (field.field !== undefined && !['string', 'text'].includes(field.field.widget)) {
          problem(where, 'is a list of plain text in the schema: its `field` must be a string or text field');
        }
        if (raw.pattern !== undefined) problem(where, 'must not carry a `pattern`: Sveltia tests it against all rows joined with commas');
      } else {
        problem(where, `holds ${shape.item.kind} values in the schema, which this check does not know how to map to a list field`);
      }
      return;
    }

    if (widget === 'object') {
      if (shape.kind !== 'object' || field.fields === undefined) {
        problem(where, 'needs `fields:` matching the schema');
        return;
      }
      checkFields(kind, field.fields, shape.fields, dataPath, where);
      return;
    }

    // -- text fields: string, text, image --
    if (!TEXT_WIDGETS.has(widget) || shape.kind !== 'string') return;
    summary.textFields += 1;

    if (!identity) {
      if (required) {
        problem(where, 'is optional in the schema: add `required: false`, so an item can be saved without it');
      }
      if (typeof raw.default !== 'string') problem(where, "needs an explicit `default: ''`");
      else if (!formAcceptsText(field, raw.default) || !schemaAccepts(kind, dataPath, raw.default.trim())) {
        problem(where, `has the default ${quote(raw.default)}, which is not a valid value for the field`);
      }
    }

    if (raw.pattern !== undefined) {
      const pattern = Array.isArray(raw.pattern) ? (raw.pattern as unknown[]) : [];
      if (pattern.length !== 2 || parsePattern(pattern[0]) === undefined) {
        problem(where, '`pattern` must be [regular expression, message] with a valid regular expression — Sveltia silently ignores anything else');
        return;
      }
      if (typeof pattern[1] !== 'string' || pattern[1].trim().length < 12) {
        problem(where, 'the second item of `pattern` is the message the owner sees: write a sentence that says what to type');
      }
    }
    for (const key of ['type', 'prefix', 'suffix', 'minlength', 'maxlength']) {
      if (raw[key] !== undefined) {
        problem(where, `\`${key}\` adds a rule (or text) of Sveltia's own that this check cannot compare with the schema — use \`pattern\` instead`);
      }
    }

    if (widget === 'image') {
      if (raw.multiple === true) problem(where, 'must not be `multiple`: the schema expects one image path');
      for (const key of ['media_folder', 'public_folder']) {
        if (raw[key] !== undefined) problem(where, `\`${key}\` must not be set: all uploads go to public/uploads, served at /uploads`);
      }
      for (const name of UPLOAD_NAME_SAMPLES) {
        if (!formAcceptsText(field, name)) {
          problem(
            where,
            `its pattern refuses the upload name "${name}". Sveltia tests a just-uploaded picture by its bare file name, so every upload to this field would be refused`,
          );
          break;
        }
      }
      if (!schemaAccepts(kind, dataPath, `/uploads/${UPLOAD_NAME_SAMPLES[0]}`)) {
        problem(where, 'the schema rejects "/uploads/<file>", the value an upload is saved as');
      }
    }

    for (const sample of TEXT_SAMPLES) {
      if (widget === 'image' && BARE_UPLOAD_NAME.test(sample.trim())) continue; // see BARE_UPLOAD_NAME
      const form = formAcceptsText(field, sample);
      const schema = schemaAccepts(kind, dataPath, sample.trim());
      if (form === schema) continue;
      problem(
        where,
        form
          ? `the form accepts ${quote(sample)} but the content check rejects it — the owner could save it and the deploy would stop. ${
              sample.trim() === '' ? 'Make the field required.' : 'Add or tighten the `pattern`.'
            }`
          : `the form refuses ${quote(sample)} but the content check accepts it — ${
              sample.trim() === '' ? 'the field is optional in the schema: add `required: false`.' : 'the `pattern` is stricter than the schema.'
            }`,
      );
      break; // one example per field is enough to act on
    }
  };

  const checkFields = (
    kind: ContentKind,
    fields: readonly FieldNode[],
    shapeFields: readonly ShapeField[],
    dataPath: DataPath,
    where: string,
  ): void => {
    const configNames = fields.map((field) => field.name);
    const schemaNames = shapeFields.map((field) => field.name);
    const missing = schemaNames.filter((name) => !configNames.includes(name));
    const extra = configNames.filter((name) => !schemaNames.includes(name));
    for (const name of missing) {
      problem(where, `the field "${name}" is in the schema but not in the config. The dashboard rewrites the whole file from this list, so "${name}" would be lost on the next save`);
    }
    for (const name of extra) {
      problem(where, `the field "${name}" is not in the schema. The dashboard would write it, the content check would reject the file, and the deploy would stop`);
    }
    if (missing.length === 0 && extra.length === 0 && configNames.join(',') !== schemaNames.join(',')) {
      problem(
        where,
        `the fields are in a different order than the schema. The dashboard writes keys in this order, so every save would reshuffle the file. Schema order: ${schemaNames.join(', ')}`,
      );
    }
    for (const field of fields) {
      const match = shapeFields.find((candidate) => candidate.name === field.name);
      if (match) checkLeaf(kind, field, match.shape, [...dataPath, field.name]);
    }
  };

  for (const kind of kinds) {
    const target = byKind.get(kind.id);
    if (!target || kind.shape.kind !== 'object') continue;
    checkFields(kind, target.fields, kind.shape.fields, [], target.label);

    // A page file's hidden id must be the name of its file (a cross-file rule of the schema).
    if (kind.id.startsWith('tracks/')) {
      const id = target.fields.find((field) => field.name === 'id');
      const expected = kind.id.slice('tracks/'.length);
      if (id && id.raw.default !== expected) problem(id.where, `must default to "${expected}", the name of the file it is in`);
      for (const name of ['id', 'route']) {
        const field = target.fields.find((candidate) => candidate.name === name);
        if (field && field.widget !== 'hidden' && field.raw.readonly !== true) {
          problem(field.where, 'must be hidden (or read-only): changing it breaks the page addresses and the site\'s code');
        }
      }
    }
  }

  // ---- the page that loads the dashboard -----------------------------------------------------
  const html = input.htmlText;
  const tagsOf = (name: string): string[] => Array.from(html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi')), (match) => match[0]);
  const attribute = (tag: string, name: string): string | undefined => {
    const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
    return match ? (match[1] ?? match[2]) : undefined;
  };
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const liveTags = (name: string): string[] => tagsOf(name).filter((tag) => withoutComments.includes(tag));

  const robots = liveTags('meta').filter((tag) => attribute(tag, 'name')?.toLowerCase() === 'robots');
  if (robots.length !== 1 || !/\bnoindex\b/i.test(attribute(robots[0] ?? '', 'content') ?? '')) {
    problem('<head>', 'needs exactly one <meta name="robots" content="noindex"> — it is the only thing that keeps the dashboard out of search results', files.html);
  }
  if (!/<title>[^<]+<\/title>/i.test(withoutComments)) problem('<head>', 'needs a <title>', files.html);

  const scripts = liveTags('script');
  const external = scripts.filter((tag) => /^(?:https?:)?\/\//i.test(attribute(tag, 'src') ?? ''));
  if (external.length !== 1) {
    problem('<script>', `must load exactly one script from another site, the pinned Sveltia CMS (found ${external.length})`, files.html);
  }
  for (const tag of external) {
    const src = attribute(tag, 'src') ?? '';
    const version = SCRIPT_URL.exec(src)?.[1];
    if (!version) {
      problem(
        '<script>',
        `"${src}" must be https://unpkg.com/@sveltia/cms@<exact version>/dist/sveltia-cms.js — an exact version, not "latest" and not a range`,
        files.html,
      );
      continue;
    }
    summary.version = version;
    const integrity = attribute(tag, 'integrity') ?? '';
    if (!/^sha(?:384|512)-[A-Za-z0-9+/]{64,88}={0,2}$/.test(integrity)) {
      problem('<script>', 'needs an `integrity="sha384-…"` attribute computed from that exact file (tsx scripts/validate-cms-config.ts --integrity)', files.html);
    }
    if (attribute(tag, 'crossorigin') !== 'anonymous') {
      problem('<script>', 'needs `crossorigin="anonymous"`, or the browser cannot check the integrity hash', files.html);
    }
    if (/\stype\s*=\s*["']module["']/i.test(tag)) problem('<script>', 'the Sveltia script is a classic script: remove type="module"', files.html);
    const schemaVersion = SCHEMA_COMMENT.exec(input.configText)?.[1];
    if (schemaVersion !== version) {
      problem(
        '(first line)',
        `the "# yaml-language-server: $schema=…@<version>…" comment must name version ${version}, the one ${files.html} loads (found ${quote(schemaVersion ?? null)})`,
      );
    }
  }
  for (const tag of scripts) {
    const src = attribute(tag, 'src');
    if (src === undefined) {
      problem('<script>', 'inline scripts are not used on this page — put the code in a file next to it', files.html);
    } else if (!/^(?:https?:)?\/\//i.test(src) && !input.adminFiles.includes(src.replace(/^\.\//, ''))) {
      problem('<script>', `loads "${src}", which is not a file in the admin folder`, files.html);
    }
  }
  for (const name of ['link', 'img', 'iframe', 'source', 'video', 'audio', 'embed', 'object']) {
    for (const tag of liveTags(name)) {
      const address = attribute(tag, 'href') ?? attribute(tag, 'src') ?? attribute(tag, 'data') ?? '';
      if (/^(?:https?:)?\/\//i.test(address)) problem(`<${name}>`, `loads "${address}" from another site — only the pinned Sveltia script may`, files.html);
    }
  }
  if (/<base\b/i.test(withoutComments)) problem('<base>', 'must not be used: the config and the scripts are found relative to the page', files.html);

  // ---- the content folder ---------------------------------------------------------------------
  if (!existsSync(input.contentDir) || !statSync(input.contentDir).isDirectory()) {
    problem('(content folder)', `was not found at ${input.contentDir}`, files.content);
  } else {
    const jsonFiles: string[] = [];
    walkJson(input.contentDir, '', jsonFiles);
    summary.contentFiles = jsonFiles.length;
    for (const relative of jsonFiles.sort()) {
      const repoPath = `${CONTENT_ROOT}/${relative}`;
      const owners = targets.filter((target) =>
        target.type === 'file'
          ? target.path === repoPath
          : repoPath.startsWith(`${target.path}/`) && !repoPath.slice(target.path.length + 1).includes('/'),
      );
      if (owners.length === 0) {
        problem(repoPath, 'is not editable in the dashboard: no file entry and no folder collection covers it', files.content);
      } else if (owners.length > 1) {
        problem(repoPath, `is covered by ${owners.length} dashboard entries (${owners.map((owner) => owner.label).join(', ')})`, files.content);
      }

      // Notes: values the form would refuse today (only possible after a hand edit).
      const owner = owners[0];
      if (owners.length !== 1 || !owner) continue;
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(path.join(input.contentDir, ...relative.split('/')), 'utf8').replace(/^﻿/, ''));
      } catch {
        continue; // validate:content reports unreadable files
      }
      const visit = (fields: readonly FieldNode[], value: unknown): void => {
        if (!isDict(value)) return;
        for (const field of fields) {
          const current = value[field.name];
          if (TEXT_WIDGETS.has(field.widget) && typeof current === 'string' && current.trim() !== '' && !formAcceptsText(field, current)) {
            notes.push({
              file: files.content,
              where: `${repoPath} › ${field.name}`,
              message: `holds ${quote(current)}, which the form's pattern refuses: the owner cannot save this item until the value is changed (${field.where})`,
            });
          }
          if (field.fields && Array.isArray(current)) current.forEach((row: unknown) => visit(field.fields ?? [], row));
          else if (field.fields) visit(field.fields, current);
        }
      };
      visit(owner.fields, data);
    }
  }

  return { ok: problems.length === 0, problems, notes, summary };
}

// ---------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------

function block(item: CmsProblem): string {
  return `  ${item.file}\n    where:   ${item.where}\n    problem: ${item.message}`;
}

export function formatCmsProblems(problems: readonly CmsProblem[]): string {
  const count = problems.length === 1 ? '1 problem' : `${problems.length} problems`;
  return `CMS config check failed — ${count}:\n\n${problems.map(block).join('\n\n')}\n`;
}

export function formatCmsNotes(notes: readonly CmsProblem[]): string {
  if (notes.length === 0) return '';
  return (
    `NOTE — ${notes.length === 1 ? '1 content value' : `${notes.length} content values`} the dashboard would refuse as typed today. ` +
    'This is not an error and nothing is blocked.\n\n' +
    `${notes.map((note) => `  ${note.where}\n    ${note.message}`).join('\n\n')}\n`
  );
}

// ---------------------------------------------------------------------------------------
// --integrity: the hash of a Sveltia release (needs the network)
// ---------------------------------------------------------------------------------------

const CDN_SOURCES = [
  (version: string) => `https://unpkg.com/@sveltia/cms@${version}/dist/sveltia-cms.js`,
  (version: string) => `https://cdn.jsdelivr.net/npm/@sveltia/cms@${version}/dist/sveltia-cms.js`,
];

async function printIntegrity(version: string): Promise<number> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`"${version}" is not an exact version such as 0.230.0`);
    return 2;
  }
  const hashes: string[] = [];
  for (const source of CDN_SOURCES) {
    const url = source(version);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`${url} answered ${response.status}`);
      return 1;
    }
    const body = Buffer.from(await response.arrayBuffer());
    const hash = `sha384-${createHash('sha384').update(body).digest('base64')}`;
    hashes.push(hash);
    console.log(`${url}\n  ${body.length} bytes\n  ${hash}`);
  }
  if (new Set(hashes).size !== 1) {
    console.error('\nThe two CDNs serve different files for this version. Do not use it until they agree.');
    return 1;
  }
  console.log(
    `\nBoth CDNs serve the same file. In public/admin/index.html use:\n` +
      `  src="${CDN_SOURCES[0]?.(version)}"\n  integrity="${hashes[0]}"\n` +
      `and put @${version} in the first line of public/admin/config.yml.`,
  );
  return 0;
}

// ---------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  config: string;
  html: string;
  deploy: string;
  content: string;
  integrity?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    config: path.join(repoRoot, 'public', 'admin', 'config.yml'),
    html: path.join(repoRoot, 'public', 'admin', 'index.html'),
    deploy: path.join(repoRoot, '.github', 'workflows', 'deploy.yml'),
    content: path.join(repoRoot, 'content'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--integrity') {
      args.integrity = next && !next.startsWith('--') ? next : '';
      if (args.integrity !== '') index += 1;
      continue;
    }
    if (arg === '--config' || arg === '--html' || arg === '--deploy' || arg === '--content') {
      if (!next) throw new Error(`${arg} needs a path`);
      args[arg.slice(2) as 'config' | 'html' | 'deploy' | 'content'] = path.resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function label(file: string): string {
  const relative = path.relative(repoRoot, file).split(path.sep).join('/');
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative) ? file : relative;
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: tsx scripts/validate-cms-config.ts [--config <file>] [--html <file>] [--deploy <file>] [--content <dir>] | --integrity [version]');
    return 2;
  }

  const read = (file: string): string | undefined => (existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : undefined);
  const htmlText = read(args.html);

  if (args.integrity !== undefined) {
    const pinned = SCRIPT_URL.exec(/<script\b[^>]*\ssrc\s*=\s*"([^"]+)"/i.exec(htmlText ?? '')?.[1] ?? '')?.[1];
    const version = args.integrity !== '' ? args.integrity : pinned;
    if (!version) {
      console.error('No version given and none is pinned in the admin page.');
      return 2;
    }
    return printIntegrity(version);
  }

  const configText = read(args.config);
  const deployText = read(args.deploy);
  const missing: CmsProblem[] = [];
  if (configText === undefined) missing.push({ file: label(args.config), where: '(file)', message: 'was not found' });
  if (htmlText === undefined) missing.push({ file: label(args.html), where: '(file)', message: 'was not found' });
  if (deployText === undefined) missing.push({ file: label(args.deploy), where: '(file)', message: 'was not found' });
  if (configText === undefined || htmlText === undefined || deployText === undefined) {
    console.error(formatCmsProblems(missing));
    return 1;
  }

  const adminDir = path.dirname(args.html);
  const result = checkCmsConfig({
    configText,
    htmlText,
    deployText,
    contentDir: args.content,
    adminFiles: readdirSync(adminDir),
    labels: { config: label(args.config), html: label(args.html), deploy: label(args.deploy), content: label(args.content) },
  });

  const inGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  if (!result.ok) {
    console.error(formatCmsProblems(result.problems));
    if (inGitHubActions) {
      for (const item of result.problems) {
        console.error(`::error file=${item.file},title=CMS config::${item.where}: ${item.message.replace(/\r?\n/g, ' ')}`);
      }
    }
    console.error('Nothing was deployed. The dashboard config has to agree with the content schema before the site is built.');
    if (result.notes.length > 0) console.log(`\n${formatCmsNotes(result.notes)}`);
    return 1;
  }

  const { summary } = result;
  console.log(
    [
      `CMS config OK — ${label(args.config)}`,
      `  Sveltia CMS ${summary.version}, pinned with an integrity hash; saves go to "${summary.branch}", the branch ${label(args.deploy)} deploys`,
      `  ${summary.kinds} kinds of content, ${summary.fields} fields match the schema (names, order, required, choices, defaults)`,
      `  ${summary.textFields} text fields agree with the schema on ${summary.samples} sample values each`,
      `  ${summary.contentFiles} content files, each editable in exactly one place`,
    ].join('\n'),
  );
  if (result.notes.length > 0) {
    console.log(`\n${formatCmsNotes(result.notes)}`);
    if (inGitHubActions) {
      for (const note of result.notes) console.log(`::notice title=Dashboard form::${note.where}: ${note.message.replace(/\r?\n/g, ' ')}`);
    }
  }
  return 0;
}

/** true when this file is the script being executed (the tests import its functions instead). */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const fold = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
  return fold(pathToFileURL(path.resolve(entry)).href) === fold(import.meta.url);
}

if (isEntryPoint()) {
  process.exitCode = await main();
}
