/**
 * The page's anchored sections, in page order. The nav, the phone menu and the footer's
 * "Navigate" column all draw their links from this list, so they can never disagree.
 */
export interface PageSection {
  /** Anchor id of the <section>. */
  id: string;
  label: string;
}

export const PAGE_SECTIONS: readonly PageSection[] = [
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Projects' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills' },
  { id: 'education', label: 'Education' },
];

/** Id of the page root, the target of the monogram link. */
export const PAGE_TOP_ID = 'top';

/** Id of the <main> landmark, the target of the skip link. */
export const MAIN_ID = 'main';
