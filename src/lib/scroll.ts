/**
 * Scroll rules for client-side navigation. The router itself never touches the scroll
 * position; this hook is the only thing that does.
 *
 *   navigation                                   result
 *   -------------------------------------------  ---------------------------------------------
 *   tab → tab on the same page ("/gamedev/unity" stay exactly where you are
 *     → "/gamedev/unreal", also from "/")
 *   to a different page ("/gamedev…" → "/softdev") jump to the top (instant, not animated)
 *   to an address with a "#hash"                 scroll that element into view
 *   back / forward, and a plain `<a href="#id">` nothing — the browser restores / scrolls itself
 *   first load with a "#hash"                    scroll that element into view (needed when the
 *                                                page was rendered by the client; harmless when
 *                                                the browser already did it)
 *
 * "Same page" is decided by `pageKey` (one key per public page), not by the path.
 * Sections keep clear of the sticky nav with CSS `scroll-margin-top`, which
 * scrollIntoView() honours.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

function scrollToHash(hash: string): boolean {
  if (hash.length < 2) return false;
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // Not valid percent-encoding: use the raw text.
  }
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView();
  return true;
}

export function useScrollManager(pageKey: string): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPage = useRef<string | null>(null);

  // A layout effect, so a jump to the top happens before the new page is painted.
  useLayoutEffect(() => {
    const cameFrom = previousPage.current;
    previousPage.current = pageKey;

    if (cameFrom === null) {
      if (location.hash) scrollToHash(location.hash);
      return;
    }
    if (navigationType === 'POP') return;
    if (location.hash && scrollToHash(location.hash)) return;
    if (cameFrom !== pageKey) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // location.key changes on every navigation, so clicking the same hash link twice works.
  }, [location.key, location.hash, navigationType, pageKey]);
}

export interface PageScrollState {
  /** true once the page has left the top. Always false on the server and on the first render. */
  scrolled: boolean;
  /** Id of the section in view once scrolled; null at the top of the page. */
  activeId: string | null;
}

/** The page counts as scrolled from this many px on. */
const SCROLLED_FROM = 16;
/**
 * A section is "in view" once its top is at or above this line (px from the top of the
 * viewport): just below where a section link lands a section (its scroll-margin-top).
 */
const ACTIVE_LINE = 120;

const AT_TOP: PageScrollState = { scrolled: false, activeId: null };

/**
 * usePageScroll — what the header needs to know about the scroll position: whether the page
 * has left the top, and which of `sectionIds` (in page order) is in view. Read after mount
 * and on scroll / resize (once per frame), never during render: the server and the first
 * client render both get the top-of-page state.
 *
 * The section in view is the last one whose top has reached the line under the header; at the
 * very end of the page it is the last section, which may be too short to ever reach that line.
 * Pass a stable array (a module constant).
 */
export function usePageScroll(sectionIds: readonly string[]): PageScrollState {
  const [state, setState] = useState<PageScrollState>(AT_TOP);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const scrolled = y > SCROLLED_FROM;
      let activeId: string | null = null;
      if (scrolled) {
        let last: string | null = null;
        for (const id of sectionIds) {
          const section = document.getElementById(id);
          if (!section) continue;
          last = id;
          if (section.getBoundingClientRect().top <= ACTIVE_LINE) activeId = id;
        }
        const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 2;
        if (atEnd && last !== null) activeId = last;
      }
      setState((previous) => (previous.scrolled === scrolled && previous.activeId === activeId ? previous : { scrolled, activeId }));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [sectionIds]);

  return state;
}
