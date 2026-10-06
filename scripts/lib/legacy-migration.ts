/**
 * Migration logic: legacy/constants.js (the old site's content) → the files under /content,
 * following the migration table in ARCHITECTURE.md section 4.
 *
 * Pure: takes the legacy data, returns the files to write and the owner-facing report.
 * The command-line wrapper (reading the legacy file, the overwrite guard, writing to disk)
 * is scripts/migrate-legacy.ts.
 *
 * Rules that shape this file
 * - The owner's text is never rewritten, fixed or invented. Typos stay.
 * - Doubtful values are kept, or stored as `url: ""` when they cannot work as a link, and
 *   every one of them is listed in the report.
 * - The legacy certificate descriptions are NOT read at all (the legacy schema below has no
 *   `description` key for certificates): they are an unrelated placeholder containing test
 *   login credentials and must not be copied anywhere.
 */
import { z } from 'zod';
import {
  isAssetPath,
  isLinkUrl,
  validateContent,
  type ContentIssue,
  type RawContentFile,
} from '../../src/content/schema';
import type {
  Audience,
  Certificate,
  Education,
  Experience,
  LinkIcon,
  Project,
  ProjectLink,
  ProjectLinkKind,
  SiteSettings,
  SkillGroup,
  SocialLink,
  TrackProfile,
} from '../../src/content/types';

// ---------------------------------------------------------------------------------------
// Legacy shapes (only the keys that are migrated or reported)
// ---------------------------------------------------------------------------------------

const legacyProjectSchema = z.object({
  id: z.number(),
  title: z.string(),
  date: z.string(),
  description: z.string(),
  image: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
  github: z.string(),
  action: z.string(),
  actionBtn: z.string(),
});
export type LegacyProject = z.infer<typeof legacyProjectSchema>;

export const legacySchema = z.object({
  Bio: z.object({
    name: z.string(),
    roles: z.array(z.string()),
    description: z.string(),
    github: z.string(),
    resume_gamedeveloper: z.string(),
    resume_softwaredeveloper: z.string(),
    linkedin: z.string(),
    email: z.string(),
    twitter: z.string(),
    itchio: z.string(),
    discord: z.string(),
    facebook: z.string(),
    blog: z.string(),
  }),
  skills: z.array(
    z.object({
      title: z.string(),
      skills: z.array(z.object({ name: z.string(), image: z.string() })),
    }),
  ),
  experiences: z.array(
    z.object({
      id: z.number(),
      img: z.string(),
      role: z.string(),
      company: z.string(),
      date: z.string(),
      desc: z.string(),
      skills: z.array(z.string()),
      doc: z.string(),
    }),
  ),
  projects: z.array(legacyProjectSchema),
  education: z.array(
    z.object({
      id: z.number(),
      img: z.string(),
      school: z.string(),
      date: z.string(),
      grade: z.string(),
      desc: z.string(),
      degree: z.string(),
    }),
  ),
  // No `description` on purpose — see the header comment.
  certificate: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      date: z.string(),
      image: z.string(),
      certificate_url: z.string(),
    }),
  ),
});
export type LegacyData = z.infer<typeof legacySchema>;

/**
 * The "Unity Tools" project sits inside a comment in legacy/constants.js, so importing the
 * file does not return it. Its data is copied here by hand, character for character, and it
 * is migrated with `published: false`. `afterTitle` is the project it follows in the file,
 * which gives it its legacy position.
 */
export const COMMENTED_OUT_PROJECTS: readonly { afterTitle: string; project: LegacyProject }[] = [
  {
    afterTitle: 'Paint it 3D',
    project: {
      id: 5,
      title: 'Unity Tools',
      date: 'Dec 2023 - Jan 2024',
      description: 'Acquiring Unity tool proficiency :- Unity cloud save and Addressable.',
      image: 'https://img.itch.zone/aW1nLzYwNjU4MDUuanBn/original/%2BMEce%2B.jpg',
      tags: ['Unity', 'C#', 'Unity Cloud', 'Addressables', 'Telemetry', 'Git'],
      category: 'unity',
      github: 'https://github.com/patel24kishan/Unity-Tool-Demo',
      action: '',
      actionBtn: '',
    },
  },
];

// ---------------------------------------------------------------------------------------
// Values that do not come from legacy/constants.js (architect's seed, old nav/footer text)
// ---------------------------------------------------------------------------------------

const SITE_NAME = 'Kishan Kahodariya';
const SITE_MONOGRAM = 'KK';
/** Text of the old site's footer. */
const SITE_CREDIT = ['Developed by Kishan Kahodariya.', '© All rights reserved.'];
const ALL_TAB_LABEL = 'All';

