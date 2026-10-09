/**
 * Reveal-on-scroll, shared by every section. See useReveal for the rules (nothing hidden in
 * the prerendered HTML, nothing under reduced motion, once only, transform and opacity only).
 */
export { Reveal, type RevealProps } from './Reveal';
export { prepareReveal, useReveal, type RevealOptions, type RevealVariant } from './useReveal';
