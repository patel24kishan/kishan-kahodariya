import type { ResolvedExperience } from '@/content';
import { Chip, Section } from '@/components/ui';
import { assetUrl } from '@/lib/paths';
import { ContentImage } from './ContentImage';
import styles from './Experience.module.css';

export interface ExperienceProps {
  /** getExperience(track) — this page's jobs first, bullets already resolved for it. */
  entries: ResolvedExperience[];
}

/**
 * Experience (#experience) — one block per job: logo (small, gone if it does not load),
 * company, role, date, location and a "Remote" marker, the resolved bullets verbatim, tag chips.
 */
export function Experience({ entries }: ExperienceProps) {
  return (
    <Section id="experience" title="Experience">
      {entries.length > 0 ? (
        <ol role="list" className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.slug} className={styles.item}>
              <article className={styles.job} data-experience={entry.slug}>
                <header className={styles.head}>
                  {entry.logo && (
                    <ContentImage
                      src={assetUrl(entry.logo)}
                      alt=""
                      width={48}
                      height={48}
                      className={styles.logo}
                      data-experience-logo
                      // Hidden when it does not load, but its box stays so nothing shifts.
                      fallback={<span className={styles.logoGap} aria-hidden="true" />}
                    />
                  )}
                  <div className={styles.titles}>
                    <h3 className={styles.company}>{entry.company}</h3>
                    {entry.role && <p className={styles.role}>{entry.role}</p>}
                  </div>
                  {entry.dateDisplay && (
                    <p className={styles.date} data-numeric>
                      {entry.dateDisplay}
                    </p>
                  )}
                </header>
                {(entry.location || entry.remote) && (
                  <p className={styles.where}>
                    {entry.location && <span>{entry.location}</span>}
                    {entry.remote && (
                      <Chip size="sm" shape="pill" data-experience-remote>
                        Remote
                      </Chip>
                    )}
                  </p>
                )}
                {entry.resolvedBullets.length > 0 && (
                  <ul className={styles.bullets}>
                    {entry.resolvedBullets.map((bullet, index) => (
                      <li key={`${index}-${bullet}`}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {entry.tags.length > 0 && (
                  <ul role="list" className={styles.tags} aria-label="Technologies">
                    {entry.tags.map((tag, index) => (
                      <Chip key={`${index}-${tag}`} as="li" size="sm" shape="pill">
                        {tag}
                      </Chip>
                    ))}
                  </ul>
                )}
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>No experience entries yet.</p>
      )}
    </Section>
  );
}