const CATEGORIES: SiteSettings['categories'] = [
  { id: 'unreal', label: 'Unreal', order: 10, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
  { id: 'unity', label: 'Unity3D', order: 20, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
  { id: 'webapps', label: 'Web Apps', order: 30, hoverWithVideo: 'View Demo & Screenshots', hoverWithoutVideo: 'View Screenshots' },
];

/** Legacy project category → new category id and the page it belongs to. */
const CATEGORY_MAP: Record<string, { category: string; audience: Audience }> = {
  unreal: { category: 'unreal', audience: 'game' },
  unity: { category: 'unity', audience: 'game' },
  webapp: { category: 'webapps', audience: 'softdev' },
};

const PROFILE_PHOTO = '/images/profile.jpg';

const CODE_LINK_LABEL = 'View Code';

/** Bio keys that become link files, in display order. Empty ones are skipped and listed. */
const BIO_LINKS: readonly {
  key: 'itchio' | 'github' | 'linkedin' | 'blog' | 'email' | 'twitter' | 'discord' | 'facebook';
  label: string;
  icon: LinkIcon;
  audience: Audience;
  showInHero: boolean;
  showInFooter: boolean;
}[] = [
  { key: 'itchio', label: 'itch.io', icon: 'itchio', audience: 'game', showInHero: true, showInFooter: true },
  { key: 'github', label: 'GitHub', icon: 'github', audience: 'both', showInHero: true, showInFooter: true },
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', audience: 'both', showInHero: true, showInFooter: true },
  { key: 'blog', label: 'Blog', icon: 'blog', audience: 'both', showInHero: false, showInFooter: true },
  { key: 'email', label: 'Email', icon: 'email', audience: 'both', showInHero: false, showInFooter: true },
  { key: 'twitter', label: 'X', icon: 'x', audience: 'both', showInHero: false, showInFooter: true },
  { key: 'discord', label: 'Discord', icon: 'discord', audience: 'both', showInHero: false, showInFooter: true },
  { key: 'facebook', label: 'Facebook', icon: 'link', audience: 'both', showInHero: false, showInFooter: true },
];

const SKILL_ORDER_GAME = ['Game Dev', 'Programming', 'Backend', 'Cloud'];
const SKILL_ORDER_SOFTDEV = ['Backend', 'Cloud', 'Programming', 'Game Dev'];
const SKILL_EMPHASIS: Record<string, SkillGroup['emphasis']> = {
  'Game Dev': 'game',
  Programming: 'game',
  Backend: 'softdev',
  Cloud: 'softdev',
};

const EXPERIENCE_AUDIENCE: readonly { match: RegExp; audience: Audience }[] = [
  { match: /astro/i, audience: 'game' },
  { match: /helpupdefend/i, audience: 'game' },
  { match: /xsquad/i, audience: 'game' },
  { match: /ibm/i, audience: 'softdev' },
  { match: /achievers/i, audience: 'softdev' },
];

/** Words that look misspelled in the old text. Reported only; the text is kept as written. */
const SPELLING_NOTES: readonly { where: string; word: string }[] = [
  { where: 'Dating Square', word: 'Developd' },
  { where: 'OuiChef', word: 'palyer' },
  { where: 'Crypto Tracker', word: 'currenccies' },
  { where: 'Crypto Tracker', word: 'userful' },
  { where: 'Crypto Tracker', word: 'visulize' },
  { where: 'Crypto Tracker', word: 'time perio using' },
  { where: 'Xsquad Studios by Escrow Infotech', word: 'developDeveloped' },
];

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    // Drop accent marks left behind by the decomposition above ("é" → "e").
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(base: string, used: Set<string>, fallback: string): string {
  const root = base === '' ? fallback : base;
  let candidate = root;
  for (let n = 2; used.has(candidate); n += 1) candidate = `${root}-${n}`;
  used.add(candidate);
  return candidate;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** Is this a YouTube address, and does it have one of the standard video shapes? */
function youtubeInfo(url: string): { isYouTube: boolean; standard: boolean } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { isYouTube: false, standard: false };
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return { isYouTube: false, standard: false };
  if (parsed.hostname.endsWith('youtu.be')) {
    return { isYouTube: true, standard: parsed.pathname.length > 1 };
  }
  const standard =
    (parsed.pathname === '/watch' && (parsed.searchParams.get('v') ?? '') !== '') ||
    /^\/(embed|shorts|live|v)\/[^/]+/.test(parsed.pathname);
  return { isYouTube: true, standard };
}

/** Icon / meaning of a project button, derived from where it points and what it says. */
function linkKind(label: string, url: string): ProjectLinkKind {
  const host = hostOf(url);
  if (host === 'apps.apple.com' || host === 'play.google.com') return 'store';
  if (host === 'itch.io' || host.endsWith('.itch.io')) return 'play';
  switch (label.trim().toLowerCase()) {
    case 'play':
      return 'play';
    case 'play store':
      return 'store';
    case 'watch':
    case 'gameplay':
      return 'video';
    case 'website':
      return 'demo';
    default:
      return 'other';
  }
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

interface DatePoint {
  month?: number;
  year?: number;
  present: boolean;
}

function parseDatePoint(value: string): DatePoint {
  const point: DatePoint = { present: /^(present|current|now)$/i.test(value.trim()) };
  for (const word of value.trim().split(/[\s,]+/)) {
    const month = MONTHS[word.toLowerCase().replace(/\.$/, '')];
    if (month !== undefined) point.month = month;
    else if (/^\d{4}$/.test(word)) point.year = Number(word);
  }
  return point;
}

function yearMonth(point: DatePoint): string {
  if (point.year === undefined || point.month === undefined) return '';
  return `${point.year}-${String(point.month).padStart(2, '0')}`;
}

export interface ParsedDateRange {
  startDate: string;
  endDate: string;
  present: boolean;
  /** Plain-language remarks about anything that was assumed or could not be read. */
  notes: string[];
}

/** Best-effort reading of a free-text date such as "May - August 2022" or "June 2024 - Present". */
export function parseDateRange(display: string): ParsedDateRange {
  const notes: string[] = [];
  const parts = display.split(/\s+[-–—]\s+|\s+to\s+/i);
  const start = parseDatePoint(parts[0] ?? '');
  const end = parts.length > 1 ? parseDatePoint(parts[parts.length - 1] ?? '') : undefined;

  if (start.year === undefined && start.month !== undefined && end?.year !== undefined) {
    start.year = end.year;
    notes.push(`the start has no year in the old text; ${end.year} was assumed from the end date`);
  }
  const startDate = yearMonth(start);
  const present = end?.present ?? false;
  const endDate = end && !present ? yearMonth(end) : '';

  if (startDate === '') notes.push('the start month could not be read; start date left empty');
  if (end && !present && endDate === '') notes.push('the end month could not be read; end date left empty');
  if (!end) notes.push('only one date in the old text; end date left empty');
  return { startDate, endDate, present, notes };
}

function monthIndex(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : undefined;
}

function quote(value: string): string {
  return `"${value}"`;
}

function code(value: string): string {
  return `\`${value}\``;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Groups the keys that share one value: returns only the groups with two or more keys. */
function duplicates<T>(entries: readonly { key: string; value: T }[]): { value: T; keys: string[] }[] {
  const groups = new Map<T, string[]>();
  for (const { key, value } of entries) {
    const keys = groups.get(value);
    if (keys) keys.push(key);
    else groups.set(value, [key]);
  }
  return [...groups.entries()].filter(([, keys]) => keys.length > 1).map(([value, keys]) => ({ value, keys }));
}

// ---------------------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------------------

export interface MigrationCounts {
  /** Projects that were live in the old site / are published in the new content. */
  projectsPublished: number;
  /** Projects that were commented out in the old site / are unpublished in the new content. */
  projectsUnpublished: number;
  experience: number;
  skillGroups: number;
  skills: number;
  education: number;
  certificates: number;
  /** Bio links with a value (github, linkedin, itchio, blog, email, …) / link files. */
  links: number;
  resumeLinks: number;
}

export interface MigrationResult {
  /** Content files to write; `path` is relative to the content folder. */
  files: RawContentFile[];
  /** Markdown for docs/migration-report.md. */
  report: string;
  source: MigrationCounts;
  migrated: MigrationCounts & { tracks: number; site: number; files: number };
}

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly ContentIssue[] = [],
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export function migrateLegacy(input: unknown): MigrationResult {
  const parsed = legacySchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.map(String).join('.') || '(module)'}: ${issue.message}`)
      .join('\n');
    throw new MigrationError(`legacy/constants.js does not have the expected exports:\n${details}`);
  }
  const legacy = parsed.data;
  const { Bio } = legacy;

  /** Review items for the report, in order. */
  const review: string[] = [];

  // --- Projects: put the commented-out ones back at their position in the file ----------
  interface SourceProject {
    legacy: LegacyProject;
    published: boolean;
  }
  const sourceProjects: SourceProject[] = legacy.projects.map((project) => ({ legacy: project, published: true }));
  for (const { afterTitle, project } of COMMENTED_OUT_PROJECTS) {
    if (sourceProjects.some((entry) => entry.legacy.title === project.title)) continue; // no longer commented out
    const index = sourceProjects.findIndex((entry) => entry.legacy.title === afterTitle);
    const entry: SourceProject = { legacy: project, published: false };
    if (index === -1) sourceProjects.push(entry);
    else sourceProjects.splice(index + 1, 0, entry);
  }

  const projectSlugs = new Set<string>();
  const projects: Project[] = [];
  const invalidCodeLinks: string[] = [];
  const missingCodeLinks: string[] = [];
  const labelsWithoutUrl: string[] = [];
  const invalidActionLinks: string[] = [];
  const malformedVideos: string[] = [];
  const videoProjects: { title: string; label: string }[] = [];
  const mismatchedLabels: string[] = [];
  const capitalLabels: string[] = [];
  const removedEmptyTags: string[] = [];
  const duplicateProjectTags: string[] = [];
  const unknownCategories: string[] = [];
  const paddedDescriptions: string[] = [];
  const unusableImages: string[] = [];
  const derivedKinds: string[] = [];

  sourceProjects.forEach(({ legacy: source, published }, index) => {
    const position = (index + 1) * 10;
    const mapped = CATEGORY_MAP[source.category];
    if (!mapped) unknownCategories.push(`${source.title} (${quote(source.category)})`);

    const tags = source.tags.filter((tag) => tag.trim() !== '');
    if (tags.length !== source.tags.length) {
      removedEmptyTags.push(`${source.title} (${plural(source.tags.length - tags.length, 'empty tag', 'empty tags')})`);
    }
    for (const group of duplicates(tags.map((tag, i) => ({ key: String(i), value: tag })))) {
      duplicateProjectTags.push(`${source.title}: ${quote(group.value)} appears ${group.keys.length} times`);
    }

    if (source.description !== source.description.trim()) paddedDescriptions.push(source.title);

    const screenshots: Project['screenshots'] = [];
    if (source.image !== '') {
      if (isAssetPath(source.image)) screenshots.push({ src: source.image, alt: `${source.title} cover image` });
      else unusableImages.push(`${source.title}: ${code(source.image)}`);
    }

    const links: ProjectLink[] = [];
    // Code link: always present so the owner can fill it in; "" hides the button.
    if (source.github === '') {
      missingCodeLinks.push(source.title);
      links.push({ label: CODE_LINK_LABEL, url: '', kind: 'code' });
    } else if (isLinkUrl(source.github)) {
      links.push({ label: CODE_LINK_LABEL, url: source.github, kind: 'code' });
    } else {
      invalidCodeLinks.push(`${source.title}: the old value was ${code(source.github)}`);
      links.push({ label: CODE_LINK_LABEL, url: '', kind: 'code' });
    }

    // Action button: a YouTube address becomes the video, anything else becomes a link.
    let videoUrl = '';
    const video = youtubeInfo(source.action);
    if (source.action !== '' && video.isYouTube) {
      videoUrl = source.action;
      videoProjects.push({ title: source.title, label: source.actionBtn });
      if (!video.standard) malformedVideos.push(`${source.title}: ${code(source.action)}`);
    } else if (source.action !== '' || source.actionBtn !== '') {
      const kind = linkKind(source.actionBtn, source.action);
      if (source.action === '') {
        labelsWithoutUrl.push(`${source.title} (${quote(source.actionBtn)})`);
        links.push({ label: source.actionBtn, url: '', kind });
      } else if (!isLinkUrl(source.action)) {
        invalidActionLinks.push(`${source.title}: button ${quote(source.actionBtn)}, old value ${code(source.action)}`);
        links.push({ label: source.actionBtn, url: '', kind });
      } else {
        links.push({ label: source.actionBtn, url: source.action, kind });
        derivedKinds.push(`${source.title} ${quote(source.actionBtn)} → ${kind}`);
        if (/^(gameplay|watch)$/i.test(source.actionBtn.trim())) {
          mismatchedLabels.push(
            `${source.title}: the button says ${quote(source.actionBtn)} but points to ${code(source.action)}, which is not a YouTube address. It was kept as a normal link button with the same label, not as a video.`,
          );
        }
      }
      const letters = source.actionBtn.replace(/[^A-Za-z]/g, '');
      if (letters.length > 1 && letters === letters.toUpperCase()) {
        capitalLabels.push(`${source.title} (${quote(source.actionBtn)})`);
      }
    }

    projects.push({
      slug: uniqueSlug(slugify(source.title), projectSlugs, `project-${index + 1}`),
      title: source.title,
      shortDescription: source.description,
      longDescription: '',
      dateDisplay: source.date,
      tags,
      category: mapped?.category ?? source.category,
      audience: mapped?.audience ?? 'both',
      featured: false,
      published,
      orderGame: position,
      orderSoftdev: position,
      hoverText: '',
      screenshots,
      videoUrl,
      links,
      legacyId: source.id,
    });
  });

  // --- Experience -----------------------------------------------------------------------
  const experienceSlugs = new Set<string>();
  const experience: Experience[] = [];
  const experienceDateRows: string[] = [];
  const removedDuplicateTags: string[] = [];
  const unmappedAudience: string[] = [];
  const unusableLogos: string[] = [];
  const nonEmptyDocs: string[] = [];

  legacy.experiences.forEach((source, index) => {
    const position = (index + 1) * 10;
    const dates = parseDateRange(source.date);
    experienceDateRows.push(
      `${source.company}: ${quote(source.date)} → start ${dates.startDate || '(empty)'}, end ${
        dates.present ? '(none, marked as present)' : dates.endDate || '(empty)'
      }${dates.notes.length > 0 ? ` — ${dates.notes.join('; ')}` : ''}`,
    );

    const tags: string[] = [];
    const dropped: string[] = [];
    for (const tag of source.skills) {
      if (tag.trim() === '') continue;
      if (tags.includes(tag)) dropped.push(tag);
      else tags.push(tag);
    }
    if (dropped.length > 0) {
      removedDuplicateTags.push(`${source.company}: ${dropped.map(quote).join(', ')} was listed twice`);
    }

    const mapped = EXPERIENCE_AUDIENCE.find((rule) => rule.match.test(source.company));
    if (!mapped) unmappedAudience.push(source.company);

    let logo = source.img;
    if (!isAssetPath(logo)) {
      unusableLogos.push(`${source.company}: ${code(source.img)}`);
      logo = '';
    }
    if (source.doc !== '') nonEmptyDocs.push(`${source.company}: ${code(source.doc)}`);

    experience.push({
      slug: uniqueSlug(slugify(source.company), experienceSlugs, `experience-${index + 1}`),
      company: source.company,
      role: source.role,
      location: '',
      remote: false,
      startDate: dates.startDate,
      endDate: dates.endDate,
      present: dates.present,
      dateDisplay: source.date,
      logo,
      bullets: source.desc.trim() === '' ? [] : [source.desc],
      bulletsGame: [],
      bulletsSoftdev: [],
      tags,
      audience: mapped?.audience ?? 'both',
      orderGame: position,
      orderSoftdev: position,
      published: true,
    });
  });

  // --- Skills ---------------------------------------------------------------------------
  const skillSlugs = new Set<string>();
  const droppedIcons: string[] = [];
  const skills: SkillGroup[] = legacy.skills.map((group, index) => {
    for (const skill of group.skills) {
      if (skill.image === '') continue;
      const shown = skill.image.startsWith('data:') ? 'an image embedded in the file (data: address)' : code(skill.image);
      droppedIcons.push(`${group.title} / ${skill.name}: ${shown}`);
    }
    const gameIndex = SKILL_ORDER_GAME.indexOf(group.title);
    const softdevIndex = SKILL_ORDER_SOFTDEV.indexOf(group.title);
    const fallback = (legacy.skills.length + index + 1) * 10;
    return {
      slug: uniqueSlug(slugify(group.title), skillSlugs, `skills-${index + 1}`),
      title: group.title,
      skills: group.skills.map((skill) => skill.name).filter((name) => name.trim() !== ''),
      emphasis: SKILL_EMPHASIS[group.title] ?? 'none',
      orderGame: gameIndex === -1 ? fallback : (gameIndex + 1) * 10,
      orderSoftdev: softdevIndex === -1 ? fallback : (softdevIndex + 1) * 10,
      published: true,
    };
  });

  // --- Links ----------------------------------------------------------------------------
  const links: SocialLink[] = [];
  const skippedLinks: string[] = [];
  const invalidBioLinks: string[] = [];
  for (const spec of BIO_LINKS) {
    const value = Bio[spec.key];
    if (value.trim() === '') {
      skippedLinks.push(spec.key);
      continue;
    }
    let url = spec.key === 'email' ? `mailto:${value}` : value;
    if (!isLinkUrl(url)) {
      invalidBioLinks.push(`${spec.key}: the old value was ${code(value)}`);
      url = '';
    }
    links.push({
      slug: spec.key,
      label: spec.label,
      url,
      icon: spec.icon,
      audience: spec.audience,
      order: (links.length + 1) * 10,
      showInHero: spec.showInHero,
      showInFooter: spec.showInFooter,
      published: true,
    });
  }

  // --- Education ------------------------------------------------------------------------
  const educationSlugs = new Set<string>();
  const droppedEducationImages: string[] = [];
  const education: Education[] = legacy.education.map((source, index) => {
    if (source.img !== '') droppedEducationImages.push(`${source.school}: ${code(source.img)}`);
    return {
      slug: uniqueSlug(slugify(source.school), educationSlugs, `education-${index + 1}`),
      school: source.school,
      degree: source.degree,
      dateDisplay: source.date,
      grade: source.grade,
      description: source.desc,
      order: (index + 1) * 10,
      published: true,
    };
  });

  // --- Certificates ---------------------------------------------------------------------
  const certificateSlugs = new Set<string>();
  const unusableCertificateValues: string[] = [];
  const certificates: Certificate[] = legacy.certificate.map((source, index) => {
    let image = source.image;
    if (!isAssetPath(image)) {
      unusableCertificateValues.push(`${source.title}: image ${code(source.image)}`);
      image = '';
    }
    let url = source.certificate_url;
    if (!isLinkUrl(url)) {
      unusableCertificateValues.push(`${source.title}: link ${code(source.certificate_url)}`);
      url = '';
    }
    return {
      slug: uniqueSlug(slugify(source.title), certificateSlugs, `certificate-${index + 1}`),
      title: source.title,
      dateDisplay: source.date,
      description: '',
      image,
      imageAlt: `${source.title} badge`,
      url,
      orderGame: (index + 1) * 10,
      orderSoftdev: (index + 1) * 10,
      published: true,
    };
  });

  // --- Site and tracks ------------------------------------------------------------------
  const emailIsValid = isLinkUrl(`mailto:${Bio.email}`);
  const site: SiteSettings = {
    name: SITE_NAME,
    monogram: SITE_MONOGRAM,
    email: emailIsValid ? Bio.email : '',
    credit: [...SITE_CREDIT],
    roles: Bio.roles.filter((role) => role.trim() !== ''),
    allTabLabel: ALL_TAB_LABEL,
    categories: CATEGORIES.map((category) => ({ ...category })),
  };

  const invalidResumes: string[] = [];
  const resumeUrl = (label: string, value: string): string => {
    if (isLinkUrl(value)) return value;
    invalidResumes.push(`${label}: the old value was ${code(value)}`);
    return '';
  };
  const tracks: TrackProfile[] = [
    {
      id: 'game',
      route: 'gamedev',
      label: 'Game Dev',
      headline: 'Game Developer',
      summary: Bio.description,
      resumeUrl: resumeUrl('Game page resume', Bio.resume_gamedeveloper),
      resumeLabel: 'Game Dev Resume',
      defaultTab: 'unity',
      photo: PROFILE_PHOTO,
      photoAlt: SITE_NAME,
      certificatesFirst: false,
      metaTitle: `${SITE_NAME} — Game Developer`,
      metaDescription: '',
    },
    {
      id: 'softdev',
      route: 'softdev',
      label: 'Software',
      headline: 'Software Engineer',
      summary: Bio.description,
      resumeUrl: resumeUrl('Software page resume', Bio.resume_softwaredeveloper),
      resumeLabel: 'Software Resume',
      defaultTab: 'webapps',
      photo: PROFILE_PHOTO,
      photoAlt: SITE_NAME,
      certificatesFirst: true,
      metaTitle: `${SITE_NAME} — Software Engineer`,
      metaDescription: '',
    },
  ];

  // --- Files ----------------------------------------------------------------------------
  const files: RawContentFile[] = [
    { path: 'site.json', data: site },
    ...tracks.map((track) => ({ path: `tracks/${track.id}.json`, data: track })),
    ...projects.map((item) => ({ path: `projects/${item.slug}.json`, data: item })),
    ...experience.map((item) => ({ path: `experience/${item.slug}.json`, data: item })),
    ...skills.map((item) => ({ path: `skills/${item.slug}.json`, data: item })),
    ...links.map((item) => ({ path: `links/${item.slug}.json`, data: item })),
    ...education.map((item) => ({ path: `education/${item.slug}.json`, data: item })),
    ...certificates.map((item) => ({ path: `certificates/${item.slug}.json`, data: item })),
  ];

  const validation = validateContent(files);
  if (!validation.ok) {
    throw new MigrationError('The migrated content does not pass the content schema.', validation.issues);
  }
  // The reader tidies incomplete files (defaults, blank rows). A migration must not rely on
  // that: every file it writes has every field and no blank row.
  if (validation.notes.length > 0) {
    throw new MigrationError('The migrated content is incomplete: the reader had to tidy it.', validation.notes);
  }

  // --- Counts ---------------------------------------------------------------------------
  const source: MigrationCounts = {
    projectsPublished: sourceProjects.filter((entry) => entry.published).length,
    projectsUnpublished: sourceProjects.filter((entry) => !entry.published).length,
    experience: legacy.experiences.length,
    skillGroups: legacy.skills.length,
    skills: legacy.skills.reduce((total, group) => total + group.skills.length, 0),
    education: legacy.education.length,
    certificates: legacy.certificate.length,
    links: BIO_LINKS.filter((spec) => Bio[spec.key].trim() !== '').length,
    resumeLinks: [Bio.resume_gamedeveloper, Bio.resume_softwaredeveloper].filter((value) => value.trim() !== '').length,
  };
  const migrated: MigrationResult['migrated'] = {
    projectsPublished: projects.filter((item) => item.published).length,
    projectsUnpublished: projects.filter((item) => !item.published).length,
    experience: experience.length,
    skillGroups: skills.length,
    skills: skills.reduce((total, group) => total + group.skills.length, 0),
    education: education.length,
    certificates: certificates.length,
    links: links.length,
    resumeLinks: tracks.filter((track) => track.resumeUrl !== '').length,
    tracks: tracks.length,
    site: 1,
    files: files.length,
  };

  // --- Review list ----------------------------------------------------------------------
  // Four spaces: enough to nest under a two-digit item number ("10. ") in Markdown.
  const sub = (lines: readonly string[]): string => lines.map((line) => `\n    - ${line}`).join('');
  const unpublishedTitles = projects.filter((item) => !item.published).map((item) => item.title);

  // Links
  if (invalidCodeLinks.length > 0) {
    review.push(
      `**Code link that is not a web address.** It was saved with an empty address, so the "${CODE_LINK_LABEL}" button stays hidden until a real link is added.${sub(invalidCodeLinks)}`,
    );
  }
  if (invalidActionLinks.length > 0) {
    review.push(
      `**Button link that is not a web address.** The label was kept and the address saved empty (the button stays hidden).${sub(invalidActionLinks)}`,
    );
  }
  if (invalidBioLinks.length > 0 || invalidResumes.length > 0) {
    review.push(
      `**Profile link that is not a web address.** Saved with an empty address.${sub([...invalidBioLinks, ...invalidResumes])}`,
    );
  }
  if (labelsWithoutUrl.length > 0) {
    review.push(
      `**Buttons with a label but no link.** The old site had a button text and an empty address for these. The label was kept and the address is empty, so the button stays hidden until a link is added: ${labelsWithoutUrl.join(', ')}.`,
    );
  }
  if (missingCodeLinks.length > 0) {
    review.push(
      `**Projects with no code link in the old site.** A "${CODE_LINK_LABEL}" link with an empty address was created for each, so there is a place to add one; it stays hidden while empty: ${missingCodeLinks.join(', ')}.`,
    );
  }
  if (malformedVideos.length > 0) {
    review.push(
      `**Video link that is not a standard YouTube address.** It was kept exactly as written in the video field. A normal address looks like \`https://www.youtube.com/watch?v=…\` or \`https://youtu.be/…\`.${sub(malformedVideos)}`,
    );
  }
  if (mismatchedLabels.length > 0) {
    review.push(`**Button label that does not match its link.**${sub(mismatchedLabels)}`);
  }
  if (capitalLabels.length > 0) {
    review.push(
      `**Button label written in capitals.** Kept as written; the other labels use normal capitalisation: ${capitalLabels.join(', ')}.`,
    );
  }
  if (videoProjects.length > 0) {
    review.push(
      `**Video buttons.** ${plural(videoProjects.length, 'project has', 'projects have')} a YouTube link, now stored in the video field: ${videoProjects
        .map((entry) => entry.title)
        .join(', ')}. The new page shows one fixed "Gameplay" button for a video, so the old button texts (${[
        ...new Set(videoProjects.map((entry) => quote(entry.label))),
      ].join(', ')}) are not stored.`,
    );
  }
  if (skippedLinks.length > 0) {
    review.push(
      `**Empty social links skipped.** These were empty in the old content, so no link was created: ${skippedLinks.join(', ')}. Add them in the admin if you have them.`,
    );
  }
  review.push(
    '**YouTube channel link.** The approved page sketches show a "YouTube" link in the footer. The old content has no YouTube channel address, so none was created.',
  );

  // Duplicates
  const idGroups = duplicates(sourceProjects.map((entry) => ({ key: entry.legacy.title, value: entry.legacy.id })));
  if (idGroups.length > 0) {
    review.push(
      `**Duplicate ids in the old file.** The old ids are kept only as a reference (\`legacyId\`); the new site identifies each project by its file name, so nothing clashes.${sub(
        idGroups.map((group) => `id ${group.value}: ${group.keys.join(', ')}`),
      )}`,
    );
  }
  const certificateUrlGroups = duplicates(
    certificates.filter((item) => item.url !== '').map((item) => ({ key: item.title, value: item.url })),
  );
  if (certificateUrlGroups.length > 0) {
    review.push(
      `**Certificates sharing one link.** The same address is used by more than one certificate; it was kept on each.${sub(
        certificateUrlGroups.map((group) => `${group.keys.join(' and ')}: ${code(group.value)}`),
      )}`,
    );
  }
  const imageGroups = duplicates(
    projects.filter((item) => item.screenshots.length > 0).map((item) => ({ key: item.title, value: item.screenshots[0]?.src ?? '' })),
  );
  if (imageGroups.length > 0) {
    review.push(
      `**Projects sharing one cover image.**${sub(imageGroups.map((group) => `${group.keys.join(' and ')}: ${code(group.value)}`))}`,
    );
  }
  const descriptionGroups = duplicates(
    legacy.experiences.filter((entry) => entry.desc.trim() !== '').map((entry) => ({ key: entry.company, value: entry.desc })),
  );
  if (descriptionGroups.length > 0) {
    review.push(
      `**Experience entries with identical text.**${sub(
        descriptionGroups.map((group) => `${group.keys.join(' and ')}: ${quote(group.value)}`),
      )}`,
    );
  }

  // Dates
  review.push(
    `**Experience dates.** The date text is kept exactly as written and is what the page shows. A start month and an end month were also read from it and stored in separate fields; check them:${sub(experienceDateRows)}`,
  );
  const overlaps: string[] = [];
  for (let a = 0; a < experience.length; a += 1) {
    for (let b = a + 1; b < experience.length; b += 1) {
      const first = experience[a];
      const second = experience[b];
      if (!first || !second) continue;
      const startA = monthIndex(first.startDate);
      const startB = monthIndex(second.startDate);
      if (startA === undefined || startB === undefined) continue;
      const endA = first.present ? Number.POSITIVE_INFINITY : (monthIndex(first.endDate) ?? startA);
      const endB = second.present ? Number.POSITIVE_INFINITY : (monthIndex(second.endDate) ?? startB);
      if (startA <= endB && startB <= endA) {
        overlaps.push(
          `${first.company} (${quote(first.dateDisplay)}) and ${second.company} (${quote(second.dateDisplay)})`,
        );
      }
    }
  }
  if (overlaps.length > 0) {
    review.push(`**Experience dates that overlap.** Kept as written.${sub(overlaps)}`);
  }
  const datingSquare = sourceProjects.find((entry) => entry.legacy.title === 'Dating Square')?.legacy;
  const helpUpDefend = legacy.experiences.find((entry) => /helpupdefend/i.test(entry.company));
  if (
    datingSquare &&
    helpUpDefend &&
    datingSquare.date !== helpUpDefend.date &&
    datingSquare.description.includes('65Square') &&
    helpUpDefend.desc.includes('65Square')
  ) {
    review.push(
      `**Two different dates for the same work.** The project ${datingSquare.title} says ${quote(datingSquare.date)}; the experience entry ${helpUpDefend.company}, which also describes work on 65Square, says ${quote(helpUpDefend.date)}. Both were kept as written.`,
    );
  }
  const sameStartEnd = sourceProjects
    .map((entry) => entry.legacy)
    .filter((project) => {
      const parts = project.date.split(/\s+[-–—]\s+/);
      return parts.length === 2 && parts[0]?.trim() === parts[1]?.trim();
    })
    .map((project) => `${project.title} (${quote(project.date)})`);
  if (sameStartEnd.length > 0) {
    review.push(`**Date range with the same start and end.** Kept as written: ${sameStartEnd.join(', ')}.`);
  }
  const certificateSpans = legacy.certificate
    .map((entry) => {
      const years = [...entry.date.matchAll(/\b(\d{4})\b/g)].map((match) => Number(match[1]));
      const first = years[0];
      const last = years[years.length - 1];
      return years.length >= 2 && first !== undefined && last !== undefined
        ? { title: entry.title, date: entry.date, span: last - first }
        : undefined;
    })
    .filter((entry) => entry !== undefined);
  if (new Set(certificateSpans.map((entry) => entry.span)).size > 1) {
    review.push(
      `**Certificate validity periods differ in length.** Kept as written.${sub(
        certificateSpans.map((entry) => `${entry.title}: ${quote(entry.date)} (${plural(entry.span, 'year', 'years')})`),
      )}`,
    );
  }

  // Names and wording
  if (helpUpDefend && JSON.stringify(legacy).includes('helpusdefend.com')) {
    review.push(
      `**"${helpUpDefend.company}" spelling.** The company name is written ${quote(helpUpDefend.company)}, while its logo and the Dating Square links are on \`helpusdefend.com\` ("Help Us Defend"). The name was kept as written.`,
    );
  }
  review.push(
    `**Name.** The old content has the name ${quote(Bio.name)} (the hero said "Hello, I am ${Bio.name}"). The new site name is ${quote(SITE_NAME)}, the name shown in the old navigation bar and footer.`,
  );
  review.push(
    `**Headlines are derived, not yours.** The old site rotated these roles: ${Bio.roles.map(quote).join(', ')}. They are kept unchanged in the site settings. The page headlines were set to "Game Developer" (game page) and "Software Engineer" (software page); change them in the admin if you want other wording.`,
  );
  review.push(
    '**Both pages share one summary.** The old site had a single bio text, so the game page and the software page both start with it, unchanged. It talks about gameplay systems and gaming; the software page needs your own text.',
  );
  review.push(
    `**Certificate descriptions were emptied.** On all ${legacy.certificate.length} certificates the old description was the same placeholder text about an unrelated web application, and it included test login details. It was not copied into the new content or into this report. The certificate descriptions are now empty; write your own in the admin if you want one.`,
  );
  const everyText = JSON.stringify(legacy);
  const spelling = SPELLING_NOTES.filter((note) => everyText.includes(note.word));
  if (spelling.length > 0) {
    review.push(
      `**Possible typing slips, kept exactly as written.** Nothing was corrected. You may want to look at:${sub(
        spelling.map((note) => `${note.where}: ${quote(note.word)}`),
      )}`,
    );
  }
  if (paddedDescriptions.length > 0) {
    review.push(
      `**Descriptions that start or end with a space.** Kept as written (a browser does not show the extra space): ${paddedDescriptions.join(', ')}.`,
    );
  }
  const portfolio = sourceProjects.find((entry) => entry.legacy.title === 'My Portfolio')?.legacy;
  if (portfolio && /material-UI/i.test(portfolio.description)) {
    review.push(
      `**"${portfolio.title}" describes the old site.** Its text says the site was built with React and material-UI, and its link points to ${code(portfolio.action)}, which is this site. The rebuilt site no longer uses material-UI. Text and link were kept as written.`,
    );
  }

  // Tags
  if (removedEmptyTags.length > 0) {
    review.push(`**Empty tags removed.** An empty tag would show as a blank chip: ${removedEmptyTags.join(', ')}.`);
  }
  if (removedDuplicateTags.length > 0) {
    review.push(`**Repeated experience tags removed.** The second copy was dropped.${sub(removedDuplicateTags)}`);
  }
  if (duplicateProjectTags.length > 0) {
    review.push(`**Repeated project tags.** Kept as written.${sub(duplicateProjectTags)}`);
  }

  // Images
  const coverHosts = new Map<string, string[]>();
  for (const project of projects) {
    const src = project.screenshots[0]?.src ?? '';
    if (!/^https?:/i.test(src)) continue;
    const host = hostOf(src);
    const titles = coverHosts.get(host);
    if (titles) titles.push(project.title);
    else coverHosts.set(host, [project.title]);
  }
  const hotlinkedCovers = [...coverHosts.values()].reduce((total, titles) => total + titles.length, 0);
  if (hotlinkedCovers > 0) {
    review.push(
      `**Project images are loaded from other websites.** ${plural(hotlinkedCovers, 'project cover image is', 'project cover images are')} not stored with this site: each one is a link to a picture on another website. If that website removes or blocks the picture, the card shows a broken image. Each project currently has this one image only. Upload your own screenshots in the admin to replace them.${sub(
        [...coverHosts.entries()].map(([host, titles]) => `${code(host)}: ${titles.join(', ')}`),
      )}`,
    );
  }
  const remoteLogos = experience.filter((item) => /^https?:/i.test(item.logo));
  if (remoteLogos.length > 0) {
    const expiring = remoteLogos
      .map((item) => {
        const match = /[?&]e=(\d{10})(?:&|$)/.exec(item.logo);
        if (!match || !hostOf(item.logo).endsWith('licdn.com')) return undefined;
        const day = new Date(Number(match[1]) * 1000).toISOString().slice(0, 10);
        return `${item.company}: the address includes an expiry date (${day}), so it may no longer load`;
      })
      .filter((line) => line !== undefined);
    review.push(
      `**Company logos are loaded from other websites.** All ${remoteLogos.length} experience logos are links to pictures on other sites (${[
        ...new Set(remoteLogos.map((item) => code(hostOf(item.logo)))),
      ].join(', ')}). Upload your own copies in the admin.${sub(expiring)}`,
    );
  }
  const remoteBadges = certificates.filter((item) => /^https?:/i.test(item.image));
  if (remoteBadges.length > 0) {
    review.push(
      `**Certificate badges are loaded from another website.** ${plural(remoteBadges.length, 'badge image is a link', 'badge images are links')} to ${[
        ...new Set(remoteBadges.map((item) => code(hostOf(item.image)))),
      ].join(', ')}. They were kept as they are.`,
    );
  }
  if (unusableImages.length > 0 || unusableLogos.length > 0 || unusableCertificateValues.length > 0) {
    review.push(
      `**Image or link values that are not usable addresses.** Saved empty.${sub([
        ...unusableImages,
        ...unusableLogos,
        ...unusableCertificateValues,
      ])}`,
    );
  }

  // Left out on purpose
  if (droppedIcons.length > 0) {
    review.push(
      `**Skill icons were dropped.** The new design shows skills as text chips, and most of the old icon addresses pointed at the wrong logo (for example the Android Studio logo for Netcode, Photon, Unity Cloud and Git). The skill names are unchanged. ${plural(droppedIcons.length, 'icon address was', 'icon addresses were')} not migrated (they are still in \`legacy/constants.js\`):${sub(droppedIcons)}`,
    );
  }
  if (droppedEducationImages.length > 0) {
    review.push(
      `**Education pictures were dropped.** They were stock illustrations of buildings, not the schools' own images.${sub(droppedEducationImages)}`,
    );
  }
  review.push(
    nonEmptyDocs.length > 0
      ? `**Experience "doc" values were not migrated.** The new content has no field for them.${sub(nonEmptyDocs)}`
      : '**Unused old fields.** The experience entries had a "doc" field that was empty everywhere, and experience, education and certificate entries had numeric ids; none of these are needed in the new content and they were not migrated.',
  );

  // Unpublished
  if (unpublishedTitles.length > 0) {
    review.push(
      `**Switched-off project.** ${unpublishedTitles.map(quote).join(', ')} was inside a comment in the old file, so the old site did not show it. It was migrated as unpublished: it is in the admin, but it is not on the site and is not included in the files sent to visitors. Its details are copied by hand into the migration script, because a script cannot read a comment as data. Publish it in the admin if you want it back.`,
    );
  }

  // New fields and chosen values
  if (unknownCategories.length > 0) {
    review.push(`**Unknown project category.** Kept as written; add the category in the site settings.${sub(unknownCategories)}`);
  }
  if (unmappedAudience.length > 0) {
    review.push(`**Experience shown on both pages by default.** No page was assigned for: ${unmappedAudience.join(', ')}.`);
  }
  const mentionsRemote = legacy.experiences.filter((entry) => /\bremote\b/i.test(entry.desc)).map((entry) => entry.company);
  review.push(
    `**New fields that start empty.** The old content has nothing for these, so they are empty or switched off until you fill them in: project long description; project hover text (the category's default text is used); "featured" on projects (off); extra screenshots (each project has only its old cover image); experience location and "remote" (off for all ${experience.length}${
      mentionsRemote.length > 0 ? `, although the text of ${mentionsRemote.join(', ')} mentions remote work` : ''
    }); separate experience bullet points per page; education description; the two pages' search-engine descriptions.`,
  );
  review.push(
    `**Values chosen during migration.** These did not exist in the old content and were set to match the approved design; all can be changed in the admin:${sub([
      `Tabs: ${CATEGORIES.map((category) => `${quote(category.label)} (${category.id})`).join(', ')}, plus ${quote(ALL_TAB_LABEL)}. The old category "webapp" is now "webapps". Default hover texts: ${[
        ...new Set(CATEGORIES.flatMap((category) => [category.hoverWithVideo, category.hoverWithoutVideo])),
      ]
        .map(quote)
        .join(', ')}.`,
      'Which page a project belongs to: Unreal and Unity projects → game page, web apps → software page. Every project still appears under its tab on both pages.',
      `Experience: ${experience.filter((item) => item.audience === 'game').map((item) => item.company).join(', ')} → game page first; ${experience
        .filter((item) => item.audience === 'softdev')
        .map((item) => item.company)
        .join(', ')} → software page first.`,
      'Skill groups: Game Dev and Programming are highlighted on the game page, Backend and Cloud on the software page. Order on the game page: Game Dev, Programming, Backend, Cloud. Order on the software page: Backend, Cloud, Programming, Game Dev.',
      'Order of projects, experience, education and certificates: the order they had in the old file.',
      `Link buttons: labels ${links.map((link) => quote(link.label)).join(', ')}. In the hero: ${links
        .filter((link) => link.showInHero)
        .map((link) => (link.audience === 'both' ? link.label : `${link.label} (${link.audience} page only)`))
        .join(', ')}. In the footer: all of them.`,
      `Page settings: tab opened first — ${tracks.map((track) => `${track.label}: ${track.defaultTab}`).join(', ')}; resume button texts ${tracks.map((track) => quote(track.resumeLabel)).join(', ')}; page titles ${tracks.map((track) => quote(track.metaTitle)).join(', ')}; profile photo ${code(PROFILE_PHOTO)} (the old site's photo) with the description ${quote(SITE_NAME)}; certificates are listed before education on the software page.`,
      `Footer credit: ${SITE_CREDIT.map(quote).join(', ')} (the old footer's text). Monogram: ${quote(SITE_MONOGRAM)}.`,
      `Image descriptions for screen readers: "<project title> cover image" and "<certificate title> badge".`,
      `Code links are labelled ${quote(CODE_LINK_LABEL)}. Button types (used for the icon): ${derivedKinds.join('; ')}.`,
    ])}`,
  );

  const report = buildReport({ source, migrated, review, unpublishedTitles, skippedLinks });
  return { files, report, source, migrated };
}

// ---------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------

function buildReport(input: {
  source: MigrationCounts;
  migrated: MigrationResult['migrated'];
  review: readonly string[];
  unpublishedTitles: readonly string[];
  skippedLinks: readonly string[];
}): string {
  const { source, migrated, review, unpublishedTitles, skippedLinks } = input;
  const rows: [string, string, string, string][] = [
    ['Projects shown on the old site', `${source.projectsPublished}`, `${migrated.projectsPublished} published`, ''],
    [
      'Projects switched off in the old site (inside a comment)',
      `${source.projectsUnpublished}`,
      `${migrated.projectsUnpublished} unpublished`,
      unpublishedTitles.join(', '),
    ],
    ['Experience entries', `${source.experience}`, `${migrated.experience}`, ''],
    ['Skill groups', `${source.skillGroups}`, `${migrated.skillGroups}`, ''],
    ['Skills (all groups together)', `${source.skills}`, `${migrated.skills}`, 'names only; icons dropped'],
    ['Education entries', `${source.education}`, `${migrated.education}`, ''],
    ['Certificates', `${source.certificates}`, `${migrated.certificates}`, 'descriptions emptied'],
    [
      'Profile links that had a value',
      `${source.links}`,
      `${migrated.links} link files`,
      skippedLinks.length > 0 ? `empty and skipped: ${skippedLinks.join(', ')}` : '',
    ],
    ['Resume links', `${source.resumeLinks}`, `${migrated.resumeLinks}`, 'one per page'],
    ['Page profiles (game, software)', '—', `${migrated.tracks}`, 'new; text taken from the old bio'],
    ['Site settings', '—', `${migrated.site}`, 'new'],
  ];

  const lines = [
    '# Migration report',
    '',
    'This file is written by the migration script (`npm run migrate`). The script reads the old',
    "site's content from `legacy/constants.js` and writes the new content files under `content/`.",
    'Those files are what the admin edits from now on.',
    '',
    'Your text was not rewritten: titles, descriptions, dates and links are stored exactly as they',
    'were in the old file, including spelling. Every value that was changed, left out or could not',
    'work as it was is listed below with what was done.',
    '',
    '## Counts',
    '',
    '| What | Old site | New content | Note |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    `Content files written: ${migrated.files}.`,
    '',
    '## Things to review in the admin',
    '',
    'Nothing here stops the site from working. Each item says what was found and what was done.',
    '',
    ...review.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Not checked',
    '',
    'The migration does not open any link, so it does not know whether the links, videos and',
    'images above still work. It only checks that each one is written as a valid address.',
    '',
  ];
  return lines.join('\n');
}
