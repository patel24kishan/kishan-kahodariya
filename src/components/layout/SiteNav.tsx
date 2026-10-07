import { useCallback, useEffect, useRef, useState } from 'react';
import { Container, IconButton, cx } from '@/components/ui';
import { ThemeToggle } from '@/theme';
import { PAGE_SECTIONS, PAGE_TOP_ID } from './sections';
import styles from './SiteNav.module.css';

export interface SiteNavProps {
  /** "KK" */
  monogram: string;
  /** Used for the monogram link's accessible name. */
  siteName: string;
}

const MENU_ID = 'site-menu';

/**
 * SiteNav — the sticky top bar: monogram (to the top of the page), the section links and the
 * theme toggle. Under 768px the links collapse behind a menu button: a disclosure with
 * aria-expanded / aria-controls; Esc closes it and returns focus to the button, choosing a
 * link closes it, and so does a click outside. State starts closed on the server and on the
 * client alike, so there is nothing to mismatch.
 */
export function SiteNav({ monogram, siteName }: SiteNavProps) {
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
        <a href={`#${PAGE_TOP_ID}`} className={styles.monogram} aria-label={`${siteName} — top of page`}>
          {monogram}
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
        <div className={styles.controls}>
          <ThemeToggle />
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
        </div>
      </Container>
    </header>
  );
}
