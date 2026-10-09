import type { Certificate, Education as EducationEntry } from '@/content';
import { Reveal } from '@/components/motion';
import { Icon, Section, VisuallyHidden, cx } from '@/components/ui';
import { assetUrl, isExternalUrl } from '@/lib/paths';
import { ContentImage } from './ContentImage';
import { Paragraphs } from './text';
import styles from './Education.module.css';

export interface EducationProps {
  /** getEducation(). */
  education: EducationEntry[];
  /** getCertificates(track). */
  certificates: Certificate[];
  /** track.certificatesFirst — the Certificates column comes first (in the DOM and on screen). */
  certificatesFirst: boolean;
}

/**
 * Education & Certificates (#education) — two columns on desktop, stacked on phones, each with a
 * large title of its own and cards that rise in one after another. Certificates lead on a page
 * whose track says so. The section keeps one h2 ("Education & Certificates") for assistive
 * technology; the two visible titles are h3.
 */
export function Education({ education, certificates, certificatesFirst }: EducationProps) {
  const educationColumn = (
    <div className={styles.column} data-column="education" key="education">
      <Reveal as="h3" className={styles.columnTitle}>
        Education
      </Reveal>
      {education.length > 0 ? (
        <ul role="list" className={styles.list}>
          {education.map((entry, index) => (
            <Reveal as="li" key={entry.slug} delay={(index + 1) * 90}>
              <article className={cx(styles.card, styles.educationCard)} data-education={entry.slug}>
                <h4 className={styles.title}>{entry.school}</h4>
                {entry.degree && <p className={styles.degree}>{entry.degree}</p>}
                {(entry.dateDisplay || entry.grade) && (
                  <p className={styles.meta} data-numeric>
                    {entry.dateDisplay && <span>{entry.dateDisplay}</span>}
                    {entry.dateDisplay && entry.grade && <span aria-hidden="true"> · </span>}
                    {entry.grade && <span>{entry.grade}</span>}
                  </p>
                )}
                {entry.description && (
                  <div className={styles.description}>
                    <Paragraphs text={entry.description} />
                  </div>
                )}
              </article>
            </Reveal>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No education entries yet.</p>
      )}
    </div>
  );

  const certificatesColumn = (
    <div className={styles.column} data-column="certificates" key="certificates">
      <Reveal as="h3" className={styles.columnTitle}>
        Certificates
      </Reveal>
      {certificates.length > 0 ? (
        <ul role="list" className={styles.list}>
          {certificates.map((certificate, index) => {
            const url = certificate.url.trim();
            const external = isExternalUrl(url);
            return (
              <Reveal as="li" key={certificate.slug} delay={(index + 1) * 90}>
                <article className={cx(styles.card, styles.certificateCard)} data-certificate={certificate.slug}>
                  <div className={styles.badge}>
                    <ContentImage
                      src={assetUrl(certificate.image)}
                      alt={certificate.imageAlt}
                      width={96}
                      height={96}
                      className={styles.badgeImage}
                      fallback={
                        <span className={styles.badgeFallback} role="img" aria-label={certificate.imageAlt || `${certificate.title} badge`}>
                          <Icon name="award" size={28} />
                        </span>
                      }
                    />
                  </div>
                  <div className={styles.certificateText}>
                    <h4 className={styles.title}>
                      {url ? (
                        <a href={url} className={styles.certificateLink} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                          {certificate.title}
                          {external && <VisuallyHidden> (opens in a new tab)</VisuallyHidden>}
                        </a>
                      ) : (
                        certificate.title
                      )}
                    </h4>
                    {certificate.dateDisplay && (
                      <p className={styles.meta} data-numeric>
                        {certificate.dateDisplay}
                      </p>
                    )}
                    {certificate.description && (
                      <div className={styles.description}>
                        <Paragraphs text={certificate.description} />
                      </div>
                    )}
                  </div>
                </article>
              </Reveal>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>No certificates yet.</p>
      )}
    </div>
  );

  return (
    <Section id="education" title="Education & Certificates" titleHidden>
      <div className={styles.columns} data-certificates-first={certificatesFirst || undefined}>
        {certificatesFirst ? [certificatesColumn, educationColumn] : [educationColumn, certificatesColumn]}
      </div>
    </Section>
  );
}
