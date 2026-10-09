import type { SocialLink } from '@/content';
import { Container, Icon } from '@/components/ui';
import { isExternalUrl } from '@/lib/paths';
import styles from './SiteFooter.module.css';

export interface SiteFooterProps {
  /** getLinks(track, 'footer') — never contains a link with an empty url. */
  links: SocialLink[];
  /** site.credit — one line each. */
  credit: string[];
}

/**
 * SiteFooter — the accent band (data-on-accent: near-black text and focus ring inside) with
 * the contact block, left-aligned ("Get in touch": the email address as one large link, the
 * other links as small outlined buttons), then the near-black credit strip in accent text. The
 * section links and the theme toggle live in the docked nav bar only. The strip sits outside the band so its colours are the raw
 * accent on near-black in both themes.
 */
export function SiteFooter({ links, credit }: SiteFooterProps) {
  // The email link is the headline of the block; every other link is a small button under it.
  const email = links.find((link) => link.url.trim().toLowerCase().startsWith('mailto:'));
  const others = links.filter((link) => link !== email);
  const address = email ? email.url.trim().slice('mailto:'.length).split('?')[0]! : '';
  return (
    <footer className={styles.footer}>
      <div className={styles.band} data-on-accent>
        <Container className={styles.inner}>
          <div className={styles.contact}>
            <h2 className={styles.contactTitle}>Get in touch</h2>
            {email && address && (
              <a href={email.url} className={styles.email} data-footer-email>
                <span className={styles.emailText}>{address}</span>
                <Icon name="external" size={24} className={styles.emailIcon} />
              </a>
            )}
            {others.length > 0 && (
              <ul role="list" className={styles.connect}>
                {others.map((link) => {
                  const external = isExternalUrl(link.url);
                  return (
                    <li key={link.slug}>
                      <a
                        href={link.url}
                        className={styles.chip}
                        data-footer-link={link.slug}
                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                        {external && <span className={styles.srOnly}> (opens in a new tab)</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {!email && others.length === 0 && <p className={styles.empty}>No links yet.</p>}
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
