/**
 * The load screen that keeps the page from showing before the welcome popup.
 *
 * The page is prerendered, so it paints long before the script that decides to show the popup
 * has loaded. For a first-time phone visitor an inline script in index.html therefore marks
 * <html> with this class before the first paint, and a black load screen (#kk-load: a ring
 * counting 0 to 100) covers the page. When the popup is ready the app calls finishPopupCover():
 * the count runs to 100, the load screen fades away and the popup fades in. Where no popup is
 * coming (or the app never starts), the load screen is removed instead (liftPopupCover, or the
 * 12 second limit inside index.html), so the page can never stay hidden.
 */
export const POPUP_COVER_CLASS = 'kk-popup-pending';

interface LoadScreen {
  finish(reveal: () => void): void;
  abort(): void;
}

function loadScreen(): LoadScreen | undefined {
  return (window as unknown as { __kkLoad?: LoadScreen }).__kkLoad;
}

/** Is the load screen up right now? */
export function popupCoverActive(): boolean {
  return document.documentElement.classList.contains(POPUP_COVER_CLASS);
}

/** Remove the load screen at once (no popup is coming). Safe to call at any time. */
export function liftPopupCover(): void {
  loadScreen()?.abort();
  document.documentElement.classList.remove(POPUP_COVER_CLASS);
}

/**
 * The popup is ready: finish the count, then call reveal() as the load screen starts to fade.
 * With no load screen up, reveal() is called straight away.
 */
export function finishPopupCover(reveal: () => void): void {
  const screen = loadScreen();
  if (popupCoverActive() && screen) screen.finish(reveal);
  else reveal();
}
