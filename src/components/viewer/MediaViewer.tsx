import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { Project } from '@/content';
import { Icon, IconButton, LinkButton, cx } from '@/components/ui';
import { assetUrl, isExternalUrl } from '@/lib/paths';
import { ContentImage } from '@/components/sections/ContentImage';
import { linkIcon, renderableLinks } from '@/components/sections/ProjectCard';
import { itemRefOf, resolveItemIndex, viewerItems, type ViewerItem, type ViewerItemRef } from './viewerState';
import { youtubeEmbedUrl } from './youtube';
import styles from './MediaViewer.module.css';

export interface MediaViewerProps {
  project: Project;
  /** The item the address asks for; resolved against the project's media. */
  item: ViewerItemRef | null;
  /** The element that opened the viewer. Focus returns to it on close (else to the project's card). */
  opener: HTMLElement | null;
  /** The visitor moved to another item (thumbnail, arrow button, arrow key, swipe). */
  onItemChange: (item: ViewerItemRef) => void;
  /** The visitor asked to close (close button, Esc, backdrop click). */
  onClose: () => void;
}

const TITLE_ID = 'viewer-title';
const POSITION_ID = 'viewer-position';
const SWIPE_DISTANCE = 48;
const FOCUSABLE = 'a[href], button:not([disabled]), iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
}

function positionLabel(current: ViewerItem | undefined, screenshotCount: number): string {
  if (!current) return 'No media yet';
  if (current.kind === 'video') return 'Gameplay Video';
  return `Screenshot ${current.index + 1} of ${screenshotCount}`;
}

/**
 * MediaViewer — a native modal <dialog> over the page (black 70% backdrop; the page stays
 * visible and keeps its scroll position). Close button, project title and position label,
 * the project's links, the media on a solid dark panel, previous / next, and a thumbnail
 * strip with the video first. Esc closes (and so does a click on the backdrop), Left / Right
 * move, Home / End jump, Tab stays inside, swipe left / right moves on touch. The YouTube
 * iframe exists only while the video item is shown, so leaving it stops playback.
 *
 * The viewer's state lives in the address (see viewerState.ts); this component only reports
 * what the visitor did. It is mounted only while open, so it never renders on the server.
 */
