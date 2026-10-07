/**
 * The content API as pure functions over a content bundle.
 *
 * src/content/index.ts binds these to the real content ("virtual:content"). Keeping them
 * free of that import means they run anywhere — browser, prerender bundle, plain Node tests.
 * No fs, no window, no zod.
 *
 * Sorting uses plain code-point comparison, never localeCompare: the server render and the
 * browser must produce exactly the same order, whatever locale either one runs in.
 */
import type { ContentBundle } from './bundle';
import type {
  Audience,
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

/** Id of the implicit "All" tab. */
const ALL_TAB_ID = 'all';

const TRACK_ORDER: readonly TrackId[] = ['game', 'softdev'];

/** What the resume button of a page shows and opens. */
export interface ResumeButton {
  url: string;
  label: string;
}

export interface ContentApi {
  getSite(): SiteSettings;
  getTracks(): TrackProfile[];
  getTrack(id: TrackId): TrackProfile;
  getTrackByRoute(route: string): TrackProfile | undefined;
  getTabs(): Tab[];
  resolveTab(track: TrackId, tabId: string | undefined): string;
  getProjects(track: TrackId, tab: string): Project[];
  getHoverText(project: Project): string;
  getExperience(track: TrackId): ResolvedExperience[];
  getSkillGroups(track: TrackId): SkillGroup[];
  getLinks(track: TrackId, placement: 'hero' | 'footer'): SocialLink[];
  getResume(track: TrackId, tabId: string): ResumeButton;
  getEducation(): Education[];
  getCertificates(track: TrackId): Certificate[];
  getAllRoutes(): string[];
}

function compareText(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function published<T extends { published: boolean }>(items: readonly T[]): T[] {
  return items.filter((item) => item.published);
}

function trackOrder(item: { orderGame: number; orderSoftdev: number }, track: TrackId): number {
  return track === 'game' ? item.orderGame : item.orderSoftdev;
}

/**
 * A link's position in the footer. The content reader always fills `orderFooter` in (a link
 * saved without one gets its `order`); the same fallback is repeated here so that a bundle
 * built by hand without the field still sorts instead of comparing against `undefined`.
 */
function footerOrder(link: SocialLink): number {
  return typeof link.orderFooter === 'number' ? link.orderFooter : link.order;
}

/** true when an item marked for `audience` belongs to the page of `track`. */
function belongsTo(audience: Audience, track: TrackId): boolean {
  return audience === 'both' || audience === track;
}

export function createContentApi(content: ContentBundle): ContentApi {
  function getSite(): SiteSettings {
    return content.site;
  }

  function getTracks(): TrackProfile[] {
    return [...content.tracks].sort((a, b) => TRACK_ORDER.indexOf(a.id) - TRACK_ORDER.indexOf(b.id));
  }

  function getTrack(id: TrackId): TrackProfile {
    const track = content.tracks.find((candidate) => candidate.id === id);
    if (!track) throw new Error(`Unknown track: ${id}`);
    return track;
  }

  function getTrackByRoute(route: string): TrackProfile | undefined {
    return content.tracks.find((candidate) => candidate.route === route);
  }

  function getTabs(): Tab[] {
    const categories = content.site.categories
      .map((category, index) => ({ category, index }))
      .sort((a, b) => a.category.order - b.category.order || a.index - b.index)
      .map(({ category }) => ({ id: category.id, label: category.label }));
    return [...categories, { id: ALL_TAB_ID, label: content.site.allTabLabel }];
  }

  function resolveTab(track: TrackId, tabId: string | undefined): string {
    if (tabId !== undefined && getTabs().some((tab) => tab.id === tabId)) return tabId;
    return getTrack(track).defaultTab;
  }

  function getProjects(track: TrackId, tab: string): Project[] {
    const isAll = tab === ALL_TAB_ID;
    return published(content.projects)
      .filter((project) => isAll || project.category === tab)
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        if (isAll) {
          const aOwn = belongsTo(a.audience, track);
          const bOwn = belongsTo(b.audience, track);
          if (aOwn !== bOwn) return aOwn ? -1 : 1;
        }
        return (
          trackOrder(a, track) - trackOrder(b, track) || compareText(a.title, b.title) || compareText(a.slug, b.slug)
        );
      });
  }

  function getHoverText(project: Project): string {
    if (project.hoverText) return project.hoverText;
    const category = content.site.categories.find((candidate) => candidate.id === project.category);
    if (!category) return 'View Screenshots';
    return project.videoUrl ? category.hoverWithVideo : category.hoverWithoutVideo;
  }

  function getExperience(track: TrackId): ResolvedExperience[] {
    return published(content.experience)
      .sort((a, b) => {
        const aOwn = belongsTo(a.audience, track);
        const bOwn = belongsTo(b.audience, track);
        if (aOwn !== bOwn) return aOwn ? -1 : 1;
        return (
          trackOrder(a, track) - trackOrder(b, track) || compareText(a.company, b.company) || compareText(a.slug, b.slug)
        );
      })
      .map((entry) => {
        const specific = track === 'game' ? entry.bulletsGame : entry.bulletsSoftdev;
        return { ...entry, resolvedBullets: [...(specific.length > 0 ? specific : entry.bullets)] };
      });
  }

  function getSkillGroups(track: TrackId): SkillGroup[] {
    return published(content.skills).sort(
      (a, b) => trackOrder(a, track) - trackOrder(b, track) || compareText(a.title, b.title) || compareText(a.slug, b.slug),
    );
  }

  function getLinks(track: TrackId, placement: 'hero' | 'footer'): SocialLink[] {
    const shown = published(content.links)
      // A link without an address has nothing to open: never hand it to a renderer.
      .filter((link) => link.url.trim() !== '')
      .filter((link) => belongsTo(link.audience, track))
      .filter((link) => (placement === 'hero' ? link.showInHero : link.showInFooter));
    // The two places are ordered independently: `order` for the hero, `orderFooter` for the footer.
    if (placement === 'hero') {
      return shown.sort((a, b) => a.order - b.order || compareText(a.label, b.label) || compareText(a.slug, b.slug));
    }
    return shown.sort(
      (a, b) => footerOrder(a) - footerOrder(b) || a.order - b.order || compareText(a.slug, b.slug),
    );
  }

  function getResume(track: TrackId, tabId: string): ResumeButton {
    const profile = getTrack(track);
    const own = (profile.tabResumes ?? []).find((entry) => entry.tab === tabId && entry.url.trim() !== '');
    if (!own) return { url: profile.resumeUrl, label: profile.resumeLabel };
    return { url: own.url, label: own.label.trim() !== '' ? own.label : profile.resumeLabel };
  }

  function getEducation(): Education[] {
    return published(content.education).sort(
      (a, b) => a.order - b.order || compareText(a.school, b.school) || compareText(a.slug, b.slug),
    );
  }

  function getCertificates(track: TrackId): Certificate[] {
    return published(content.certificates).sort(
      (a, b) => trackOrder(a, track) - trackOrder(b, track) || compareText(a.title, b.title) || compareText(a.slug, b.slug),
    );
  }

  function getAllRoutes(): string[] {
    const routes = ['/'];
    const tabs = getTabs();
    for (const track of getTracks()) {
      routes.push(`/${track.route}`);
      for (const tab of tabs) routes.push(`/${track.route}/${tab.id}`);
    }
    return routes;
  }

  return {
    getSite,
    getTracks,
    getTrack,
    getTrackByRoute,
    getTabs,
    resolveTab,
    getProjects,
    getHoverText,
    getExperience,
    getSkillGroups,
    getLinks,
    getResume,
    getEducation,
    getCertificates,
    getAllRoutes,
  };
}
