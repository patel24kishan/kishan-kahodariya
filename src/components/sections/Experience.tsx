import type { ResolvedExperience } from '@/content';
import { Reveal } from '@/components/motion';
import { Chip, Section, cx } from '@/components/ui';
import styles from './Experience.module.css';

export interface ExperienceProps {
  /** getExperience(track) — this page's jobs first, bullets already resolved for it. */
  entries: ResolvedExperience[];
}

/**
 * Experience (#experience; its heading reads "Work History", while the nav link keeps "Experience") — the title stands in the left column and a timeline runs down the
 * right: an accent line that draws itself downward (scaleY), and one block per job with a dot
 * (accent for the current job), the date, company, role, every bullet verbatim and the tag
 * chips. Where the job was done (and a "Remote" marker) stays under the date. Each job rises
 * in once as it comes into view.
 */
export function Experience({ entries }: ExperienceProps) {
  return (
    <Section id="experience" title="Work History" layout="split">
      {entries.length > 0 ? (
        <div className={styles.timeline}>
          <Reveal as="span" variant="draw-y" className={styles.line} aria-hidden="true" data-timeline-line />
          <ol role="list" className={styles.list}>
            {entries.map((entry, index) => (
              <Reveal as="li" key={entry.slug} className={styles.item} delay={Math.min(index, 3) * 90}>
                <span className={cx(styles.dot, entry.present && styles.dotCurrent)} aria-hidden="true" data-experience-dot={entry.present ? 'present' : 'past'} />
                <article className={styles.job} data-experience={entry.slug} data-present={entry.present || undefined}>
                  <div className={styles.when}>
                    {entry.dateDisplay && (
                      <p className={styles.date} data-numeric>
                        {entry.dateDisplay}
                      </p>
                    )}
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
                  </div>
                  <div className={styles.what}>
                    <h3 className={styles.company}>{entry.company}</h3>
                    {entry.role && <p className={cx(styles.role, entry.present && styles.roleCurrent)}>{entry.role}</p>}
                    {entry.resolvedBullets.length > 0 && (
                      <ul className={styles.bullets}>
                        {entry.resolvedBullets.map((bullet, bulletIndex) => (
                          <li key={`${bulletIndex}-${bullet}`}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {entry.tags.length > 0 && (
                      <ul role="list" className={styles.tags} aria-label="Technologies">
                        {entry.tags.map((tag, tagIndex) => (
                          <Chip key={`${tagIndex}-${tag}`} as="li" size="sm" shape="pill">
                            {tag}
                          </Chip>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              </Reveal>
            ))}
          </ol>
        </div>
      ) : (
        <p className={styles.empty}>No experience entries yet.</p>
      )}
    </Section>
  );
}
