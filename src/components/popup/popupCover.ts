/**
 * The cover that keeps the page from showing before the welcome popup.
 *
 * The page is prerendered, so it paints long before the script that decides to show the popup
 * has loaded. For a first-time phone visitor an inline script in index.html therefore puts
 * this class on <html> before the first paint; a black cover (index.html) hides the page
 * until the popup is open, or until it is clear that no popup is coming. The same script
 * lifts the cover after a few seconds if the app never starts, so a failed script can never
 * leave the page black.
 */
export const POPUP_COVER_CLASS = 'kk-popup-pending';

/** Lift the cover. Safe to call at any time, any number of times. */
export function liftPopupCover(): void {
  document.documentElement.classList.remove(POPUP_COVER_CLASS);
}
