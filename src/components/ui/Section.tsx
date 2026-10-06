import type { HTMLAttributes, ReactNode } from 'react';
import { Container, type ContainerProps } from './Container';
import { cx } from './cx';
import styles from './Section.module.css';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Anchor id (about, projects, experience, skills, education). */
  id: string;
  /** Section heading, rendered as an h2 and used to label the section. Omit for the hero (it has the h1). */
  title?: string;
  /** Centre the heading (the Projects section). */
  centered?: boolean;
  /** Optional line under the heading, in body colour. */
  intro?: ReactNode;
  /** Container width. */
  width?: ContainerProps['width'];
  /** Extra class on the inner container. */
  containerClassName?: string;
  children: ReactNode;
}

/**
 * Section — one page band: `<section id>` with the section rhythm (half of --section-gap
 * above and below, so consecutive sections sit --section-gap apart), `scroll-margin-top` for
 * the sticky nav, a Container, and an optional h2 (`id="<id>-title"`, wired via aria-labelledby).
 *
 *   <Section id="projects" title="Projects" centered>…</Section>
 */
export function Section({ id, title, centered = false, intro, width, containerClassName, className, children, ...rest }: SectionProps) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={title ? titleId : undefined} className={cx(styles.section, className)} {...rest}>
      <Container width={width} className={containerClassName}>
        {title && (
          <header className={cx(styles.header, centered && styles.centered)}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {intro && <p className={styles.intro}>{intro}</p>}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}
