/**
 * Mounts the real SiteNav, Hero and Projects (for its tab links) over a hand-built content
 * bundle — see hero-fixture.html. Test-only: nothing in src/ imports this file.
 *
 * The page below is wired the way src/pages/TrackPage.tsx is: the open tab comes from the
 * address (resolveTab), the resume from getResume(track, tab), both through the real
 * selectors (createContentApi) over FIXTURE_CONTENT (hero-fixture.content.ts, which the spec
 * imports too, to compute what it expects).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { SiteNav } from '@/components/layout/SiteNav';
import { Hero } from '@/components/sections/Hero';
import { Projects } from '@/components/sections/Projects';
import { createContentApi } from '@/content/selectors';
import type { TrackId } from '@/content/types';
import { ThemeProvider } from '@/theme';
import { FIXTURE_CONTENT, LOGO_SOURCES, type LogoCase } from './hero-fixture.content';

const api = createContentApi(FIXTURE_CONTENT);

function Page({ trackId, logo }: { trackId: TrackId; logo: LogoCase }) {
  const { tab: tabSegment } = useParams();
  const tab = api.resolveTab(trackId, tabSegment);
  const site = api.getSite();
  const profile = api.getTrack(trackId);
  return (
    <div id="top" data-testid="hero-fixture" data-track={trackId} data-tab={tab}>
      <SiteNav monogram={site.monogram} siteName={site.name} logo={LOGO_SOURCES[logo]} logoAlt={site.logoAlt} />
      <main>
        <Hero track={profile} name={site.name} monogram={site.monogram} resume={api.getResume(trackId, tab)} links={api.getLinks(trackId, 'hero')} />
        <Projects track={profile} tab={tab} tabs={api.getTabs()} projects={[]} onOpen={() => undefined} />
      </main>
    </div>
  );
}

const params = new URLSearchParams(window.location.search);
const trackId: TrackId = params.get('track') === 'softdev' ? 'softdev' : 'game';
const requestedLogo = params.get('logo');
const logo: LogoCase = requestedLogo === 'none' || requestedLogo === 'broken' ? requestedLogo : 'ok';
const route = api.getTrack(trackId).route;
const start = params.get('path') ?? `/${route}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path={`/${route}`} element={<Page trackId={trackId} logo={logo} />} />
          <Route path={`/${route}/:tab`} element={<Page trackId={trackId} logo={logo} />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
);
