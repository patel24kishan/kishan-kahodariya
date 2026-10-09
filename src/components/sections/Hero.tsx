import { Fragment, type CSSProperties } from 'react';
import type { ResolvedHeroStat, TrackProfile } from '@/content';
import { Container, Icon, VisuallyHidden } from '@/components/ui';
import { assetUrl, isExternalUrl } from '@/lib/paths';
import { HeroVideo } from './HeroVideo';
import { Paragraphs } from './text';
import styles from './Hero.module.css';

export interface HeroProps {
  track: TrackProfile;
  /** site.name — the h1, one word per line. */
  name: string;
  /**
   * getSummary(track, openTab) — the summary for the project tab that is open now (the tab's
   * own text, or the page's). A blank text renders no summary block.
   */
  summary: string;
  /**
   * getResume(track, openTab) — the resume for the project tab that is open now. An empty url
   * hides the button; an empty label reads "Resume".
   */
  resume: { url: string; label: string };
  /** site.workLabel — text of the button that goes to the projects. "" hides it. */
  workLabel?: string;
  /** getHeroStats(track). [] renders no stats row. */
  stats?: readonly ResolvedHeroStat[];
}

const TITLE_ID = 'about-title';
/** Where the "See my work" button goes. */
const WORK_TARGET = '#projects';

/** Stagger step for the reveal (the n-th block starts n × 200ms later). */
function reveal(step: number): CSSProperties {
  return { '--reveal-step': step } as CSSProperties;
}

/**
 * Hero (#about) — one viewport tall, always dark (it sits on a video), in both themes: a
 * data-on-dark region with its own local colours (Hero.module.css).
 *
 * Behind the text: HeroVideo (gradient, poster, video, scrim, pause button). The text, top to
 * bottom, each block fading up in turn: the tagline (crown + the page's headline), the name
 * (h1, one word per line), the summary and the buttons — "See my work" (to #projects), the
 * resume (both the summary and the resume follow the open project tab) and the badge — then
 * the stats. Whatever has no content is not rendered.
 *
 * The reveal is CSS only: it also runs with JavaScript off, never leaves anything hidden, and
 * is switched off under prefers-reduced-motion.
 */
export function Hero({ track, name, summary, resume, workLabel = '', stats = [] }: HeroProps) {
  const words = name.split(/\s+/).filter((word) => word !== '');
  const headline = track.headline.trim();
  const resumeUrl = resume.url.trim();
  const resumeOpensNewTab = isExternalUrl(resumeUrl);
  const work = workLabel.trim();
  const badgeLines = [track.badgeLine1.trim(), track.badgeLine2.trim()].filter((line) => line !== '');
  const hasBadge = badgeLines.length > 0;
  const hasActions = work !== '' || resumeUrl !== '' || hasBadge;

  return (
    <section id="about" aria-labelledby={TITLE_ID} className={styles.hero} data-on-dark data-hero>
      <HeroVideo src={assetUrl(track.heroVideo.trim())} poster={assetUrl(track.heroPoster.trim())} />
      <Container className={styles.inner}>
        <div className={styles.content}>
          {headline !== '' && (
            <p className={styles.tagline} style={reveal(0)} data-hero-tagline>
              <Icon name="crown" size={16} />
              <span>{track.headline}</span>
            </p>
          )}
          {/* One word per line; the spaces stay in the text, so the name reads as written. */}
          <h1 id={TITLE_ID} className={styles.name} style={reveal(1)}>
            {words.map((word, index) => (
              <Fragment key={index}>
                {index > 0 && ' '}
                <span className={styles.word}>{word}</span>
              </Fragment>
            ))}
          </h1>
          {summary.trim() !== '' && (
            <div className={styles.summary} style={reveal(2)} data-hero-summary>
              <Paragraphs text={summary} />
            </div>
          )}
          {hasActions && (
            <div className={styles.actions} style={reveal(3)} data-hero-actions>
              {work !== '' && (
                <a href={WORK_TARGET} className={`${styles.button} ${styles.outline} ${styles.withIcon}`} data-hero-work>
                  <span>{work}</span>
                  <Icon name="external" size={16} />
                </a>
              )}
              {resumeUrl !== '' && (
                <a
                  href={resumeUrl}
                  className={`${styles.button} ${styles.filled}`}
                  {...(resumeOpensNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  data-hero-resume
                >
                  <span>
                    {resume.label.trim() || 'Resume'}
                    {resumeOpensNewTab && <VisuallyHidden> (opens in a new tab)</VisuallyHidden>}
                  </span>
                </a>
              )}
              {/* From 640px the badge sits in this row, on two lines. */}
              {hasBadge && (
                <p className={`${styles.badge} ${styles.badgeInRow}`} data-hero-badge="row">
                  <Icon name="award" size={32} strokeWidth={1.6} className={styles.badgeIcon} />
                  <span>
                    {badgeLines.map((line, index) => (
                      <Fragment key={index}>
                        {index > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                  </span>
                </p>
              )}
            </div>
          )}
          {stats.length > 0 && (
            <ul role="list" className={styles.stats} style={reveal(4)} data-hero-stats>
              {stats.map((stat, index) => (
                <li key={index} className={styles.stat}>
                  <span className={styles.statValue} data-numeric>
                    {stat.value}
                  </span>{' '}
                  <span className={styles.statLabel}>{stat.label}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Under 640px the same badge comes last, on one line (only one of the two is displayed). */}
          {hasBadge && (
            <p className={`${styles.badge} ${styles.badgeBelow}`} style={reveal(4)} data-hero-badge="below">
              <Icon name="award" size={24} strokeWidth={1.6} className={styles.badgeIcon} />
              <span>{badgeLines.join(' · ')}</span>
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}
