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
import { useLayoutEffect, useRef } from 'react';
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
