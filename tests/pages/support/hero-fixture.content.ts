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

/**
 * Game page: a main resume, and one row per case —
 *   unreal   its own address and its own label,
 *   unity    a row with no address (falls back to the main resume and the main label),
 *   all      its own address, no label (keeps the main label),
 *   webapps  no row at all (main resume).
 * Software page: no main resume; only the webapps tab has one, without a label (the button
 * reads "Resume"); on every other tab there is no resume button.
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
      tabResumes: [
        { tab: 'unreal', url: 'https://example.com/resume/unreal.pdf', label: 'Unreal Resume' },
        { tab: 'unity', url: '', label: 'Unity Resume' },
        { tab: 'all', url: 'https://example.com/resume/everything.pdf', label: '' },
      ],
    }),
    track({
      id: 'softdev',
      route: 'softdev',
      label: 'Software',
      defaultTab: 'webapps',
      resumeUrl: '',
      resumeLabel: '',
      tabResumes: [{ tab: 'webapps', url: 'https://example.com/resume/web.pdf', label: '' }],
    }),
  ],
  projects: [],
  experience: [],
  skills: [],
  links: [link({ slug: 'github', label: 'GitHub', url: 'https://github.com/example', icon: 'github' })],
  education: [],
  certificates: [],
};
