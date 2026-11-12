import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { PopupSettings, TrackId } from '@/content';
import { liftPopupCover } from './popupCover';

const PopupDialog = lazy(() => import('./PopupDialog'));

/** localStorage key that remembers a visitor already saw the popup. */
export const POPUP_SEEN_KEY = 'kk-welcome-seen';

export interface WelcomePopupProps {
  popup: PopupSettings;
  /** The site's email address; empty hides the mail button. */
  email: string;
  /** The page the visitor is on: the popup can be switched off per page. */
  track: TrackId;
}

/**
 * The welcome popup, shown once to a first-time visitor.
 *
 * Nothing is rendered on the server and the first client render matches it: the visitor's
 * history is read in an effect, so the prerendered HTML is the same for everyone. The popup
 * code (and the two display fonts it uses) is loaded only when it is about to be shown.
 * Every screen size: on a desktop it is the same popup, sized to the window (PopupDialog).
 * The dashboard switches it per page (game, software) and per screen (phones, desktops).
 * The "seen" flag is set when the popup opens, so a reload does not show it again. Adding
 * ?popup=1 to the address shows it regardless, for the owner to look at it.
 *
 * A first-time visitor must not see the page first: index.html covers the page before
 * the first paint (popupCover.ts) and the cover is lifted here when no popup is coming, or by
 * the dialog once it is open.
 */
/** Phones: screens narrower than this see the popup only when it is switched on for phones. */
export const PHONE_MEDIA = '(max-width: 767px)';

export function WelcomePopup({ popup, email, track }: WelcomePopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPage = track === 'softdev' ? popup.onSoftwarePage : popup.onGamePage;
    const onScreen = window.matchMedia(PHONE_MEDIA).matches ? popup.onPhones : popup.onDesktops;
    if (!popup.enabled || !onPage || !onScreen) {
      liftPopupCover();
      return;
    }
    let forced = false;
    let seen = false;
    try {
      forced = new URLSearchParams(window.location.search).get('popup') === '1';
      seen = window.localStorage.getItem(POPUP_SEEN_KEY) !== null;
    } catch {
      // Storage blocked (private window): show it once per page load.
    }
    if (!forced && seen) {
      liftPopupCover();
      return;
    }
    try {
      window.localStorage.setItem(POPUP_SEEN_KEY, '1');
    } catch {
      // Ignored: see above.
    }
    setOpen(true);
  }, [popup.enabled, popup.onGamePage, popup.onSoftwarePage, popup.onPhones, popup.onDesktops, track]);

  const close = useCallback(() => setOpen(false), []);

  return <Suspense fallback={null}>{open && popup.enabled && <PopupDialog popup={popup} email={email} onClose={close} />}</Suspense>;
}
