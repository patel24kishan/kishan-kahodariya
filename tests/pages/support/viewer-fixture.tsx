/**
 * Mounts the media viewer (and the projects section) with fixture projects — see
 * viewer-fixture.html. Test-only: nothing in src/ imports this file.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from '@/components/sections/Projects';
import { MediaViewer } from '@/components/viewer/MediaViewer';
import type { ViewerItemRef } from '@/components/viewer/viewerState';
import type { Project, TrackProfile } from '@/content/types';
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
    audience: 'game',
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
    slug: 'gallery',
    title: 'Gallery Fixture',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    screenshots: [
      { src: svgShot('Shot 1', '#3a4a6a'), alt: 'Gallery shot one' },
      { src: svgShot('Shot 2', '#4a3a6a'), alt: 'Gallery shot two' },
      { src: 'https://images.invalid/gallery-3.png', alt: 'Gallery shot three' },
    ],
    links: [
      { label: 'View Code', url: 'https://example.com/code', kind: 'code' },
      { label: 'Hidden Link', url: '', kind: 'other' },
    ],
  }),
  project({
    slug: 'odd-video',
    title: 'Odd Video Fixture',
    videoUrl: 'https://example.com/videos/not-on-youtube',
    screenshots: [{ src: svgShot('Odd', '#6a3a3a'), alt: 'Odd video shot' }],
  }),
  project({ slug: 'no-media', title: 'No Media Fixture' }),
];

const FIXTURE_TRACK: TrackProfile = {
  id: 'game',
  route: 'gamedev',
  label: 'Game Dev',
  headline: '',
  summary: '',
  resumeUrl: '',
  resumeLabel: '',
  tabResumes: [],
  defaultTab: 'unity',
  photo: '',
  photoAlt: '',
  heroVideo: '',
  heroPoster: '',
  badgeLine1: '',
  badgeLine2: '',
  certificatesFirst: false,
  metaTitle: '',
  metaDescription: '',
};

const FIXTURE_TABS = [
  { id: 'unity', label: 'Unity3D' },
  { id: 'all', label: 'All' },
];

interface Open {
  slug: string;
  item: ViewerItemRef | null;
}

function Fixture() {
  const [open, setOpen] = useState<Open | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const current = open ? FIXTURE_PROJECTS.find((candidate) => candidate.slug === open.slug) : undefined;

  const launch = (slug: string, item: ViewerItemRef | null) => (event: React.MouseEvent<HTMLButtonElement>) => {
    setOpener(event.currentTarget);
    setOpen({ slug, item });
  };

  return (
    <div data-track="game" data-testid="viewer-fixture" data-fixture-open={open ? open.slug : 'none'} data-fixture-item={open?.item ? (open.item.kind === 'video' ? 'video' : String(open.item.index + 1)) : 'none'}>
      <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <h1>Viewer fixture</h1>
        <button type="button" onClick={launch('gallery', { kind: 'screenshot', index: 0 })} data-open="gallery">
          Open gallery
        </button>
        <button type="button" onClick={launch('gallery', { kind: 'video' })} data-open="gallery-video">
          Open gallery video
        </button>
        <button type="button" onClick={launch('gallery', { kind: 'screenshot', index: 2 })} data-open="gallery-broken">
          Open gallery broken shot
        </button>
        <button type="button" onClick={launch('odd-video', { kind: 'video' })} data-open="odd-video">
          Open odd video
        </button>
        <button type="button" onClick={launch('no-media', null)} data-open="no-media">
          Open no media
        </button>
        <MemoryRouter initialEntries={['/gamedev/unity']}>
          <Projects track={FIXTURE_TRACK} tab="unity" tabs={FIXTURE_TABS} projects={[]} onOpen={() => {}} />
        </MemoryRouter>
      </main>
      {current && open && (
        <MediaViewer
          project={current}
          item={open.item}
          opener={opener}
          onItemChange={(item) => setOpen({ slug: current.slug, item })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Fixture />
    </ThemeProvider>
  </StrictMode>,
);
