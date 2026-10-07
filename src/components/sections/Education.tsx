import type { Certificate, Education as EducationEntry } from '@/content';
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
 * Education & Certificates (#education) — two columns on desktop, stacked on phones.
 * Certificates lead on a page whose track says so.
 */
export function Education({ education, certificates, certificatesFirst }: EducationProps) {
  const educationColumn = (
    <div className={styles.column} data-column="education" key="education">
      <h3 className={styles.columnTitle}>Education</h3>
      {education.length > 0 ? (
        <ul role="list" className={styles.list}>
          {education.map((entry) => (
            <li key={entry.slug}>
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
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No education entries yet.</p>
      )}
    </div>
  );

  const certificatesColumn = (
    <div className={styles.column} data-column="certificates" key="certificates">
      <h3 className={styles.columnTitle}>Certificates</h3>
      {certificates.length > 0 ? (
        <ul role="list" className={styles.list}>
          {certificates.map((certificate) => {
            const url = certificate.url.trim();
            const external = isExternalUrl(url);
            return (
              <li key={certificate.slug}>
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
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>No certificates yet.</p>
      )}
    </div>
  );

  return (
    <Section id="education" title="Education & Certificates">
      <div className={styles.columns} data-certificates-first={certificatesFirst || undefined}>
        {certificatesFirst ? [certificatesColumn, educationColumn] : [educationColumn, certificatesColumn]}
      </div>
    </Section>
  );
}
