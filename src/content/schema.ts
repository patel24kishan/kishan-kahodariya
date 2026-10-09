/**
 * CONTENT SCHEMA — zod mirror of ./types.ts plus the rules that span several files.
 *
 * Pure module: no fs, no Vite, no browser APIs. It is used by
 *   - scripts/validate-content.ts   (CI gate before every deploy)
 *   - scripts/lib/content-plugin.ts (fails the dev server / the build on invalid content)
 *   - scripts/migrate-legacy.ts     (checks its own output before writing)
 *
 * It is never imported at runtime by the app (src/content/index.ts uses `import type` only),
 * so zod does not reach the client bundle.
 *
 * REJECT OR TIDY? A validation failure blocks a deploy, so only what the admin form can make
 * impossible at entry time is rejected. Everything else is tidied while the content is read:
 *
 * Rejected (an error):
 *   - an unknown field;
 *   - a missing, null or empty IDENTITY field: slug, the item's title / company / school /
 *     label, site name and "All" tab label, category id and label, track id, route, label and
 *     default tab, project category;
 *   - a wrong type, an unknown option, a broken URL / date / email, more than 4 hover words;
 *   - the cross-file rules (slug = file name, category exists, default tab exists, a resume
 *     for one tab names a real tab and is that tab's only row, …).
 *
 * Tidied (never an error; reported as a note):
 *   - any other field that is missing or null gets its default: "", [], false, 0, null for
 *     legacyId, and the neutral option for a choice field (audience "both", emphasis "none",
 *     link kind "other", icon "link"). So a missing `published` means NOT published;
 *   - blank entries (empty or only spaces) are dropped from text lists;
 *   - screenshot rows without a `src`, link rows with neither a label nor a URL and
 *     tab-resume rows without a `tab` are dropped;
 *   - a link without a footer position (`orderFooter`, added after the first content was
 *     written) keeps its place: it is read as the link's `order`.
 *   Text that is not blank is never changed — nothing is trimmed or rewritten.
 *
 * The parsed output therefore always has every field of ./types.ts.
 */
import { z } from 'zod';
import type { ContentBundle } from './bundle';
import type {
  Certificate,
  Education,
  Experience,
  Project,
  SiteSettings,
  SkillGroup,
  SocialLink,
  TrackProfile,
} from './types';

// ---------------------------------------------------------------------------------------
// Field rules (exported so the migration can apply exactly the same checks)
// ---------------------------------------------------------------------------------------

/** Id of the implicit "All" tab. Never stored as a category. */
export const ALL_TAB_ID = 'all';

/** Longest card hover text, in words. */
export const MAX_HOVER_WORDS = 4;

export const TRACK_IDS = ['game', 'softdev'] as const;

/** Folders under /content that hold one JSON file per item (file name = slug). */
export const COLLECTION_FOLDERS = [
  'projects',
  'experience',
  'skills',
  'links',
  'education',
  'certificates',
] as const;
export type CollectionFolder = (typeof COLLECTION_FOLDERS)[number];

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-case letters, digits and single hyphens: "paint-it-3d". */
export function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** Number of whitespace-separated words ("View Gameplay & Screenshots" is 4). */
export function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** "YYYY-MM" with a real month, or "". */
export function isYearMonth(value: string): boolean {
  return value === '' || YEAR_MONTH_PATTERN.test(value);
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s/]/i.test(value) || /\s/.test(value)) return false;
  try {
    return new URL(value).hostname !== '';
  } catch {
    return false;
  }
}

/** Site-root-relative path: starts with one "/" (never "//", which would be another host). */
function isRootRelativePath(value: string): boolean {
  return /^\/(?!\/)\S*$/.test(value);
}

/** Absolute http(s) address, or "". Used for the video field. */
export function isWebUrl(value: string): boolean {
  return value === '' || isHttpUrl(value);
}

/** Image / file reference: "", an http(s) address, or a site path starting with "/". */
export function isAssetPath(value: string): boolean {
  return value === '' || isHttpUrl(value) || isRootRelativePath(value);
}

