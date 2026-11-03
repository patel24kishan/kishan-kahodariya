import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { PopupSettings } from '@/content';

const PopupDialog = lazy(() => import('./PopupDialog'));

/** localStorage key that remembers a visitor already saw the popup. */
export const POPUP_SEEN_KEY = 'kk-welcome-seen';

export interface WelcomePopupProps {
  popup: PopupSettings;
  /** The resume for the page that is open (getResume): an empty url hides the button. */
  resume: { url: string; label: string };
  /** The site's email address; empty hides the mail button. */
  email: string;
}

/**
 * The welcome popup, shown once to a first-time visitor.
 *
 * Nothing is rendered on the server and the first client render matches it: the visitor's
 * history is read in an effect, so the prerendered HTML is the same for everyone. The popup
 * code (and the two display fonts it uses) is loaded only when it is about to be shown.
 * The "seen" flag is set when the popup opens, so a reload does not show it again. Adding
 * ?popup=1 to the address shows it regardless, for the owner to look at it.
 */
export function WelcomePopup({ popup, resume, email }: WelcomePopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup.enabled) return;
    let forced = false;
    let seen = false;
    try {
      forced = new URLSearchParams(window.location.search).get('popup') === '1';
      seen = window.localStorage.getItem(POPUP_SEEN_KEY) !== null;
    } catch {
      // Storage blocked (private window): show it once per page load.
    }
    if (!forced && seen) return;
    try {
      window.localStorage.setItem(POPUP_SEEN_KEY, '1');
    } catch {
      // Ignored: see above.
    }
    setOpen(true);
  }, [popup.enabled]);

  const close = useCallback(() => setOpen(false), []);

  return <Suspense fallback={null}>{open && popup.enabled && <PopupDialog popup={popup} resume={resume} email={email} onClose={close} />}</Suspense>;
}
