import type { SocialLink } from '@/content';
import { Container, LinkButton } from '@/components/ui';
import { PAGE_SECTIONS } from './sections';
import styles from './SiteFooter.module.css';

export interface SiteFooterProps {
  /** getLinks(track, 'footer') — never contains a link with an empty url. */
  links: SocialLink[];
  /** site.credit — one line each. */
  credit: string[];
}

/**
 * SiteFooter — the accent band (data-on-accent: near-black text and focus ring inside) with
 * the Navigate and Connect columns, then the near-black credit strip in accent text. The theme
 * toggle lives in the nav bar only. The strip sits outside the band so its colours are the raw
 * accent on near-black in both themes.
 */
export function SiteFooter({ links, credit }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.band} data-on-accent>
        <Container className={styles.inner}>
          <div className={styles.columns}>
            <nav aria-label="Footer" className={styles.column}>
              <h2 className={styles.heading}>Navigate</h2>
              <ul role="list" className={styles.navList}>
                {PAGE_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className={styles.navLink}>
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className={styles.column}>
              <h2 className={styles.heading}>Connect</h2>
              {links.length > 0 ? (
                <ul role="list" className={styles.connect}>
                  {links.map((link) => (
                    <li key={link.slug}>
                      <LinkButton variant="onAccent" icon={link.icon} href={link.url}>
                        {link.label}
                      </LinkButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No links yet.</p>
              )}
            </div>
          </div>
        </Container>
      </div>
      {credit.length > 0 && (
        <div className={styles.credit}>
          <Container>
            {credit.map((line, index) => (
              <p key={`${index}-${line}`} className={styles.creditLine}>
                {line}
              </p>
            ))}
          </Container>
        </div>
      )}
    </footer>
  );
}
