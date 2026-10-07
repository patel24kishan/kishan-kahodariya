/**
 * Mounts the projects section (real ProjectCard) with fixture projects — see card-fixture.html.
 * Test-only: nothing in src/ imports this file. What a card asks to open is written on the
 * root as data attributes, so a test can read the viewer request without a viewer.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from '@/components/sections/Projects';
import type { ViewerItemRef } from '@/components/viewer/viewerState';
import type { Project, TrackId, TrackProfile } from '@/content/types';
import { ThemeProvider } from '@/theme';

function svgShot(label: string, fill: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="${fill}"/><text x="800" y="480" font-family="sans-serif" font-size="120" text-anchor="middle" fill="#ffffff">${label}</text></svg>`,
  )}`;
}

function project(overrides: Partial<Project> & Pick<Project, 'slug' | 'title'>): Project {
  return {
    shortDescription: '',
    longDescription: '',
    dateDisplay: '',
    tags: [],
    category: 'unity',
    audience: 'both',
    featured: false,
    published: true,
    orderGame: 0,
    orderSoftdev: 0,
    hoverText: '',
    screenshots: [],
    videoUrl: '',
    links: [],
    legacyId: null,
    ...overrides,
  };
}

export const FIXTURE_PROJECTS: Project[] = [
  project({
    slug: 'slider',
    title: 'Slider Fixture',
    hoverText: 'View Gameplay & Screenshots',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    screenshots: [
      { src: svgShot('Shot 1', '#3a4a6a'), alt: 'Slider shot one' },
      { src: svgShot('Shot 2', '#4a3a6a'), alt: 'Slider shot two' },
      { src: svgShot('Shot 3', '#2f5a4a'), alt: 'Slider shot three' },
    ],
    links: [
      { label: 'View Code', url: 'https://github.com/example/slider', kind: 'code' },
      { label: 'Play', url: 'https://example.itch.io/slider', kind: 'play' },
    ],
  }),
  project({
    slug: 'slider-broken',
    title: 'Slider Broken Fixture',
    hoverText: 'View Screenshots',
    screenshots: [
      { src: svgShot('Shot 1', '#5a3a2f'), alt: 'Broken slider shot one' },
      { src: 'https://images.invalid/slider-2.png', alt: 'Broken slider shot two' },
      { src: svgShot('Shot 3', '#2f4a5a'), alt: 'Broken slider shot three' },
    ],
  }),
  project({
    slug: 'single',
    title: 'Single Fixture',
    hoverText: 'View Screenshots',
    screenshots: [{ src: svgShot('Only', '#6a3a3a'), alt: 'Single shot' }],
    links: [
      { label: 'View Code', url: 'https://gitlab.com/example/single', kind: 'code' },
      { label: 'Play', url: 'https://single.example.com/', kind: 'play' },
      { label: 'Website', url: 'https://example.github.io/single/', kind: 'demo' },
      { label: 'Watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'video' },
      { label: 'Play Store', url: 'https://play.google.com/store/apps/details?id=example', kind: 'store' },
      { label: 'Hidden', url: '', kind: 'play' },
    ],
  }),
  project({
    slug: 'none',
    title: 'No Screenshot Fixture',
    hoverText: 'View Gameplay',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  }),
];

function trackProfile(id: TrackId): TrackProfile {
  return {
    id,
    route: id === 'game' ? 'gamedev' : 'softdev',
    label: id === 'game' ? 'Game Dev' : 'Software',
    headline: '',
    summary: '',
    resumeUrl: '',
    resumeLabel: '',
    defaultTab: 'unity',
    photo: '',
    photoAlt: '',
    certificatesFirst: false,
    metaTitle: '',
    metaDescription: '',
  };
}

const FIXTURE_TABS = [
  { id: 'unity', label: 'Unity3D' },
  { id: 'all', label: 'All' },
];

interface Opened {
  slug: string;
  item: ViewerItemRef;
  opener: string;
}

function itemText(item: ViewerItemRef): string {
  return item.kind === 'video' ? 'video' : String(item.index + 1);
}

function Fixture({ track }: { track: TrackId }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  return (
    <div
      data-track={track}
      data-testid="card-fixture"
      data-fixture-open={opened ? opened.slug : 'none'}
      data-fixture-item={opened ? itemText(opened.item) : 'none'}
      data-fixture-opener={opened ? opened.opener : 'none'}
    >
      <main style={{ padding: 24 }}>
        <h1>Card fixture</h1>
        <MemoryRouter initialEntries={['/gamedev/all']}>
          <Projects
            track={trackProfile(track)}
            tab="all"
            tabs={FIXTURE_TABS}
            projects={FIXTURE_PROJECTS}
            onOpen={(target, item, opener) => setOpened({ slug: target.slug, item, opener: opener.getAttribute('data-viewer-opener') ?? opener.tagName.toLowerCase() })}
          />
        </MemoryRouter>
      </main>
    </div>
  );
}

const requested = new URLSearchParams(window.location.search).get('track');
const track: TrackId = requested === 'softdev' ? 'softdev' : 'game';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Fixture track={track} />
    </ThemeProvider>
  </StrictMode>,
);
