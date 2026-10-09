import { useCallback, useEffect, useRef, useState } from 'react';
import { Container, Icon, cx, useImageFailure } from '@/components/ui';
import { assetUrl } from '@/lib/paths';
import { usePageScroll } from '@/lib/scroll';
import { ThemeToggle } from '@/theme';
import { PhoneMenu, PHONE_MENU_ID } from './PhoneMenu';
import { PAGE_SECTIONS, PAGE_TOP_ID } from './sections';
import styles from './SiteNav.module.css';

export interface SiteNavProps {
  /** site.monogram ("KK") — shown when there is no logo or the logo does not load. */
  monogram: string;
  /** site.name — the text beside the logo (from 1280px) and the logo link's accessible name. */
  siteName: string;
  /** site.logo — a content path or URL, not yet passed through assetUrl(). "" shows the monogram. */
  logo: string;
  /** site.logoAlt */
  logoAlt: string;
  /** site.contactLabel — text of the "Get in touch" button. "" hides the button. */
  contactLabel?: string;
  /** site.email — the button is a mailto: link to it. "" hides the button. */
  email?: string;
}

/**
 * The picture's drawn size in CSS px (see the CSS).
 * The file is 96 × 96, enough for a 3× screen.
 */
const LOGO_SIZE = 48;
const SECTION_IDS: readonly string[] = PAGE_SECTIONS.map((section) => section.id);
/** From this width the links are inline and there is no menu (the CSS uses the same number). */
const INLINE_FROM = '(min-width: 768px)';

/**
 * SiteNav — the header. It stays at the top of the viewport at every width and takes no room
 * in the page (the hero starts under it).
 *
 *   at the top of the page   see-through over the hero video; white text in both themes
 *   once scrolled            a solid bar in the canvas colour with a hairline below, a little
 *                            shorter; follows the theme; the link of the section in view is
 *                            marked with aria-current="true"
 *
 * Left: the logo (to the top of the page) and, on wide screens, the site name. Centre, from
 * 768px: the section links. Right, from 768px: the "Get in touch" button (a mailto: link) and
 * the theme toggle, which is the last control. Under 768px: the logo and the menu button only;
 * the links, the button and the theme toggle are in the full-screen menu (PhoneMenu).
 *
 * The scrolled state and the section in view are read after mount (usePageScroll), so the
 * server and the first client render both show the top-of-page state. Going from one state to
 * the other animates opacity (the solid layer) and transform (the row moves up a few px);
 * no box changes size, so nothing on the page shifts.
 *
 * The logo is a 48px picture with a transparent background inside a 48px link. Without a logo, or when it
 * does not load, the link shows the monogram text instead. The server and the first client
 * render both show the image when a logo is set; a failure is only known after mount.
 */
export function SiteNav({ monogram, siteName, logo, logoAlt, contactLabel = '', email = '' }: SiteNavProps) {
  const logoSrc = assetUrl(logo);
  const logoImage = useImageFailure(logoSrc);
  const showLogo = !logoImage.failed;
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { scrolled, activeId } = usePageScroll(SECTION_IDS);

  const contactText = contactLabel.trim();
  const contactHref = contactText !== '' && email.trim() !== '' ? `mailto:${email.trim()}` : '';

  const close = useCallback(() => setOpen(false), []);

  // The menu belongs to the phone layout: leave it when the window grows past it.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia(INLINE_FROM);
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    onChange();
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [open]);

  return (
    // Over the hero the bar is an on-dark region (white text, raw accent focus ring) in both
    // themes; once solid it takes the theme's tokens.
    <header className={styles.header} data-site-header data-scrolled={scrolled ? '' : undefined} data-on-dark={scrolled ? undefined : ''}>
      <Container className={styles.bar}>
        <div className={styles.brand}>
          {/* The link is named by aria-label in both states, so the name is read once whatever is
              inside it: the logo image (its alt is for when the picture is shown without the
              label, e.g. a failed load with scripts off) or the monogram text. */}
          <a
            href={`#${PAGE_TOP_ID}`}
            className={cx(styles.monogram, showLogo && styles.withLogo)}
            aria-label={`${siteName} — top of page`}
            data-nav-brand={showLogo ? 'logo' : 'monogram'}
          >
            {showLogo ? (
              // Inside <picture>: React 19 would otherwise hoist a preload <link> for an eager
              // image to the start of the page root (logs/issues/pages-03).
              <picture className={styles.logoFrame} data-nav-logo-disc>
                <img
                  ref={logoImage.ref}
                  onError={logoImage.onError}
                  src={logoSrc}
                  alt={logoAlt}
                  width={LOGO_SIZE}
                  height={LOGO_SIZE}
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className={styles.logo}
                  data-nav-logo
                />
              </picture>
            ) : (
              monogram
            )}
          </a>
        </div>
        <nav aria-label="Sections" className={styles.nav}>
          <ul role="list" className={styles.list}>
            {PAGE_SECTIONS.map((section) => (
              <li key={section.id} className={styles.item}>
                <a href={`#${section.id}`} className={styles.link} aria-current={activeId === section.id ? 'true' : undefined}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* DOM (tab) order is the visual order: the button, then the theme toggle at the far
            right. On phones only the menu button is shown here. The three are items of the bar
            itself (no box around them): a wrapper would change size with the button's text
            when the web font arrives, and so count as a control that moved. */}
        <>
          {contactHref !== '' && (
            <a href={contactHref} className={styles.contact} data-nav-contact>
              <span>{contactText}</span>
              <Icon name="external" size={16} />
            </a>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? PHONE_MENU_ID : undefined}
            onClick={() => setOpen(true)}
            data-menu-button
          >
            <span className={styles.bars} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <span className={styles.toggleSlot}>
            <ThemeToggle />
          </span>
        </>
      </Container>
      {open && (
        <PhoneMenu
          sections={PAGE_SECTIONS}
          activeId={activeId}
          contactLabel={contactText}
          contactHref={contactHref}
          logoSrc={showLogo ? logoSrc : ''}
          monogram={monogram}
          opener={menuButtonRef}
          onClose={close}
        />
      )}
    </header>
  );
}
