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
    heroVideo: '',
    heroPoster: '',
    badgeLine1: '',
    badgeLine2: '',
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
    workLabel: '',
    contactLabel: '',
    stats: [],
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

/**
 * The motion hero and header: what the plain fixture above leaves empty (no video, no badge,
 * no stats, no "See my work", no "Get in touch"), filled in by a variant chosen with ?hero=.
 *   full     a video that plays (a 4 KB .webm beside this file), badge, stats, both buttons
 *   poster   no video, a poster image
 *   both     the video and a poster
 *   broken   a video address that cannot be loaded, no poster
 *   oneline  like full, with only the first badge line
 */
export type HeroCase = 'plain' | 'full' | 'poster' | 'both' | 'broken' | 'oneline';
export const HERO_CASES: readonly HeroCase[] = ['plain', 'full', 'poster', 'both', 'broken', 'oneline'];

/** Site paths, as content stores them (no base path). */
export const HERO_VIDEO = '/tests/pages/support/hero-fixture-video.webm';
export const HERO_VIDEO_BROKEN = 'https://video.invalid/hero.mp4';
export const HERO_POSTER = LOGO_OK;
export const HERO_EMAIL = 'fixture@example.com';
export const HERO_WORK_LABEL = 'See fixture work';
export const HERO_CONTACT_LABEL = 'Write to fixture';
export const HERO_BADGE = ['Fixture Certified', 'Badge Second Line'] as const;
/** Typed stats only, so the fixture needs no projects; the blank one must be dropped. */
export const HERO_STATS = [
  { value: '12', label: 'Fixture things' },
  { value: '3+', label: 'Fixture years' },
] as const;

export function fixtureContent(hero: HeroCase): ContentBundle {
  if (hero === 'plain') return FIXTURE_CONTENT;
  const heroVideo = hero === 'poster' ? '' : hero === 'broken' ? HERO_VIDEO_BROKEN : HERO_VIDEO;
  const heroPoster = hero === 'poster' || hero === 'both' ? HERO_POSTER : '';
  return {
    ...FIXTURE_CONTENT,
    site: {
      ...FIXTURE_CONTENT.site,
      email: HERO_EMAIL,
      workLabel: HERO_WORK_LABEL,
      contactLabel: HERO_CONTACT_LABEL,
      stats: [
        ...HERO_STATS.map((stat) => ({ source: 'custom' as const, ...stat })),
        { source: 'custom' as const, value: '', label: 'Dropped: no value' },
      ],
    },
    tracks: FIXTURE_CONTENT.tracks.map((profile) => ({
      ...profile,
      heroVideo,
      heroPoster,
      badgeLine1: HERO_BADGE[0],
      badgeLine2: hero === 'oneline' ? '' : HERO_BADGE[1],
    })),
  };
}
