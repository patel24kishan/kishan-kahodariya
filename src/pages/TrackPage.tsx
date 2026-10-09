import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getCertificates,
  getEducation,
  getExperience,
  getHeroStats,
  getLinks,
  getProjects,
  getResume,
  getSite,
  getSkillGroups,
  getSummary,
  getTabs,
  getTrack,
  type Project,
  type TrackId,
} from '@/content';
import { SkipLink } from '@/components/ui';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteNav } from '@/components/layout/SiteNav';
import { MAIN_ID, PAGE_TOP_ID } from '@/components/layout/sections';
import { Education } from '@/components/sections/Education';
import { Experience } from '@/components/sections/Experience';
import { Hero } from '@/components/sections/Hero';
import { Projects } from '@/components/sections/Projects';
import { Skills } from '@/components/sections/Skills';
import { MediaViewer } from '@/components/viewer/MediaViewer';
import { parseViewerSearch, withViewerSearch, type ViewerItemRef } from '@/components/viewer/viewerState';
import styles from './TrackPage.module.css';

/**
 * CONTRACT (architect): the one public page component. Rendered for "/", "/gamedev",
 * "/gamedev/:tab", "/softdev" and "/softdev/:tab". The router resolves the tab with
 * resolveTab() before rendering, so `tab` is always a valid tab id.
 *
 * The root element carries data-testid="track-page", data-track and data-tab (the hook every
 * routing and prerender test reads). data-track also selects the accent (tokens.css).
 *
 * The media viewer's state is the query string (?view=<slug>&item=…). It is read only after
 * hydration, so the server markup and the first client render are identical, and a pasted
 * link opens the viewer a moment later. Opening pushes a history entry (Back closes it),
 * moving between items replaces it, closing goes back when it opened that way.
 */
export interface TrackPageProps {
  track: TrackId;
  tab: string;
}

export default function TrackPage({ track, tab }: TrackPageProps) {
  const site = getSite();
  const profile = getTrack(track);
  const tabs = getTabs();
  const projects = getProjects(track, tab);
  const heroStats = getHeroStats(track);
  // The resume follows the open project tab: a tab can have its own, the others use the page's.
  const resume = getResume(track, tab);
  // So does the summary: a tab's own text when it has one, otherwise the page's.
  const summary = getSummary(track, tab);
  const footerLinks = getLinks(track, 'footer');
  const experience = getExperience(track);
  const skillGroups = getSkillGroups(track);
  const education = getEducation();
  const certificates = getCertificates(track);

  // ---- Media viewer: address → state, after hydration only ----------------------------
  const location = useLocation();
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const request = hydrated ? parseViewerSearch(location.search) : null;
  const allProjects = useMemo(() => getProjects(track, 'all'), [track]);
  const viewed = request ? allProjects.find((project) => project.slug === request.slug) : undefined;

  const openerRef = useRef<HTMLElement | null>(null);
  const pushedRef = useRef(false);

  const openViewer = useCallback(
    (project: Project, item: ViewerItemRef, opener: HTMLElement) => {
      openerRef.current = opener;
      pushedRef.current = true;
      void navigate({ search: withViewerSearch(location.search, { slug: project.slug, item }) });
    },
    [navigate, location.search],
  );

  const moveViewer = useCallback(
    (item: ViewerItemRef) => {
      if (!viewed) return;
      void navigate({ search: withViewerSearch(location.search, { slug: viewed.slug, item }) }, { replace: true });
    },
    [navigate, location.search, viewed],
  );

  const closeViewer = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      void navigate(-1);
    } else {
      void navigate({ search: withViewerSearch(location.search, null) }, { replace: true });
    }
  }, [navigate, location.search]);

  return (
    <div id={PAGE_TOP_ID} className={styles.page} data-testid="track-page" data-track={track} data-tab={tab}>
      <SkipLink href={`#${MAIN_ID}`} />
      <SiteNav monogram={site.monogram} siteName={site.name} logo={site.logo} logoAlt={site.logoAlt} contactLabel={site.contactLabel} email={site.email} />
      <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
        <Hero track={profile} name={site.name} summary={summary} resume={resume} workLabel={site.workLabel} stats={heroStats} />
        <Projects track={profile} tab={tab} tabs={tabs} projects={projects} onOpen={openViewer} />
        <Experience entries={experience} />
        <Skills track={track} groups={skillGroups} />
        <Education education={education} certificates={certificates} certificatesFirst={profile.certificatesFirst} />
      </main>
      <SiteFooter links={footerLinks} credit={site.credit} contactLabel={site.contactLabel} />
      {viewed && request && <MediaViewer project={viewed} item={request.item} opener={openerRef.current} onItemChange={moveViewer} onClose={closeViewer} />}
    </div>
  );
}