export function MediaViewer({ project, item, opener, onItemChange, onClose }: MediaViewerProps) {
  const items = useMemo(() => viewerItems(project), [project]);
  const index = resolveItemIndex(items, item);
  const current = items[index];
  const screenshotCount = items.filter((candidate) => candidate.kind === 'screenshot').length;
  const links = renderableLinks(project);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const swipeRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const go = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      const next = items[(index + delta + items.length) % items.length];
      if (next) onItemChange(itemRefOf(next));
    },
    [items, index, onItemChange],
  );

  // Open as a modal and lock the page behind it. Hiding the page's overflow removes a classic
  // scrollbar and would widen the content by its width; the same width is given back as
  // padding so nothing shifts (overlay scrollbars measure 0 and get none). Focus the close
  // button; on unmount close the dialog, restore the page and hand focus back to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = 'hidden';
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-viewer-close]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      html.style.overflow = previous.overflow;
      html.style.paddingRight = previous.paddingRight;
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`[data-viewer-opener="${CSS.escape(project.slug)}"]`);
      target?.focus();
    };
  }, [project.slug, opener]);

  // Keep the current thumbnail in view.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-thumb][aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        go(1);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        go(-1);
        return;
      case 'Home':
        if (items[0] && index !== 0) onItemChange(itemRefOf(items[0]));
        event.preventDefault();
        return;
      case 'End': {
        const last = items[items.length - 1];
        if (last && index !== items.length - 1) onItemChange(itemRefOf(last));
        event.preventDefault();
        return;
      }
      case 'Tab': {
        const dialog = event.currentTarget;
        const list = focusable(dialog);
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }
      default:
    }
  };

  // A click on the backdrop (anything that is not part of the viewer's content) closes.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    if (event.target instanceof Element && event.target.closest('[data-viewer-content]')) return;
    requestClose();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    swipeRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedRef.current = true;
    go(dx < 0 ? 1 : -1);
  };

  const onPointerCancel = () => {
    swipeRef.current = null;
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.viewer}
      aria-labelledby={TITLE_ID}
      aria-describedby={POSITION_ID}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={(event) => {
        // The browser closed it on its own (a forced close): follow it. A close event that
        // arrives after the viewer re-opened (development double effects) or after the
        // element left the document is not an instruction.
        if (event.currentTarget.isConnected && !event.currentTarget.open) requestClose();
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-testid="media-viewer"
      data-viewer-project={project.slug}
      data-viewer-item={current ? (current.kind === 'video' ? 'video' : String(current.index + 1)) : 'none'}
    >
      <div className={styles.frame} data-on-dark>
        <div className={styles.bar} data-viewer-content>
          <IconButton icon="close" label="Close viewer" shape="circle" className={styles.close} onClick={requestClose} data-viewer-close />
          <div className={styles.heading}>
            <h2 id={TITLE_ID} className={styles.title}>
              {project.title}
            </h2>
            <p id={POSITION_ID} className={styles.position} aria-live="polite" data-viewer-position>
              {positionLabel(current, screenshotCount)}
            </p>
          </div>
          {links.length > 0 && (
            <ul role="list" className={styles.links} aria-label="Project links">
              {links.map((link, linkIndex) => (
                <li key={`${linkIndex}-${link.label}`}>
                  <LinkButton variant="outline" icon={linkIcon(link)} href={link.url} external={isExternalUrl(link.url)} data-viewer-link={link.kind}>
                    {link.label}
                  </LinkButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.stage} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} data-viewer-stage>
          <IconButton
            icon="chevron-left"
            label="Previous"
            shape="circle"
            className={cx(styles.arrow, styles.previous)}
            onClick={() => go(-1)}
            disabled={items.length < 2}
            data-viewer-previous
            data-viewer-content
          />
          <div className={styles.panel} data-viewer-content data-viewer-panel>
            {current ? <Media key={current.key} item={current} projectTitle={project.title} /> : <p className={styles.note}>This project has no screenshots or video yet.</p>}
          </div>
          <IconButton
            icon="chevron-right"
            label="Next"
            shape="circle"
            className={cx(styles.arrow, styles.next)}
            onClick={() => go(1)}
            disabled={items.length < 2}
            data-viewer-next
            data-viewer-content
          />
        </div>

        {items.length > 1 && (
          <ul role="list" className={styles.thumbs} aria-label="Media" data-viewer-content data-viewer-thumbs>
            {items.map((candidate, candidateIndex) => {
              const isCurrent = candidateIndex === index;
              return (
                <li key={candidate.key} className={styles.thumbItem}>
                  <button
                    type="button"
                    className={cx(styles.thumb, isCurrent && styles.thumbCurrent)}
                    aria-current={isCurrent ? 'true' : undefined}
                    aria-label={candidate.kind === 'video' ? 'Gameplay video' : `Screenshot ${candidate.index + 1}`}
                    onClick={() => onItemChange(itemRefOf(candidate))}
                    data-thumb={candidate.kind === 'video' ? 'video' : String(candidate.index + 1)}
                  >
                    {candidate.kind === 'video' ? (
                      <span className={styles.thumbVideo}>
                        <Icon name="play" size={16} />
                        <span>Gameplay</span>
                      </span>
                    ) : (
                      <ContentImage
                        src={assetUrl(candidate.src)}
                        alt=""
                        width={160}
                        height={90}
                        className={styles.thumbImage}
                        draggable={false}
                        fallback={
                          <span className={styles.thumbFallback}>
                            <Icon name="image" size={18} />
                          </span>
                        }
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}

/** The current item: a screenshot, the YouTube embed, or a fallback panel. */
function Media({ item, projectTitle }: { item: ViewerItem; projectTitle: string }) {
  if (item.kind === 'screenshot') {
    return (
      <ContentImage
        src={assetUrl(item.src)}
        alt={item.alt}
        width={1600}
        height={900}
        loading="eager"
        fetchPriority="high"
        className={styles.image}
        draggable={false}
        data-viewer-image
        fallback={
          <div className={styles.fallback} data-viewer-fallback="image">
            <Icon name="image" size={36} className={styles.fallbackIcon} />
            <p className={styles.note}>This screenshot could not be loaded.</p>
            {item.src && (
              <LinkButton variant="outline" icon="external" href={assetUrl(item.src)} external>
                Open Image
              </LinkButton>
            )}
          </div>
        }
      />
    );
  }
  if (item.videoId) {
    return (
      <iframe
        className={styles.video}
        src={youtubeEmbedUrl(item.videoId, { autoplay: true })}
        title={`${projectTitle} — gameplay video`}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        data-viewer-video
      />
    );
  }
  return (
    <div className={styles.fallback} data-viewer-fallback="video">
      <Icon name="youtube" size={36} className={styles.fallbackIcon} />
      <p className={styles.note}>This video can’t be played inside the viewer.</p>
      <LinkButton variant="accent" icon="external" href={item.url} external>
        Open Video
      </LinkButton>
    </div>
  );
}