/** Link target: "", an http(s) address, a mailto: address, or a site path starting with "/". */
export function isLinkUrl(value: string): boolean {
  if (value === '' || isHttpUrl(value) || isRootRelativePath(value)) return true;
  return /^mailto:/i.test(value) && EMAIL_PATTERN.test(value.slice('mailto:'.length));
}

// ---------------------------------------------------------------------------------------
// Tidying while reading (see "REJECT OR TIDY?" at the top)
// ---------------------------------------------------------------------------------------

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

/** Missing, null, empty or only spaces. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** A screenshot row without an image: abandoned, dropped. */
function isBlankScreenshotRow(row: unknown): boolean {
  return isBlank(valueAt(row, ['src']));
}

/** A link row with neither a label nor an address: dropped. A label with an empty address is kept. */
function isBlankLinkRow(row: unknown): boolean {
  return isBlank(valueAt(row, ['label'])) && isBlank(valueAt(row, ['url']));
}

/**
 * The lists of rows (objects) and their "abandoned row" rule, keyed by field name (unique in
 * the content model). Every other list holds text, where a blank entry is dropped. Used to
 * explain, in the notes, what the reader dropped.
 */
const ROW_IS_BLANK: Record<string, (row: unknown) => boolean> = {
  screenshots: isBlankScreenshotRow,
  links: isBlankLinkRow,
  tabResumes: isBlankTabResumeRow,
};

/** A "resume and summary for one tab" row that names no tab: it can never apply, dropped. */
function isBlankTabResumeRow(row: unknown): boolean {
  return isBlank(valueAt(row, ['tab']));
}

/**
 * Links written before the footer had an order of its own have no `orderFooter`. Such a link
 * keeps its place in the footer: the missing (or null) value is read as the link's `order`.
 */
function withFooterOrder(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const link = value as Record<string, unknown>;
  if (link.orderFooter !== undefined && link.orderFooter !== null) return value;
  return typeof link.order === 'number' ? { ...link, orderFooter: link.order } : value;
}

/** A missing or null value becomes the field's default; anything else is validated as it is. */
function orDefault<S extends z.ZodType>(schema: S, fallback: () => z.output<S>) {
  return z.preprocess((value) => (value === undefined || value === null ? fallback() : value), schema);
}

/** A list: missing or null becomes []; entries matching `isBlankEntry` are dropped. */
function listOf<S extends z.ZodType>(entry: S, isBlankEntry: (entry: unknown) => boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value.filter((item) => !isBlankEntry(item)) : value;
  }, z.array(entry));
}

// ---------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------

// Identity fields: always required, never defaulted.
const requiredText = z.string().refine((value) => value.trim() !== '', {
  error: 'must not be empty',
});

const slug = z.string().refine(isSlug, {
  error: 'must use only lower-case letters, digits and single hyphens (it is also the file name)',
});

// Everything else: a missing or null value is read as the default.
const text = orDefault(z.string(), () => '');
const flag = orDefault(z.boolean(), () => false);
const order = orDefault(z.number(), () => 0);

/** Text entries; blank ones are dropped, the others are kept exactly as written. */
const textList = listOf(z.string(), isBlank);

const linkUrl = orDefault(
  z.string().refine(isLinkUrl, {
    error:
      'must be empty, an address starting with https:// or http://, a mailto: address, or a site path starting with "/"',
  }),
  () => '',
);

const assetPath = orDefault(
  z.string().refine(isAssetPath, {
    error: 'must be empty, an address starting with https:// or http://, or a site path starting with "/"',
  }),
  () => '',
);

const webUrl = orDefault(
  z.string().refine(isWebUrl, {
    error: 'must be empty or an address starting with https:// or http://',
  }),
  () => '',
);

const yearMonth = orDefault(
  z.string().refine(isYearMonth, {
    error: 'must be a year and month written as YYYY-MM (for example 2024-06), or empty',
  }),
  () => '',
);

const hoverWords = orDefault(
  z.string().superRefine((value, ctx) => {
    const words = countWords(value);
    if (words > MAX_HOVER_WORDS) {
      ctx.addIssue({
        code: 'custom',
        message: `must be at most ${MAX_HOVER_WORDS} words (it has ${words})`,
      });
    }
  }),
  () => '',
);

