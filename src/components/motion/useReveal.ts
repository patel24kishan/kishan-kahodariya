import { useEffect, useRef, type RefObject } from 'react';

/**
 * How a block arrives:
 * - `rise`    fades in while it moves up a little (text, cards, rows)
 * - `draw-x`  a line that draws itself from the left (`transform: scaleX`)
 * - `draw-y`  a line that draws itself downward (`transform: scaleY`)
 */
export type RevealVariant = 'rise' | 'draw-x' | 'draw-y';

export interface RevealOptions {
  variant?: RevealVariant;
  /** Wait this many milliseconds after the block enters the view (a stagger). Default 0. */
  delay?: number;
}

/** How long each variant takes (the CSS in styles/base.css has the same numbers). */
const DURATION_MS: Record<RevealVariant, number> = { rise: 900, 'draw-x': 1100, 'draw-y': 1600 };

/** A block counts as "not yet reached" when its top is in the lowest tenth of the screen or below. */
const FOLD = 0.9;

interface Entry {
  element: HTMLElement;
  variant: RevealVariant;
  delay: number;
  timer: number | undefined;
}

/** Watched element → the blocks waiting on it (a line shares its parent with its row). */
const entries = new Map<Element, Entry[]>();
let observer: IntersectionObserver | undefined;

function show(entry: Entry): void {
  const { element, variant, delay } = entry;
  element.setAttribute('data-reveal-state', 'shown');
  // Once the entrance is over the marks go, so the block is left in its normal state.
  entry.timer = window.setTimeout(() => clear(element), DURATION_MS[variant] + delay + 200);
}

function clear(element: HTMLElement): void {
  element.removeAttribute('data-reveal');
  element.removeAttribute('data-reveal-state');
  element.style.removeProperty('--reveal-delay');
}

function sharedObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (changes) => {
      for (const change of changes) {
        if (!change.isIntersecting) continue;
        const waiting = entries.get(change.target);
        if (!waiting) continue;
        // Once: stop watching, start the entrances.
        observer?.unobserve(change.target);
        entries.delete(change.target);
        for (const entry of waiting) show(entry);
      }
    },
    // The entrance starts when the block is a little way into the view, not at its first pixel.
    { rootMargin: '0px 0px -10% 0px', threshold: 0 },
  );
  return observer;
}

/**
 * Prepare one element: hide it if it is still below the fold, and watch it. Returns the undo.
 * Does nothing (the element stays visible and still) without IntersectionObserver or when the
 * visitor prefers reduced motion. Browser-only: call it from an effect.
 */
export function prepareReveal(element: HTMLElement, { variant = 'rise', delay = 0 }: RevealOptions = {}): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  // A line that draws itself is a collapsed sliver (scale 0) until it is shown, which the observer
  // would never see: it watches the line's parent instead.
  const target = variant === 'rise' ? element : (element.parentElement ?? element);
  const box = target.getBoundingClientRect();
  const height = window.innerHeight || document.documentElement.clientHeight;
  // Not laid out (display: none), or already in the view or behind us: leave it alone, so
  // nothing that is on screen flashes and nothing the visitor has scrolled past is hidden.
  if ((box.width === 0 && box.height === 0) || box.top < height * FOLD) return () => {};

  const entry: Entry = { element, variant, delay, timer: undefined };
  entries.set(target, [...(entries.get(target) ?? []), entry]);
  element.setAttribute('data-reveal', variant);
  element.setAttribute('data-reveal-state', 'hidden');
  element.style.setProperty('--reveal-delay', `${delay}ms`);
  sharedObserver().observe(target);

  return () => {
    const waiting = (entries.get(target) ?? []).filter((candidate) => candidate !== entry);
    if (waiting.length > 0) entries.set(target, waiting);
    else {
      entries.delete(target);
      observer?.unobserve(target);
    }
    if (entry.timer !== undefined) window.clearTimeout(entry.timer);
    clear(element);
  };
}

/**
 * useReveal — the block rises / fades in, or draws itself, once, when it enters the view.
 *
 * The marks that hide it are put on the element by script after mount, never by React, so the
 * prerendered HTML and the first client render are identical and visible (no JavaScript, no
 * problem). Use the returned ref on any element:
 *
 *   const ref = useReveal<HTMLLIElement>({ delay: 90 });
 *   return <li ref={ref}>…</li>;
 */
export function useReveal<T extends HTMLElement = HTMLElement>(options: RevealOptions = {}): RefObject<T | null> {
  const ref = useRef<T>(null);
  const { variant = 'rise', delay = 0 } = options;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return prepareReveal(element, { variant, delay });
  }, [variant, delay]);
  return ref;
}
