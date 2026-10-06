/**
 * CONTENT API — signatures owned by the architect, implementation owned by the content agent.
 *
 * Pages, routing and prerender import ONLY from here ("@/content"). The exported function
 * signatures below are the contract and must not change without the architect's sign-off.
 *
 * The bodies currently return a small SEED so the app runs before the real content exists.
 * The content agent replaces the seed with the real loader (import.meta.glob over /content,
 * validated with the zod schema in ./schema.ts).
 *
 * Rules for the implementation
 * - Must work in the browser bundle and in the SSR/prerender bundle (no fs, no window).
 * - Unpublished items are filtered out here and must not reach callers.
 * - All functions are synchronous and return new arrays (callers may sort/slice them).
 */
import type {
  Certificate,
  Education,
  Project,
  ResolvedExperience,
  SiteSettings,
  SkillGroup,
  SocialLink,
  Tab,
  TrackId,
  TrackProfile,
} from './types';

export type * from './types';

// ---------------------------------------------------------------------------------------
// SEED (temporary) — replaced by the content agent.
// ---------------------------------------------------------------------------------------
const seedSite: SiteSettings = {
  name: 'Kishan Kahodariya',
  monogram: 'KK',
  email: '',
  credit: ['Developed by Kishan Kahodariya.', '© All rights reserved.'],
  roles: [],
  allTabLabel: 'All',
  categories: [
    { id: 'unreal', label: 'Unreal', order: 10, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
    { id: 'unity', label: 'Unity3D', order: 20, hoverWithVideo: 'View Gameplay & Screenshots', hoverWithoutVideo: 'View Screenshots' },
    { id: 'webapps', label: 'Web Apps', order: 30, hoverWithVideo: 'View Demo & Screenshots', hoverWithoutVideo: 'View Screenshots' },
  ],
};

const seedTracks: TrackProfile[] = [
  {
    id: 'game',
    route: 'gamedev',
    label: 'Game Dev',
    headline: 'Game Developer',
    summary: '',
    resumeUrl: '',
    resumeLabel: 'Game Dev Resume',
    defaultTab: 'unity',
    photo: '/images/profile.jpg',
    photoAlt: 'Kishan Kahodariya',
    certificatesFirst: false,
    metaTitle: 'Kishan Kahodariya — Game Developer',
    metaDescription: '',
  },
  {
    id: 'softdev',
    route: 'softdev',
    label: 'Software',
    headline: 'Software Engineer',
    summary: '',
    resumeUrl: '',
    resumeLabel: 'Software Resume',
    defaultTab: 'webapps',
    photo: '/images/profile.jpg',
    photoAlt: 'Kishan Kahodariya',
    certificatesFirst: true,
    metaTitle: 'Kishan Kahodariya — Software Engineer',
    metaDescription: '',
  },
];

// ---------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------

/** content/site.json */
export function getSite(): SiteSettings {
  return seedSite;
}

/** Both track profiles, game first. */
export function getTracks(): TrackProfile[] {
  return [...seedTracks];
}

export function getTrack(id: TrackId): TrackProfile {
  const track = seedTracks.find((t) => t.id === id);
  if (!track) throw new Error(`Unknown track: ${id}`);
  return track;
}

/** Track whose route segment matches ("gamedev" | "softdev"), or undefined. */
export function getTrackByRoute(route: string): TrackProfile | undefined {
  return seedTracks.find((t) => t.route === route);
}

/** Categories in order, followed by the "all" tab. Same list on every page. */
export function getTabs(): Tab[] {
  const site = getSite();
  const categories = [...site.categories].sort((a, b) => a.order - b.order);
  return [...categories.map(({ id, label }) => ({ id, label })), { id: 'all', label: site.allTabLabel }];
}

/** tabId if it is a valid tab id, otherwise the track's default tab. */
export function resolveTab(track: TrackId, tabId: string | undefined): string {
  const valid = getTabs().some((t) => t.id === tabId);
  return valid && tabId ? tabId : getTrack(track).defaultTab;
}

/**
 * Published projects for one page and one tab.
 * tab = category id or "all". Sort: featured first, then (on the "all" tab) projects whose
 * audience matches the track or is "both", then the track's order field, then title.
 */
export function getProjects(track: TrackId, tab: string): Project[] {
  void track;
  void tab;
  return [];
}

/** Card hover text for a project: its own hoverText, else the category default. */
export function getHoverText(project: Project): string {
  if (project.hoverText) return project.hoverText;
  const category = getSite().categories.find((c) => c.id === project.category);
  if (!category) return 'View Screenshots';
  return project.videoUrl ? category.hoverWithVideo : category.hoverWithoutVideo;
}

/**
 * Published experience for one page. Entries whose audience matches the track (or "both")
 * come first, each group sorted by the track's order field. resolvedBullets holds the
 * track-specific bullet set when it is non-empty, else the default bullets.
 */
export function getExperience(track: TrackId): ResolvedExperience[] {
  void track;
  return [];
}

/** Published skill groups sorted by the track's order field. */
export function getSkillGroups(track: TrackId): SkillGroup[] {
  void track;
  return [];
}

/** Published links visible on this page for one placement, sorted by order. */
export function getLinks(track: TrackId, placement: 'hero' | 'footer'): SocialLink[] {
  void track;
  void placement;
  return [];
}

export function getEducation(): Education[] {
  return [];
}

/** Published certificates sorted by the track's order field. */
export function getCertificates(track: TrackId): Certificate[] {
  void track;
  return [];
}

/**
 * Every public route to prerender, without the base path and without a trailing slash,
 * for example: "/", "/gamedev", "/gamedev/unity", "/gamedev/all", "/softdev", "/softdev/webapps".
 */
export function getAllRoutes(): string[] {
  const routes = ['/'];
  for (const track of getTracks()) {
    routes.push(`/${track.route}`);
    for (const tab of getTabs()) routes.push(`/${track.route}/${tab.id}`);
  }
  return routes;
}
