import { Link } from 'react-router-dom';
import type { Project, Tab, TrackProfile } from '@/content';
import { Reveal } from '@/components/motion';
import { Section, SegmentedTabs, buttonClassName } from '@/components/ui';
import { trackPath } from '@/lib/paths';
import type { ViewerItemRef } from '@/components/viewer/viewerState';
import { ProjectCard } from './ProjectCard';
import styles from './Projects.module.css';

export interface ProjectsProps {
  track: TrackProfile;
  /** The open tab id (always valid). */
  tab: string;
  /** getTabs() — every tab, the "all" tab last. */
  tabs: Tab[];
  /** getProjects(track, tab). */
  projects: Project[];
  onOpen: (project: Project, item: ViewerItemRef, opener: HTMLElement) => void;
}

/**
 * Projects (#projects) — the title on the left and the segmented tab control on the right (router
 * links, so the address always reflects the open tab and a tab change keeps the scroll position),
 * then the card grid: 1 / 2 / 3 columns by breakpoint, the cards rising in with a small stagger.
 * A tab with no projects shows an empty state.
 */
export function Projects({ track, tab, tabs, projects, onOpen }: ProjectsProps) {
  const items = tabs.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    href: trackPath(track, candidate.id),
    current: candidate.id === tab,
  }));
  const current = tabs.find((candidate) => candidate.id === tab);
  const allTab = tabs.find((candidate) => candidate.id === 'all');

  return (
    <Section
      id="projects"
      title="Projects"
      actions={<SegmentedTabs label="Project categories" items={items} className={styles.tabs} renderLink={(item, props) => <Link to={item.href} {...props} />} />}
    >
      {projects.length > 0 ? (
        <ul role="list" className={styles.grid} data-testid="project-grid">
          {projects.map((project, index) => (
            <Reveal as="li" key={project.slug} className={styles.cell} delay={(index % 3) * 90}>
              <ProjectCard project={project} onOpen={onOpen} />
            </Reveal>
          ))}
        </ul>
      ) : (
        <div className={styles.empty} data-testid="projects-empty">
          <p className={styles.emptyTitle}>Nothing here yet</p>
          <p className={styles.emptyText}>{current ? `There are no ${current.label} projects to show at the moment.` : 'There are no projects to show at the moment.'}</p>
          {allTab && tab !== allTab.id && (
            <Link to={trackPath(track, allTab.id)} className={buttonClassName({ variant: 'outline' })}>
              Browse {allTab.label} Projects
            </Link>
          )}
        </div>
      )}
    </Section>
  );
}
