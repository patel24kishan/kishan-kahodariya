/**
 * The hand-built content of the hero fixture (hero-fixture.tsx mounts it, hero-fixture.spec.ts
 * computes its expectations from it). Plain data and type-only imports, so it loads in the
 * browser through Vite and in Node through Playwright alike.
 */
import type { ContentBundle } from '../../../src/content/bundle';
import type { SocialLink, TrackProfile } from '../../../src/content/types';

/** The real logo file, as content stores it (no base path). */
export const LOGO_OK = '/images/logo-96.webp';
/** A host that never answers: the image fails to load. */
export const LOGO_BROKEN = 'https://images.invalid/logo.png';

export type LogoCase = 'ok' | 'none' | 'broken';
export const LOGO_SOURCES: Record<LogoCase, string> = { ok: LOGO_OK, none: '', broken: LOGO_BROKEN };

function track(overrides: Partial<TrackProfile> & Pick<TrackProfile, 'id' | 'route' | 'label' | 'defaultTab'>): TrackProfile {
  return {
    headline: 'Fixture Headline',
    summary: 'Fixture summary.',
    resumeUrl: '',
    resumeLabel: '',
    tabResumes: [],
    photo: '',
    photoAlt: '',
    certificatesFirst: false,
    metaTitle: '',
    metaDescription: '',
    ...overrides,
  };
}

function link(overrides: Partial<SocialLink> & Pick<SocialLink, 'slug' | 'label' | 'url' | 'icon'>): SocialLink {
  return { audience: 'both', order: 10, orderFooter: 10, showInHero: true, showInFooter: true, published: true, ...overrides };
}

/** The game page's main summary, and the summaries two of its tabs have of their own. */
export const MAIN_SUMMARY = 'Fixture main summary.';
/** Two paragraphs, the second with a line break, and longer than the main one. */
export const UNREAL_SUMMARY = 'Fixture Unreal summary, first paragraph.\n\nSecond paragraph, first line.\nSecond paragraph, second line.';
export const UNITY_SUMMARY = 'Fixture Unity summary.';
export const SOFTDEV_UNITY_SUMMARY = 'Fixture software-page Unity summary.';

/**
 * Game page: a main resume and a main summary, and one row per case —
 *   unreal   its own address and its own label; its own summary (resume and summary),
 *   unity    a row with no address (falls back to the main resume and the main label), but
 *            with its own summary (summary only),
 *   all      its own address, no label (keeps the main label); a summary of spaces only
 *            (resume only: the main summary),
 *   webapps  no row at all (main resume, main summary).
 * Software page: no main resume and no main summary; only the webapps tab has a resume,
 * without a label (the button reads "Resume"), and only the unity tab has a summary; on every
 * other tab there is no resume button and no summary block.
 */
export const FIXTURE_CONTENT: ContentBundle = {
  site: {
    name: 'Fixture Person',
    monogram: 'FP',
    logo: LOGO_OK,
    logoAlt: 'Fixture Person logo',
    email: '',
    credit: [],
    roles: [],
    allTabLabel: 'All',
    categories: [
      { id: 'unreal', label: 'Unreal', order: 10, hoverWithVideo: '', hoverWithoutVideo: '' },
      { id: 'unity', label: 'Unity3D', order: 20, hoverWithVideo: '', hoverWithoutVideo: '' },
      { id: 'webapps', label: 'Web Apps', order: 30, hoverWithVideo: '', hoverWithoutVideo: '' },
    ],
  },
  tracks: [
    track({
      id: 'game',
      route: 'gamedev',
      label: 'Game Dev',
      defaultTab: 'unity',
      resumeUrl: 'https://example.com/resume/game.pdf',
      resumeLabel: 'Game Dev Resume',
      summary: MAIN_SUMMARY,
      tabResumes: [
        { tab: 'unreal', url: 'https://example.com/resume/unreal.pdf', label: 'Unreal Resume', summary: UNREAL_SUMMARY },
        { tab: 'unity', url: '', label: 'Unity Resume', summary: UNITY_SUMMARY },
        { tab: 'all', url: 'https://example.com/resume/everything.pdf', label: '', summary: '   ' },
      ],
    }),
    track({
      id: 'softdev',
      route: 'softdev',
      label: 'Software',
      defaultTab: 'webapps',
      resumeUrl: '',
      resumeLabel: '',
      summary: '',
      tabResumes: [
        { tab: 'webapps', url: 'https://example.com/resume/web.pdf', label: '', summary: '' },
        { tab: 'unity', url: '', label: '', summary: SOFTDEV_UNITY_SUMMARY },
      ],
    }),
  ],
  projects: [],
  experience: [],
  skills: [],
  links: [link({ slug: 'github', label: 'GitHub', url: 'https://github.com/example', icon: 'github' })],
  education: [],
  certificates: [],
};
