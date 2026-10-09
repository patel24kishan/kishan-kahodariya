import { useCallback, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { Icon } from '@/components/ui';
import { ThemeToggle } from '@/theme';
import type { PageSection } from './sections';
import styles from './PhoneMenu.module.css';

export interface PhoneMenuProps {
  /** The page's sections, in page order. */
  sections: readonly PageSection[];
  /** Id of the section in view (marked with aria-current), or null. */
  activeId: string | null;
  /** Text of the "Get in touch" button. */
  contactLabel: string;
  /** Its mailto: address. "" hides the button. */
  contactHref: string;
  /** The logo's final URL (already through assetUrl()). "" shows the monogram. */
  logoSrc: string;
  monogram: string;
  /** The menu button. Focus goes back to it when the menu closes. */
  opener: RefObject<HTMLElement | null>;
  /** The visitor asked to close: the close button, Esc, or a link was chosen. */
  onClose: () => void;
}

/** Id of the dialog, for the menu button's aria-controls. */
export const PHONE_MENU_ID = 'site-menu';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The n-th row of the menu starts its slide n steps later. */
function step(index: number): CSSProperties {
  return { '--menu-step': index } as CSSProperties;
}

/**
 * PhoneMenu — the full-screen menu of the phone layout: the section links (large, each sliding
 * up in turn), the "Get in touch" button, then "Theme" with the theme toggle. Near-black in
 * both themes, like the hero it opens over.
 *
 * A native modal <dialog>, mounted only while open (so, closed, there is nothing to focus or
 * to announce, and it never renders on the server). showModal() puts it above everything and
 * makes the page behind it inert; Tab wraps inside; Esc, the close button and choosing a link
 * close it; the page behind does not scroll while it is open. Closing hands focus back to the
 * menu button.
 */
export function PhoneMenu({ sections, activeId, contactLabel, contactHref, logoSrc, monogram, opener, onClose }: PhoneMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A layout effect: its clean-up runs while the dialog is still in the document, so close()
  // works as designed. Hiding the page's overflow removes a classic scrollbar and would widen
  // the content by its width; the same width is given back as padding so nothing shifts.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnTo = opener.current;
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = 'hidden';
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-menu-close]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      html.style.overflow = previous.overflow;
      html.style.paddingRight = previous.paddingRight;
      returnTo?.focus({ preventScroll: true });
    };
  }, [opener]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const list = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
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
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id={PHONE_MENU_ID}
      className={styles.menu}
      aria-label="Menu"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // The browser closed it on its own: follow it (not a close that arrives after a
        // re-open in development, or after the element left the document).
        if (event.currentTarget.isConnected && !event.currentTarget.open) onClose();
      }}
      onKeyDown={onKeyDown}
      data-on-dark
      data-phone-menu
    >
      <div className={styles.frame}>
        <div className={styles.top}>
          <span className={styles.brand} aria-hidden="true">
            {logoSrc !== '' ? (
              <picture>
                <img src={logoSrc} alt="" width={48} height={48} decoding="async" referrerPolicy="no-referrer" className={styles.logo} />
              </picture>
            ) : (
              monogram
            )}
          </span>
          <button type="button" className={styles.close} aria-label="Close menu" onClick={onClose} data-menu-close>
            <Icon name="close" size={24} />
          </button>
        </div>
        <div className={styles.body}>
          <ul role="list" className={styles.list}>
            {sections.map((section, index) => (
              <li key={section.id} className={styles.row} style={step(index)}>
                <a href={`#${section.id}`} className={styles.link} aria-current={activeId === section.id ? 'true' : undefined} onClick={onClose} data-menu-link>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
          {contactHref !== '' && (
            <div className={styles.row} style={step(sections.length)}>
              <a href={contactHref} className={styles.contact} onClick={onClose} data-menu-contact>
                <span>{contactLabel}</span>
                <Icon name="external" size={16} />
              </a>
            </div>
          )}
          <div className={`${styles.row} ${styles.theme}`} style={step(sections.length + 1)} data-menu-theme>
            <span>Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </dialog>
  );
}
