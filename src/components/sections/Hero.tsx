import type { CSSProperties } from 'react';
import type { SocialLink, TrackProfile } from '@/content';
import { LinkButton, Section } from '@/components/ui';
import { assetUrl } from '@/lib/paths';
import { ContentImage } from './ContentImage';
import { Paragraphs } from './text';
import styles from './Hero.module.css';

export interface HeroProps {
  track: TrackProfile;
  /** site.name — the h1. */
  name: string;
  /** site.monogram — the photo's fallback. */
  monogram: string;
  /**
   * getResume(track, openTab) — the resume for the project tab that is open now. An empty url
   * hides the button; an empty label reads "Resume".
   */
  resume: { url: string; label: string };
  /** getLinks(track, 'hero'). */
  links: SocialLink[];
}

const TITLE_ID = 'about-title';

/** Stagger step for the reveal (the n-th block starts n × this later). */
function reveal(step: number): CSSProperties {
  return { '--reveal-step': step } as CSSProperties;
}

/**
 * Hero (#about) — name, headline in the accent, summary, the resume button (it follows the open
 * project tab) and the hero links, the profile photo in a circle (right on desktop, on top on
 * phones). The short staggered reveal is CSS only (it also runs with JavaScript off) and is
 * switched off under prefers-reduced-motion. The photo is the LCP candidate: eager, high
 * priority, sized.
 */
export function Hero({ track, name, monogram, resume, links }: HeroProps) {
  const photo = assetUrl(track.photo);
  const resumeUrl = resume.url.trim();

  return (
    <Section id="about" aria-labelledby={TITLE_ID} className={styles.hero} containerClassName={styles.inner}>
      <div className={styles.text}>
        <h1 id={TITLE_ID} className={styles.name} style={reveal(0)}>
          {name}
        </h1>
        {track.headline && (
          <p className={styles.headline} style={reveal(1)}>
            {track.headline}
          </p>
        )}
        {track.summary && (
          <div className={styles.summary} style={reveal(2)}>
            <Paragraphs text={track.summary} />
          </div>
        )}
        {(resumeUrl || links.length > 0) && (
          <div className={styles.actions} style={reveal(3)}>
            {resumeUrl && (
              <LinkButton variant="accent" size="lg" href={resumeUrl} data-hero-resume>
                {resume.label.trim() || 'Resume'}
              </LinkButton>
            )}
            {links.map((link) => (
              <LinkButton key={link.slug} variant="outline" size="lg" icon={link.icon} href={link.url} data-hero-link={link.slug}>
                {link.label}
              </LinkButton>
            ))}
          </div>
        )}
      </div>
      <div className={styles.photoRing} style={reveal(1)}>
        <ContentImage
          src={photo}
          alt={track.photoAlt}
          width={480}
          height={480}
          loading="eager"
          fetchPriority="high"
          picture
          className={styles.photo}
          data-hero-photo
          fallback={
            <span className={styles.photoFallback} role="img" aria-label={track.photoAlt || name}>
              <span aria-hidden="true">{monogram}</span>
            </span>
          }
        />
      </div>
    </Section>
  );
}