const audience = orDefault(z.enum(['game', 'softdev', 'both']), () => 'both' as const);

// ---------------------------------------------------------------------------------------
// File schemas (one per kind of content file). Unknown keys are rejected.
// ---------------------------------------------------------------------------------------

export const categorySchema = z.strictObject({
  id: z.string().superRefine((value, ctx) => {
    if (!isSlug(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'must use only lower-case letters, digits and single hyphens (it is part of the page address)',
      });
    } else if (value === ALL_TAB_ID) {
      ctx.addIssue({ code: 'custom', message: `must not be "${ALL_TAB_ID}" (that tab always exists)` });
    }
  }),
  label: requiredText,
  order,
  hoverWithVideo: hoverWords,
  hoverWithoutVideo: hoverWords,
});

export const siteSchema = z
  .strictObject({
    name: requiredText,
    monogram: text,
    logo: assetPath,
    logoAlt: text,
    email: orDefault(
      z.string().refine((value) => value === '' || EMAIL_PATTERN.test(value), {
        error: 'must be empty or an email address',
      }),
      () => '',
    ),
    credit: textList,
    roles: textList,
    allTabLabel: requiredText,
    categories: orDefault(z.array(categorySchema), () => []),
  })
  .superRefine((site, ctx) => {
    const seen = new Map<string, number>();
    site.categories.forEach((category, index) => {
      const first = seen.get(category.id);
      if (first === undefined) {
        seen.set(category.id, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        message: `"${category.id}" is used by more than one category (each id must be unique)`,
        path: ['categories', index, 'id'],
      });
    });
  });

/**
 * The resume and/or the summary of one project tab. Whether `tab` names a real tab is a
 * cross-file rule (see validateContent). An empty `url` and an empty `summary` are both valid:
 * each part falls back to the page's own, so a row may set one, both, or (prepared, not used
 * yet) neither.
 */
export const tabResumeSchema = z.strictObject({
  tab: requiredText,
  url: webUrl,
  label: text,
  summary: text,
});

export const trackSchema = z
  .strictObject({
    id: z.enum(TRACK_IDS),
    route: z.string().refine(isSlug, {
      error: 'must use only lower-case letters, digits and single hyphens (it is part of the page address)',
    }),
    label: requiredText,
    headline: text,
    summary: text,
    resumeUrl: linkUrl,
    resumeLabel: text,
    tabResumes: listOf(tabResumeSchema, isBlankTabResumeRow),
    defaultTab: requiredText,
    photo: assetPath,
    photoAlt: text,
    certificatesFirst: flag,
    metaTitle: text,
    metaDescription: text,
  })
  .superRefine((track, ctx) => {
    // One row per tab: with two rows for one tab nobody could tell which one is used.
    const seen = new Set<string>();
    track.tabResumes.forEach((row, index) => {
      if (!seen.has(row.tab)) {
        seen.add(row.tab);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        message: `"${row.tab}" has more than one row (a tab can have only one row)`,
        path: ['tabResumes', index, 'tab'],
      });
    });
  });

export const mediaImageSchema = z.strictObject({
  src: assetPath,
  alt: text,
});

export const projectLinkSchema = z.strictObject({
  label: text,
  url: linkUrl,
  kind: orDefault(z.enum(['code', 'play', 'video', 'demo', 'store', 'other']), () => 'other' as const),
});

export const projectSchema = z.strictObject({
  slug,
  title: requiredText,
  shortDescription: text,
  longDescription: text,
  dateDisplay: text,
  tags: textList,
  category: requiredText,
  audience,
  featured: flag,
  /** Missing means NOT published: safer than publishing by accident. */
  published: flag,
  orderGame: order,
  orderSoftdev: order,
  hoverText: hoverWords,
  screenshots: listOf(mediaImageSchema, isBlankScreenshotRow),
  videoUrl: webUrl,
  links: listOf(projectLinkSchema, isBlankLinkRow),
  // null is this field's "not set" value, so only a missing key is filled in.
  legacyId: z.preprocess((value) => (value === undefined ? null : value), z.number().int().nullable()),
});

