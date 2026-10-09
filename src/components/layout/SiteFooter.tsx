import type { SocialLink } from '@/content';
import { Reveal } from '@/components/motion';
import { Container, Icon } from '@/components/ui';
import { isExternalUrl } from '@/lib/paths';
import styles from './SiteFooter.module.css';

export interface SiteFooterProps {
  /** getLinks(track, 'footer') — never contains a link with an empty url. */
  links: SocialLink[];
  /** site.credit — one line each. */
  credit: string[];
  /** site.contactLabel — the title of the band. Missing or blank: "Get in touch". */
  contactLabel?: string;
}

const DEFAULT_CONTACT_LABEL = 'Get in touch';

/**
 * SiteFooter — the accent band (data-on-accent: near-black text and focus ring inside) with the
 * contact block, left-aligned: the title (site.contactLabel, "Get in touch" when blank), the email
 * address as one large link and the other links as small outlined buttons, each rising in once as
 * the band comes into view. Then the near-black credit strip in accent text; it sits outside the
 * band so its colours are the raw accent on near-black in both themes. The section links and the
 * theme toggle live in the docked nav bar only.
 */
export function SiteFooter({ links, credit, contactLabel }: SiteFooterProps) {
  const title = contactLabel?.trim() || DEFAULT_CONTACT_LABEL;
  // The email link is the headline of the block; every other link is a small button under it.
  const email = links.find((link) => link.url.trim().toLowerCase().startsWith('mailto:'));
  const others = links.filter((link) => link !== email);
  const address = email ? email.url.trim().slice('mailto:'.length).split('?')[0]! : '';
  return (
    <footer className={styles.footer}>
      <div className={styles.band} data-on-accent>
        <Container className={styles.inner}>
          <div className={styles.contact}>
            <Reveal as="h2" className={styles.contactTitle}>
              {title}
            </Reveal>
            {email && address && (
              <Reveal as="div" className={styles.emailRow} delay={100}>
                <a href={email.url} className={styles.email} data-footer-email>
                  <span className={styles.emailText}>{address}</span>
                  <Icon name="external" size={24} className={styles.emailIcon} />
                </a>
              </Reveal>
            )}
            {others.length > 0 && (
              <Reveal as="ul" role="list" className={styles.connect} delay={200}>
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
              </Reveal>
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
