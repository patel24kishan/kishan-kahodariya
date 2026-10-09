import type { HTMLAttributes, ReactNode } from 'react';
import { useReveal } from '@/components/motion';
import { Container, type ContainerProps } from './Container';
import { cx } from './cx';
import styles from './Section.module.css';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Anchor id (about, projects, experience, skills, education). */
  id: string;
  /**
   * Section heading, rendered as an h2 and used to label the section. Omit for the hero (it has
   * the h1). A soft hyphen (U+00AD) marks where the word may break in a narrow column; the
   * accessible name is the word without it.
   */
  title?: string;
  /**
   * `display` (default): large, 800, uppercase, rises in on scroll — the page sections.
   * `plain`: the quiet heading the dev kit uses for its own pages.
   */
  titleStyle?: 'display' | 'plain';
  /** Keep the h2 for assistive technology but do not show it (the visible titles are inside the content). */
  titleHidden?: boolean;
  /** Centre the heading (`plain` only). */
  centered?: boolean;
  /** Optional line under the heading, in body colour. */
  intro?: ReactNode;
  /** Sits opposite the title on wide screens and under it on phones (the Projects tabs). */
  actions?: ReactNode;
  /**
   * `stack` (default): the title, then the content. `split`: from 1024px the title stands in a
   * left column and the content fills the right one; below that it is `stack`.
   */
  layout?: 'stack' | 'split';
  /** Container width. */
  width?: ContainerProps['width'];
  /** Extra class on the inner container. */
  containerClassName?: string;
  children: ReactNode;
}

/**
 * Section — one page band: `<section id>` with the section rhythm (`--section-pad` above and
 * below), `scroll-margin-top` for the sticky nav, a Container, and an optional h2
 * (`id="<id>-title"`, wired via aria-labelledby).
 *
 *   <Section id="projects" title="Projects" actions={<SegmentedTabs … />}>…</Section>
 *   <Section id="skills" title="Skills" layout="split">…</Section>
 */
export function Section({
  id,
  title,
  titleStyle = 'display',
  titleHidden = false,
  centered = false,
  intro,
  actions,
  layout = 'stack',
  width,
  containerClassName,
  className,
  children,
  ...rest
}: SectionProps) {
  const titleId = `${id}-title`;
  const titleRef = useReveal<HTMLHeadingElement>();
  const display = titleStyle === 'display';
  const label = title && title.includes('­') ? title.replace(/­/g, '') : undefined;

  const heading = title ? (
    <h2 ref={display && !titleHidden ? titleRef : undefined} id={titleId} aria-label={label} className={cx(styles.title, display ? styles.display : styles.plain, titleHidden && styles.hidden)}>
      {title}
    </h2>
  ) : null;
  const introLine = intro ? <p className={styles.intro}>{intro}</p> : null;

  return (
    <section id={id} aria-labelledby={title ? titleId : undefined} className={cx(styles.section, className)} {...rest}>
      <Container width={width} className={containerClassName}>
        {layout === 'split' && !titleHidden ? (
          <div className={styles.split}>
            <div className={styles.splitTitle}>
              {heading}
              {introLine}
            </div>
            <div className={styles.splitBody}>{children}</div>
          </div>
        ) : (
          <>
            {(heading || actions) && (
              <header className={cx(styles.header, display ? styles.headerDisplay : styles.headerPlain, centered && styles.centered, titleHidden && !actions && styles.headerHidden)}>
                <div className={styles.titleGroup}>
                  {heading}
                  {introLine}
                </div>
                {actions}
              </header>
            )}
            {children}
          </>
        )}
      </Container>
    </section>
  );
}