export const experienceSchema = z.strictObject({
  slug,
  company: requiredText,
  role: text,
  location: text,
  remote: flag,
  startDate: yearMonth,
  endDate: yearMonth,
  present: flag,
  dateDisplay: text,
  logo: assetPath,
  bullets: textList,
  bulletsGame: textList,
  bulletsSoftdev: textList,
  tags: textList,
  audience,
  orderGame: order,
  orderSoftdev: order,
  published: flag,
});

export const skillGroupSchema = z.strictObject({
  slug,
  title: requiredText,
  skills: textList,
  emphasis: orDefault(z.enum(['game', 'softdev', 'both', 'none']), () => 'none' as const),
  orderGame: order,
  orderSoftdev: order,
  published: flag,
});

export const socialLinkSchema = z.preprocess(
  withFooterOrder,
  z.strictObject({
    slug,
    label: requiredText,
    url: linkUrl,
    icon: orDefault(
      z.enum(['github', 'gitlab', 'linkedin', 'youtube', 'itchio', 'steam', 'email', 'blog', 'x', 'discord', 'link']),
      () => 'link' as const,
    ),
    audience,
    /** Position among the hero buttons. */
    order,
    /** Position among the footer links. Missing: read as `order` (see withFooterOrder). */
    orderFooter: order,
    showInHero: flag,
    showInFooter: flag,
    published: flag,
  }),
);

export const educationSchema = z.strictObject({
  slug,
  school: requiredText,
  degree: text,
  dateDisplay: text,
  grade: text,
  description: text,
  order,
  published: flag,
});

export const certificateSchema = z.strictObject({
  slug,
  title: requiredText,
  dateDisplay: text,
  description: text,
  image: assetPath,
  imageAlt: text,
  url: linkUrl,
  orderGame: order,
  orderSoftdev: order,
  published: flag,
});

// Compile-time proof that the schemas and ./types.ts describe the same shapes.
// If a field is added, removed or retyped on one side only, `tsc --noEmit` fails here.
// (z.infer is the PARSED shape: after tidying, every field of the type is present.)
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
export type SchemaMatchesTypes = [
  Expect<Same<z.infer<typeof siteSchema>, SiteSettings>>,
  Expect<Same<z.infer<typeof trackSchema>, TrackProfile>>,
  Expect<Same<z.infer<typeof projectSchema>, Project>>,
  Expect<Same<z.infer<typeof experienceSchema>, Experience>>,
  Expect<Same<z.infer<typeof skillGroupSchema>, SkillGroup>>,
  Expect<Same<z.infer<typeof socialLinkSchema>, SocialLink>>,
  Expect<Same<z.infer<typeof educationSchema>, Education>>,
  Expect<Same<z.infer<typeof certificateSchema>, Certificate>>,
];

// ---------------------------------------------------------------------------------------
// Whole-folder validation
// ---------------------------------------------------------------------------------------

/** One parsed JSON file. `path` is relative to the content folder, with forward slashes. */
export interface RawContentFile {
  path: string;
  data: unknown;
}

/** One problem, addressed to whoever edited the content. Blocks a deploy. */
export interface ContentIssue {
  /** Path relative to the content folder: "projects/scarfall.json". */
  file: string;
  /** Field inside the file ("links[1].url"), or "(file)" when the problem is the file itself. */
  field: string;
  message: string;
}

/**
 * Something that was tidied while reading a file that is otherwise valid: a default filled
 * in, a blank row dropped. Never an error and never blocks a deploy; it is reported so that
 * drift between the admin form and the content model stays visible.
 */
export interface ContentNote {
  file: string;
  field: string;
  message: string;
}

export type ContentValidation =
  | { ok: true; content: ContentBundle; issues: []; notes: ContentNote[] }
  | { ok: false; issues: ContentIssue[]; notes: ContentNote[] };

export interface ValidateContentOptions {
  /**
   * Files that exist but could not be parsed (already reported by the reader), so they are
   * not reported a second time as "missing".
   */
  unreadable?: readonly string[];
}

