import type { MouseEvent } from 'react';
import { getHoverText, type Project, type ProjectLink } from '@/content';
import { Button, Chip, LinkButton, MediaOverlayButton, cx, type ButtonVariant, type IconName } from '@/components/ui';
import { assetUrl, isExternalUrl } from '@/lib/paths';
import type { ViewerItemRef } from '@/components/viewer/viewerState';
import styles from './ProjectCard.module.css';

export interface ProjectCardProps {
  project: Project;
  /** Open the media viewer at `item`; `opener` is the element focus returns to on close. */
  onOpen: (project: Project, item: ViewerItemRef, opener: HTMLElement) => void;
}

/**
 * Icon for a project link. Every "View Code" link (kind `code`) shows the one code icon and
 * every "Play" link (kind `play`) the one game-controller icon, whatever the host; the other kinds go by
 * host when it is a known site, else show the external-link icon.
 */
export function linkIcon(link: ProjectLink): IconName {
  if (link.kind === 'code') return 'gitlab';
  // The game controller (the glyph also used for itch.io).
  if (link.kind === 'play') return 'itchio';
  let host = '';
  try {
    host = new URL(link.url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = '';
  }
  if (host === 'github.com') return 'github';
  if (host === 'gitlab.com') return 'gitlab';
  if (host === 'itch.io' || host.endsWith('.itch.io')) return 'itchio';
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host.endsWith('steampowered.com') || host.endsWith('steamcommunity.com')) return 'steam';
  // "video" on a host that is not YouTube is just an address somewhere else.
  return 'external';
}

/** The project's links that have somewhere to go. Links with an empty url are not rendered. */
export function renderableLinks(project: Project): ProjectLink[] {
  return project.links.filter((link) => link.url.trim() !== '');
}

/** "Play" links are primary actions (accent fill, like Demo); every other kind is outline. */
export function linkVariant(link: ProjectLink): ButtonVariant {
  return link.kind === 'play' ? 'accent' : 'outline';
}

/**
 * ProjectCard — media button (the screenshots as a slideshow when there are several, the
 * first one when there is one, or a designed placeholder), tag chips, title, date, the
 * owner's short description verbatim, then the link buttons (Play filled with the accent,
 * the rest outline) and a filled "Demo" button when there is a video. A featured project
 * gets the accent border.
 */
export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const shot = project.screenshots[0];
  const slides = project.screenshots.map((screenshot) => ({ src: assetUrl(screenshot.src), alt: screenshot.alt }));
  const links = renderableLinks(project);
  const hasVideo = project.videoUrl.trim() !== '';

  // The viewer opens at the screenshot on show (or at the video when there is no screenshot).
  const openFromMedia = (index: number, button: HTMLButtonElement) => onOpen(project, shot ? { kind: 'screenshot', index } : { kind: 'video' }, button);
  const openVideo = (event: MouseEvent<HTMLButtonElement>) => onOpen(project, { kind: 'video' }, event.currentTarget);

  return (
    <article className={cx(styles.card, project.featured && styles.featured)} data-project={project.slug} data-featured={project.featured || undefined}>
      <MediaOverlayButton
        src={shot ? assetUrl(shot.src) : ''}
        alt={shot?.alt ?? `${project.title} preview`}
        slides={slides}
        width={1600}
        height={900}
        label={getHoverText(project)}
        icon={hasVideo ? 'play' : 'image'}
        referrerPolicy="no-referrer"
        className={styles.media}
        onOpen={openFromMedia}
        data-viewer-opener={project.slug}
        fallback={<MediaPlaceholder title={project.title} />}
      />
      <div className={styles.body}>
        {project.tags.length > 0 && (
          <ul role="list" className={styles.tags} aria-label="Tags">
            {project.tags.map((tag, index) => (
              <Chip key={`${index}-${tag}`} as="li" size="sm" shape="pill">
                {tag}
              </Chip>
            ))}
          </ul>
        )}
        <h3 className={styles.title}>{project.title}</h3>
        {project.dateDisplay && (
          <p className={styles.date} data-numeric>
            {project.dateDisplay}
          </p>
        )}
        {project.shortDescription && <p className={styles.description}>{project.shortDescription}</p>}
      </div>
      {(links.length > 0 || hasVideo) && (
        <div className={styles.actions}>
          {links.map((link, index) => (
            <LinkButton key={`${index}-${link.label}`} variant={linkVariant(link)} icon={linkIcon(link)} href={link.url} external={isExternalUrl(link.url)} data-project-link={link.kind}>
              {link.label}
            </LinkButton>
          ))}
          {hasVideo && (
            <Button variant="accent" icon="video" onClick={openVideo} data-project-gameplay>
              Demo
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** The media box when a project has no screenshot or its image does not load. */
function MediaPlaceholder({ title }: { title: string }) {
  const initial = Array.from(title.trim())[0] ?? '·';
  return (
    <span className={styles.placeholder} data-media-placeholder>
      <span className={styles.placeholderGlyph} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.placeholderText}>No preview yet</span>
    </span>
  );
}
