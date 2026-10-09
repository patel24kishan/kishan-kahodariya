import { createElement, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { useReveal, type RevealOptions } from './useReveal';

export interface RevealProps extends HTMLAttributes<HTMLElement>, RevealOptions {
  /** Element to render. Default div. */
  as?: 'div' | 'span' | 'p' | 'li' | 'ul' | 'ol' | 'article' | 'section' | 'header' | 'h2' | 'h3';
  children?: ReactNode;
}

/**
 * Reveal — a wrapper element that rises in once as it enters the view (see useReveal). With
 * `variant="draw-x"` or `"draw-y"` it is an empty decorative line that draws itself.
 *
 *   <Reveal as="li" delay={90} className={styles.cell}>…</Reveal>
 *   <Reveal variant="draw-x" className={styles.line} aria-hidden="true" />
 */
export function Reveal({ as = 'div', variant, delay, children, ...rest }: RevealProps) {
  const ref = useReveal<HTMLElement>({ variant, delay });
  return createElement(as, { ref: ref as Ref<HTMLElement>, ...rest }, children);
}