const FILE_FIELD = '(file)';
const REQUIRED_FIELD_MESSAGE = 'is required — it is missing or empty';
const LAYOUT_MESSAGE =
  'unexpected file — content files are site.json, tracks/game.json, tracks/softdev.json and ' +
  `<${COLLECTION_FOLDERS.join(' | ')}>/<slug>.json`;

function fieldPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out === '' ? String(key) : `.${String(key)}`;
  }
  return out === '' ? FILE_FIELD : out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Compares a file as written with the same file as read, and records every place where the
 * reader filled in a default or dropped a blank entry.
 */
function collectNotes(
  file: string,
  raw: unknown,
  parsed: unknown,
  path: readonly PropertyKey[],
  notes: ContentNote[],
): void {
  if (Array.isArray(parsed)) {
    if (!Array.isArray(raw)) return;
    const fieldName = [...path].reverse().find((key) => typeof key === 'string');
    const isBlankEntry = (typeof fieldName === 'string' ? ROW_IS_BLANK[fieldName] : undefined) ?? isBlank;
    const kept: { entry: unknown; index: number }[] = [];
    raw.forEach((entry: unknown, index) => {
      if (!isBlankEntry(entry)) kept.push({ entry, index });
    });
    const dropped = raw.length - parsed.length;
    if (dropped > 0) {
      notes.push({
        file,
        field: fieldPath(path),
        message: dropped === 1 ? '1 blank entry was dropped' : `${dropped} blank entries were dropped`,
      });
    }
    if (kept.length === parsed.length) {
      kept.forEach(({ entry, index }, position) => {
        collectNotes(file, entry, (parsed as unknown[])[position], [...path, index], notes);
      });
    }
    return;
  }
  if (!isRecord(parsed)) return;
  for (const [key, value] of Object.entries(parsed)) {
    const rawValue = isRecord(raw) ? raw[key] : undefined;
    if (rawValue === undefined || (rawValue === null && value !== null)) {
      // The one default with a visible effect: say it, so a hidden item is not a mystery.
      const hidden = path.length === 0 && key === 'published' ? ' — this item is NOT shown on the site' : '';
      notes.push({
        file,
        field: fieldPath([...path, key]),
        message: `was ${rawValue === null ? 'null' : 'missing'}, read as ${JSON.stringify(value)}${hidden}`,
      });
      continue;
    }
    collectNotes(file, rawValue, value, [...path, key], notes);
  }
}

function parseFile<T>(
  schema: z.ZodType<T>,
  file: RawContentFile,
  issues: ContentIssue[],
  notes: ContentNote[],
): T | undefined {
  if (!isRecord(file.data)) {
    issues.push({ file: file.path, field: FILE_FIELD, message: 'must contain one JSON object ({ … })' });
    return undefined;
  }
  const result = schema.safeParse(file.data);
  if (result.success) {
    collectNotes(file.path, file.data, result.data, [], notes);
    return result.data;
  }

  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        issues.push({
          file: file.path,
          field: fieldPath([...issue.path, key]),
          message: 'is not a field of this kind of content (remove it, or check the spelling)',
        });
      }
      continue;
    }
    // Only identity fields can still be absent here (the others were given their default).
    // zod words an absent value in several ways (wrong type, wrong option); name it plainly.
    const value = valueAt(file.data, issue.path);
    const absent = issue.path.length > 0 && (value === undefined || value === null);
    issues.push({
      file: file.path,
      field: fieldPath(issue.path),
      message: absent ? REQUIRED_FIELD_MESSAGE : issue.message,
    });
  }
  return undefined;
}

function isTrackId(value: string): value is (typeof TRACK_IDS)[number] {
  return (TRACK_IDS as readonly string[]).includes(value);
}

function isCollectionFolder(value: string): value is CollectionFolder {
  return (COLLECTION_FOLDERS as readonly string[]).includes(value);
}

/** A string property of a raw (not yet validated) file, or undefined. */
function rawString(data: unknown, key: string): string | undefined {
  const value = valueAt(data, [key]);
  return typeof value === 'string' ? value : undefined;
}

