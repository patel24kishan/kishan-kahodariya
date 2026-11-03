import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/permanent-marker/latin-400.css';
import { getTrack, type PopupSettings } from '@/content';
import { Icon } from '@/components/ui';
import { assetUrl, isExternalUrl, trackPath } from '@/lib/paths';
import styles from './PopupDialog.module.css';

export interface PopupDialogProps {
  popup: PopupSettings;
  resume: { url: string; label: string };
  email: string;
  onClose: () => void;
}

const TITLE_ID = 'welcome-popup-title';
const FOCUSABLE = 'a[href], button:not([disabled])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
}

/**
 * The popup itself: a native modal <dialog> (focus trapped, Esc closes, the page behind is
 * inert and does not scroll). Mounted only while open, so it never renders on the server.
 * The look follows the Design canvas, option D: a framed card that flips in, with the
 * "Open to work" name tag dropping from behind it. Every text comes from site settings.
 */
export default function PopupDialog({ popup, resume, email, onClose }: PopupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  };

  // Open as a modal and lock the page behind it (same approach as the media viewer).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = 'hidden';
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-popup-close]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      html.style.overflow = previous.overflow;
      html.style.paddingRight = previous.paddingRight;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const list = focusable(event.currentTarget);
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // A click outside the content (on the dimmed page) closes.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target instanceof Element && event.target.closest('[data-popup-content]')) return;
    requestClose();
  };

  const resumeUrl = resume.url.trim();
  const resumeNewTab = isExternalUrl(resumeUrl);
  const mail = email.trim();
  const hasSayHi = mail !== '' && popup.sayHiLabel.trim() !== '';
  const hasUtility = resumeUrl !== '' || hasSayHi;
  const hasTag = [popup.tagBand, popup.tagGreeting, popup.tagName, popup.tagRole].some((part) => part.trim() !== '');
  const heading = popup.heading.trim();

  const action = (id: 'game' | 'softdev', label: string, className: string) => {
    if (label.trim() === '') return null;
    return (
      <Link to={trackPath(getTrack(id))} className={`${styles.action} ${className}`} onClick={requestClose} data-popup-action={id}>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>{label}</span>
          {popup.tapHint.trim() !== '' && <span className={styles.actionHint}>{popup.tapHint}</span>}
        </span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </Link>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.popup}
      aria-labelledby={heading !== '' ? TITLE_ID : undefined}
      aria-label={heading === '' ? 'Welcome' : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={(event) => {
        if (event.currentTarget.isConnected && !event.currentTarget.open) requestClose();
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      data-testid="welcome-popup"
    >
      <div className={styles.column} data-popup-content data-on-dark>
        <div className={styles.top}>
          <h2 id={TITLE_ID} className={styles.heading}>
            {heading}
          </h2>
          <button type="button" className={styles.close} aria-label="Close the popup" onClick={requestClose} data-popup-close>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.card}>
          <div className={styles.frame}>
            <div className={styles.inner}>
              <div className={styles.picture}>
                <img src={assetUrl('/images/popup-hero.jpg')} alt="Cartoon game developer at his desk with a controller" width={1200} height={630} className={styles.image} />
                {popup.bubble.trim() !== '' && <div className={styles.bubble}>{popup.bubble}</div>}
              </div>
              {popup.message.trim() !== '' && <p className={styles.message}>{popup.message}</p>}
            </div>
            <span className={styles.shine} aria-hidden="true" />
          </div>

          {(popup.gameLabel.trim() !== '' || popup.softLabel.trim() !== '') && (
            <div className={styles.actions}>
              {action('game', popup.gameLabel, styles.game ?? '')}
              {action('softdev', popup.softLabel, styles.soft ?? '')}
            </div>
          )}

          {hasUtility && (
            <div className={styles.utility}>
              {resumeUrl !== '' && (
                <a
                  href={resumeUrl}
                  className={styles.utilityLink}
                  {...(resumeNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  data-popup-resume
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                    <path d="M6 3h8l4 4v14H6V3Z" />
                    <path d="M14 3v4h4" />
                  </svg>
                  {resume.label.trim() || 'Resume'}
                  {resumeNewTab && <span className={styles.srOnly}> (opens in a new tab)</span>}
                </a>
              )}
              {hasSayHi && (
                <a href={`mailto:${mail}`} className={styles.utilityLink} data-popup-mail>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                    <path d="M3 5h18v14H3V5Z" />
                    <path d="M3 6l9 7 9-7" />
                  </svg>
                  {popup.sayHiLabel}
                </a>
              )}
            </div>
          )}
        </div>

        {hasTag && (
          <div className={styles.tag} data-popup-tag>
            <div className={styles.tagBody}>
              <span className={styles.slot} aria-hidden="true" />
              {popup.tagBand.trim() !== '' && (
                <div className={styles.band}>
                  <span className={styles.dot} aria-hidden="true" />
                  {popup.tagBand}
                  <span className={styles.gleam} aria-hidden="true" />
                </div>
              )}
              <div className={styles.tagText}>
                {popup.tagGreeting.trim() !== '' && <div className={styles.greeting}>{popup.tagGreeting}</div>}
                {popup.tagName.trim() !== '' && (
                  <div className={styles.name}>
                    {popup.tagName}
                    <span className={styles.ink} aria-hidden="true" />
                  </div>
                )}
                {popup.tagRole.trim() !== '' && <div className={styles.role}>{popup.tagRole}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
