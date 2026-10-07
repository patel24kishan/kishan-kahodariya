import { useCallback, useEffect, useRef, useState } from 'react';
import { Container, IconButton, cx, useImageFailure } from '@/components/ui';
import { assetUrl } from '@/lib/paths';
import { ThemeToggle } from '@/theme';
import { PAGE_SECTIONS, PAGE_TOP_ID } from './sections';
import styles from './SiteNav.module.css';

export interface SiteNavProps {
  /** site.monogram ("KK") — shown when there is no logo or the logo does not load. */
  monogram: string;
  /** Used for the logo link's accessible name. */
  siteName: string;
  /** site.logo — a content path or URL, not yet passed through assetUrl(). "" shows the monogram. */
  logo: string;
  /** site.logoAlt */
  logoAlt: string;
}

const MENU_ID = 'site-menu';
/**
 * The picture's drawn size in CSS px: the largest square inside the 40px disc (see the CSS).
 * The file is 96 × 96, enough for a 3× screen.
 */
const LOGO_SIZE = 28;

/**
 * SiteNav — the sticky top bar: the logo (to the top of the page), the section links and the
 * theme toggle at the right end. Under 768px the links collapse behind a menu button, which
 * sits just left of the toggle: a disclosure with aria-expanded / aria-controls; Esc closes it
 * and returns focus to the button, choosing a link closes it, and so does a click outside.
 * State starts closed on the server and on the client alike, so there is nothing to mismatch.
 *
 * The logo is a picture on a 40px white disc inside a 44px link. Without a logo, or when it
 * does not load, the link shows the monogram text instead. The server and the first client
 * render both show the image when a logo is set; a failure is only known after mount.
 */
export function SiteNav({ monogram, siteName, logo, logoAlt }: SiteNavProps) {
  const logoSrc = assetUrl(logo);
  const logoImage = useImageFailure(logoSrc);
  const showLogo = !logoImage.failed;
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuSlotRef = useRef<HTMLSpanElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) menuSlotRef.current?.querySelector('button')?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && headerRef.current?.contains(event.target)) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <header ref={headerRef} className={styles.header} data-menu-open={open || undefined}>
      <Container className={styles.bar}>
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
        <nav id={MENU_ID} aria-label="Sections" className={cx(styles.nav, open && styles.navOpen)}>
          <ul role="list" className={styles.list}>
            {PAGE_SECTIONS.map((section) => (
              <li key={section.id} className={styles.item}>
                <a href={`#${section.id}`} className={styles.link} onClick={() => close(false)}>
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* Menu button first, theme toggle last: the toggle is the right-most control at every
            width, and the DOM (tab) order is the visual order. The slot is hidden from 768px. */}
        <div className={styles.controls}>
          <span ref={menuSlotRef} className={styles.menuSlot}>
            <IconButton
              icon={open ? 'close' : 'menu'}
              label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls={MENU_ID}
              onClick={() => (open ? close(false) : setOpen(true))}
              data-menu-button
            />
          </span>
          <ThemeToggle />
        </div>
      </Container>
    </header>
  );
}
