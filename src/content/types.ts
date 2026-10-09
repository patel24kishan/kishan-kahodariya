/**
 * CONTENT CONTRACT — owned by the architect.
 *
 * Every content file under /content, the zod schema, the loader, the pages and the
 * admin dashboard config all follow these shapes. Do not change this file without the
 * architect's sign-off: log a request under logs/issues/ instead.
 *
 * Conventions
 * - Every string field is always present; "" means "not set". Renderers skip empty values.
 * - Asset paths are either absolute https URLs or site-root-relative paths starting with "/"
 *   (for example "/images/profile.jpg", "/uploads/scarfall-1.webp"). Never include the
 *   "/kishan-kahodariya" base; use assetUrl() from src/lib/paths.ts when rendering.
 * - "published: false" items are never rendered and never shipped in the client bundle.
 */

export type TrackId = 'game' | 'softdev';

/** Which page(s) an item belongs to. */
export type Audience = 'game' | 'softdev' | 'both';

/** A project tab. "all" is implicit and is not stored as a category. */
export interface Category {
  /** URL segment and stable id, lower-case kebab: "unreal", "unity", "webapps". */
  id: string;
  /** Tab label: "Unreal", "Unity3D", "Web Apps". */
  label: string;
  order: number;
  /** Default card hover text when the project has a video (max 4 words). */
  hoverWithVideo: string;
  /** Default card hover text when the project has screenshots only (max 4 words). */
  hoverWithoutVideo: string;
}

/** content/site.json */
export interface SiteSettings {
  /** "Kishan Kahodariya" */
  name: string;
  /** Short logo text in the nav: "KK" */
  monogram: string;
  /** Image path or URL of the nav logo. "" means: show the monogram text instead. */
  logo: string;
  /** Alt text of the logo image. "" is allowed. */
  logoAlt: string;
  email: string;
  /** Footer credit lines, rendered one per line. */
  credit: string[];
  /** Legacy typewriter roles, kept so nothing is lost. */
  roles: string[];
  /** Label of the "All" tab. */
  allTabLabel: string;
  categories: Category[];
  /** Text of the hero's first button, which scrolls to the projects: "See my work". "" hides it. */
  workLabel: string;
  /** Text of the contact button in the header and of the footer's title: "Get in touch". */
  contactLabel: string;
  /** The numbers shown in the hero, in this order; read them through getHeroStats(). */
  stats: HeroStat[];
}

/** Where a hero number comes from: counted from the content, or typed by the owner. */
export type HeroStatSource = 'projects' | 'companies' | 'years' | 'certificates' | 'custom';

export interface HeroStat {
  source: HeroStatSource;
  /** Only used when source is "custom"; "" otherwise. */
  value: string;
  /** The words under the number: "Projects built". */
  label: string;
}

/** A hero number resolved for one page. */
export interface ResolvedHeroStat {
  value: string;
  label: string;
}

/**
 * What one project tab shows in the hero instead of the page's own: a resume, a summary, or
 * both. Each part is optional on its own; an empty part falls back to the page's.
 */
export interface TabResume {
  /** Category id ("unreal", "unity", "webapps") or "all". */
  tab: string;
  /** Resume link for this tab. "" means not set: the page falls back to resumeUrl. */
  url: string;
  /** Button text for this tab. "" uses resumeLabel. */
  label: string;
  /** Hero summary for this tab. "" means: use the page's main summary. */
  summary: string;
}

/** content/tracks/game.json and content/tracks/softdev.json */
export interface TrackProfile {
  id: TrackId;
  /** URL segment: "gamedev" or "softdev". */
  route: string;
  /** Human label: "Game Dev", "Software". */
  label: string;
  headline: string;
  summary: string;
  resumeUrl: string;
  /** Button text: "Game Dev Resume". */
  resumeLabel: string;
  /**
   * Resume and/or summary for specific project tabs; read them through getResume() and
   * getSummary(). [] = the page's own resume and summary on every tab.
   */
  tabResumes: TabResume[];
  /** Category id (or "all") of the tab that is open first on this page. */
  defaultTab: string;
  /** Profile photo path. */
  photo: string;
  photoAlt: string;
  /** Looping background video of the hero: URL or site path. "" means no video. */
  heroVideo: string;
  /** Image shown before the video plays and when it does not. "" means none. */
  heroPoster: string;
  /** The two lines of the hero badge: "AWS Certified" / "Solution Architect". Both "" hides it. */
  badgeLine1: string;
  badgeLine2: string;
  /** true: Certificates section is rendered before Education on this page. */
  certificatesFirst: boolean;
  /** <title> and meta description for this page. */
  metaTitle: string;
  metaDescription: string;
}