/** A value in one file that points at something defined in another file. */
interface Reference {
  file: string;
  value: string;
  /** Where the value sits in the file, when it is not a top-level field of its own name. */
  field?: string;
}

/**
 * Validates every file of a content folder and the rules that connect them:
 * - the folder layout (site.json, both track files, known collection folders only);
 * - each file against its schema (identity fields present, right types, URL / date / word
 *   rules, no unknown fields); other missing values and blank rows are tidied, not rejected;
 * - slug equals the file name; a track's id equals its file name;
 * - project.category is one of site.categories[].id;
 * - track.defaultTab is a category id or "all"; the two tracks use different routes;
 * - track.tabResumes[].tab is a category id or "all" (and, in the track's own schema, is
 *   used by one row only).
 *
 * The connecting rules are checked on the raw values, so one run reports them together with
 * any field problems of the same file. Returns the full, tidied bundle (unpublished items
 * included) when everything is valid, plus a note for everything that was tidied.
 */
export function validateContent(
  files: readonly RawContentFile[],
  options: ValidateContentOptions = {},
): ContentValidation {
  const issues: ContentIssue[] = [];
  const notes: ContentNote[] = [];
  const unreadable = new Set(options.unreadable ?? []);
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  let site: SiteSettings | undefined;
  let siteData: unknown;
  let siteFileSeen = unreadable.has('site.json');
  const trackFilesSeen = new Set<string>();
  const tracks: TrackProfile[] = [];
  const projects: Project[] = [];
  const experience: Experience[] = [];
  const skills: SkillGroup[] = [];
  const links: SocialLink[] = [];
  const education: Education[] = [];
  const certificates: Certificate[] = [];

  const categoryRefs: Reference[] = [];
  const defaultTabRefs: Reference[] = [];
  const tabResumeRefs: Reference[] = [];
  const routeRefs: Reference[] = [];

  /** Parses one collection file and checks that its slug is its file name. */
  function collect<T extends { slug: string }>(
    schema: z.ZodType<T>,
    file: RawContentFile,
    baseName: string,
    into: T[],
  ): void {
    const slugValue = rawString(file.data, 'slug');
    if (slugValue !== undefined && slugValue !== baseName) {
      issues.push({
        file: file.path,
        field: 'slug',
        message: `must be "${baseName}" to match the file name (it is "${slugValue}")`,
      });
    }
    const item = parseFile(schema, file, issues, notes);
    if (item) into.push(item);
  }

  for (const file of sorted) {
    if (file.path === 'site.json') {
      siteFileSeen = true;
      siteData = file.data;
      site = parseFile(siteSchema, file, issues, notes);
      continue;
    }

    const parts = file.path.split('/');
    const folder = parts[0] ?? '';
    const fileName = parts[1] ?? '';
    if (parts.length !== 2 || !fileName.endsWith('.json')) {
      issues.push({ file: file.path, field: FILE_FIELD, message: LAYOUT_MESSAGE });
      continue;
    }
    const baseName = fileName.slice(0, -'.json'.length);

    if (folder === 'tracks') {
      if (!isTrackId(baseName)) {
        issues.push({
          file: file.path,
          field: FILE_FIELD,
          message: 'unexpected file — the only track files are tracks/game.json and tracks/softdev.json',
        });
        continue;
      }
      trackFilesSeen.add(baseName);
      const idValue = rawString(file.data, 'id');
      if (idValue !== undefined && idValue !== baseName) {
        issues.push({
          file: file.path,
          field: 'id',
          message: `must be "${baseName}" to match the file name (it is "${idValue}")`,
        });
      }
      const defaultTab = rawString(file.data, 'defaultTab');
      if (defaultTab !== undefined && defaultTab.trim() !== '') {
        defaultTabRefs.push({ file: file.path, value: defaultTab });
      }
      const route = rawString(file.data, 'route');
      if (route !== undefined && route !== '') routeRefs.push({ file: file.path, value: route });
      const rawTabResumes = valueAt(file.data, ['tabResumes']);
      if (Array.isArray(rawTabResumes)) {
        // Numbered the way the reader numbers them: rows without a tab are dropped first.
        (rawTabResumes as unknown[])
          .filter((row) => !isBlankTabResumeRow(row))
          .forEach((row, index) => {
            const tab = rawString(row, 'tab');
            if (tab !== undefined) {
              tabResumeRefs.push({ file: file.path, value: tab, field: `tabResumes[${index}].tab` });
            }
          });
      }

      const track = parseFile(trackSchema, file, issues, notes);
      if (track) tracks.push(track);
      continue;
    }

    if (!isCollectionFolder(folder)) {
      issues.push({ file: file.path, field: FILE_FIELD, message: LAYOUT_MESSAGE });
      continue;
    }
    switch (folder) {
      case 'projects': {
        const category = rawString(file.data, 'category');
        if (category !== undefined && category.trim() !== '') {
          categoryRefs.push({ file: file.path, value: category });
        }
        collect(projectSchema, file, baseName, projects);
        break;
      }
      case 'experience':
        collect(experienceSchema, file, baseName, experience);
        break;
      case 'skills':
        collect(skillGroupSchema, file, baseName, skills);
        break;
      case 'links':
        collect(socialLinkSchema, file, baseName, links);
        break;
      case 'education':
        collect(educationSchema, file, baseName, education);
        break;
      case 'certificates':
        collect(certificateSchema, file, baseName, certificates);
        break;
    }
  }

  if (!siteFileSeen) {
    issues.push({ file: 'site.json', field: FILE_FIELD, message: 'this file is required but was not found' });
  }
  for (const id of TRACK_IDS) {
    const path = `tracks/${id}.json`;
    if (!trackFilesSeen.has(id) && !unreadable.has(path)) {
      issues.push({ file: path, field: FILE_FIELD, message: 'this file is required but was not found' });
    }
  }

  // Rules that need the category list. It is read from the raw site.json, so these rules
  // still run when site.json has a problem somewhere else. Without a readable list they are
  // skipped: the site.json problem is already reported. A site.json without a `categories`
  // key has no categories.
  const rawCategories = isRecord(siteData) ? (siteData.categories ?? []) : undefined;
  if (Array.isArray(rawCategories)) {
    const categoryIds: string[] = [];
    for (const category of rawCategories as unknown[]) {
      const id = rawString(category, 'id');
      if (id !== undefined) categoryIds.push(id);
    }
    const known = categoryIds.length > 0 ? categoryIds.map((id) => `"${id}"`).join(', ') : 'none';
    for (const { file, value } of categoryRefs) {
      if (!categoryIds.includes(value)) {
        issues.push({
          file,
          field: 'category',
          message: `"${value}" is not a category id from site.json (known ids: ${known})`,
        });
      }
    }
    for (const { file, value } of defaultTabRefs) {
      if (value !== ALL_TAB_ID && !categoryIds.includes(value)) {
        issues.push({
          file,
          field: 'defaultTab',
          message: `"${value}" must be a category id from site.json (known ids: ${known}) or "${ALL_TAB_ID}"`,
        });
      }
    }
    for (const { file, value, field } of tabResumeRefs) {
      if (value !== ALL_TAB_ID && !categoryIds.includes(value)) {
        issues.push({
          file,
          field: field ?? 'tabResumes',
          message: `"${value}" must be a category id from site.json (known ids: ${known}) or "${ALL_TAB_ID}"`,
        });
      }
    }
  }

  // The two pages need different addresses.
  const routeOwner = new Map<string, string>();
  for (const { file, value } of routeRefs) {
    const other = routeOwner.get(value);
    if (other !== undefined) {
      issues.push({ file, field: 'route', message: `"${value}" is already used by ${other}` });
    } else {
      routeOwner.set(value, file);
    }
  }

  if (issues.length > 0 || !site) return { ok: false, issues, notes };

  return {
    ok: true,
    issues: [],
    notes,
    content: {
      site,
      tracks: TRACK_IDS.flatMap((id) => tracks.filter((track) => track.id === id)),
      projects,
      experience,
      skills,
      links,
      education,
      certificates,
    },
  };
}