export interface MediaImage {
  src: string;
  alt: string;
}

export type ProjectLinkKind = 'code' | 'play' | 'video' | 'demo' | 'store' | 'other';

export interface ProjectLink {
  /** Button text, Title Case: "View Code", "Play", "Live Demo". */
  label: string;
  /** "" means the link is not set yet and must not be rendered. */
  url: string;
  kind: ProjectLinkKind;
}

/** content/projects/<slug>.json */
export interface Project {
  slug: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  /** Free-text date exactly as the owner wrote it: "Dec 2023 - Mar 2024". */
  dateDisplay: string;
  tags: string[];
  /** Category id; must match SiteSettings.categories[].id. */
  category: string;
  audience: Audience;
  featured: boolean;
  published: boolean;
  /** Sort order on the game page (lower first). */
  orderGame: number;
  /** Sort order on the software page (lower first). */
  orderSoftdev: number;
  /** Card hover text, max 4 words. "" uses the category default. */
  hoverText: string;
  /** First screenshot is the card image. */
  screenshots: MediaImage[];
  /** Gameplay / demo video (YouTube URL). "" means none. */
  videoUrl: string;
  links: ProjectLink[];
  /** Id from the old constants.js, for traceability. null for items created later. */
  legacyId: number | null;
}

/** content/experience/<slug>.json */
export interface Experience {
  slug: string;
  company: string;
  role: string;
  location: string;
  remote: boolean;
  /** "YYYY-MM" or "" when unknown. */
  startDate: string;
  /** "YYYY-MM" or "" when unknown or present. */
  endDate: string;
  present: boolean;
  /** Free-text date exactly as the owner wrote it. Shown when set. */
  dateDisplay: string;
  /** Company logo path or URL. "" means none. */
  logo: string;
  /** Default bullet points, used on any page that has no specific set. */
  bullets: string[];
  /** Optional bullet set for the game page. Empty array falls back to bullets. */
  bulletsGame: string[];
  /** Optional bullet set for the software page. Empty array falls back to bullets. */
  bulletsSoftdev: string[];
  tags: string[];
  audience: Audience;
  orderGame: number;
  orderSoftdev: number;
  published: boolean;
}

/** content/skills/<slug>.json */
export interface SkillGroup {
  slug: string;
  title: string;
  skills: string[];
  /** Page(s) on which this group is drawn in the accent colour. */
  emphasis: Audience | 'none';
  orderGame: number;
  orderSoftdev: number;
  published: boolean;
}

export type LinkIcon =
  | 'github'
  | 'gitlab'
  | 'linkedin'
  | 'youtube'
  | 'itchio'
  | 'steam'
  | 'email'
  | 'blog'
  | 'x'
  | 'discord'
  | 'link';

/** content/links/<slug>.json */
export interface SocialLink {
  slug: string;
  label: string;
  url: string;
  icon: LinkIcon;
  audience: Audience;
  /** Position among the hero buttons (lower first). */
  order: number;
  /** Position among the footer links (lower first). */
  orderFooter: number;
  showInHero: boolean;
  showInFooter: boolean;
  published: boolean;
}

/** content/education/<slug>.json */
export interface Education {
  slug: string;
  school: string;
  degree: string;
  dateDisplay: string;
  grade: string;
  description: string;
  order: number;
  published: boolean;
}

/** content/certificates/<slug>.json */
export interface Certificate {
  slug: string;
  title: string;
  dateDisplay: string;
  description: string;
  /** Badge image path or URL. */
  image: string;
  imageAlt: string;
  url: string;
  orderGame: number;
  orderSoftdev: number;
  published: boolean;
}

/** One project tab as rendered: the categories plus "all". */
export interface Tab {
  id: string;
  label: string;
}

/** An experience entry with its bullets already resolved for one page. */
export interface ResolvedExperience extends Experience {
  resolvedBullets: string[];
}
