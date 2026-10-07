/*
 * PREVIEW LOGIC — the rules that decide what each of the two pages shows for an item.
 *
 * These are the same rules the site uses (src/content/selectors.ts and the "tidied while
 * reading" rules of src/content/schema.ts), written again as plain JavaScript because the
 * dashboard is a static page that cannot import the site's TypeScript.
 *
 * To keep the two from drifting apart, tests/admin/preview.spec.ts runs every function below
 * against the site's own selectors for every item under /content, and fails on a difference.
 * If you change a rule in selectors.ts, change it here too — the test tells you where.
 *
 * Pure functions only: no DOM, no CMS, no imports. Inputs are plain objects as stored in the
 * content files, but possibly half-filled (an item being typed), so nothing here assumes a
 * value is present.
 */

/** The two public pages, in the order the previews show them. */
export const PAGES = [
  { id: 'game', label: 'Game page' },
  { id: 'softdev', label: 'Software page' },
];

/** Id of the tab that always exists and is never stored as a category. */
export const ALL_TAB_ID = 'all';

/** Hover text used when a project's tab cannot be found (same words as selectors.ts). */
export const FALLBACK_HOVER_TEXT = 'View Screenshots';

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

/** A text list as the site reads it: blank rows are dropped, the others are kept as written. */
export function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim() !== '');
}

/** Screenshot rows as the site reads them: a row without an image is dropped. */
export function cleanScreenshots(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row !== null && typeof row === 'object' && !isBlank(row.src))
    .map((row) => ({ src: text(row.src), alt: text(row.alt) }));
}

/** Project link rows as the site reads them: a row with neither a label nor an address is dropped. */
export function cleanProjectLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row !== null && typeof row === 'object' && !(isBlank(row.label) && isBlank(row.url)))
    .map((row) => ({ label: text(row.label), url: text(row.url), kind: text(row.kind) || 'other' }));
}

/** Number of whitespace-separated words. */
export function countWords(value) {
  const trimmed = text(value).trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** true when an item marked for `audience` belongs to `page` ("game" | "softdev"). */
export function belongsTo(audience, page) {
  return audience === 'both' || audience === page;
}

/** The item's position on one page (lower comes first). */
export function positionOn(item, page) {
  const value = page === 'game' ? item?.orderGame : item?.orderSoftdev;
  return typeof value === 'number' ? value : 0;
}

/** The project tabs in the order the site shows them, followed by the "All" tab. */
export function tabs(site) {
  const categories = Array.isArray(site?.categories) ? site.categories : [];
  const sorted = categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => category !== null && typeof category === 'object')
    .sort((a, b) => (Number(a.category.order) || 0) - (Number(b.category.order) || 0) || a.index - b.index)
    .map(({ category }) => ({ id: text(category.id), label: text(category.label) }));
  return [...sorted, { id: ALL_TAB_ID, label: text(site?.allTabLabel) }];
}

/** Label of a tab id, or "" when no such tab exists. */
export function tabLabel(site, id) {
  const match = tabs(site).find((tab) => tab.id === id);
  return match ? match.label : '';
}

/**
 * The words shown over a project's card image, and where they come from:
 * "project" (its own hover text), "tab" (the default of its tab) or "fallback" (tab not found).
 */
export function hoverText(project, site) {
  if (text(project?.hoverText) !== '') return { text: project.hoverText, from: 'project' };
  const categories = Array.isArray(site?.categories) ? site.categories : [];
  const category = categories.find((candidate) => candidate && candidate.id === project?.category);
  if (!category) return { text: FALLBACK_HOVER_TEXT, from: 'fallback' };
  return {
    text: text(project?.videoUrl) !== '' ? text(category.hoverWithVideo) : text(category.hoverWithoutVideo),
    from: 'tab',
  };
}

/**
 * The buttons under a project card: links with an address are shown, links without one are
 * hidden, and a "Gameplay" button is added when the project has a video.
 */
export function projectButtons(project) {
  const links = cleanProjectLinks(project?.links);
  return {
    shown: links.filter((link) => link.url.trim() !== ''),
    hidden: links.filter((link) => link.url.trim() === ''),
    gameplay: text(project?.videoUrl).trim() !== '',
  };
}

/**
 * The bullet points one page shows for a job: the page's own set when it has rows,
 * otherwise the default set. `from` is "page" or "default".
 */
export function resolvedBullets(job, page) {
  const specific = cleanList(page === 'game' ? job?.bulletsGame : job?.bulletsSoftdev);
  if (specific.length > 0) return { bullets: specific, from: 'page' };
  return { bullets: cleanList(job?.bullets), from: 'default' };
}

/**
 * Where a link shows on one page. `shown` is false when the link is not for this page or has
 * no address; `hero` / `footer` say in which of the two places it appears.
 */
export function linkOnPage(link, page) {
  if (text(link?.url).trim() === '') return { shown: false, hero: false, footer: false, reason: 'no-address' };
  if (!belongsTo(link?.audience, page)) return { shown: false, hero: false, footer: false, reason: 'other-page' };
  const hero = link?.showInHero === true;
  const footer = link?.showInFooter === true;
  if (!hero && !footer) return { shown: false, hero: false, footer: false, reason: 'no-place' };
  return { shown: true, hero, footer, reason: '' };
}

/** Text order as the site sorts it: case-insensitive first, then by code point. Never locale-aware. */
function compareText(a, b) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left !== right) return left < right ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A link's position in one of its two places. "hero" (next to the name) reads `order`;
 * "footer" reads `orderFooter`, and falls back to `order` when no footer order is stored.
 */
export function linkPosition(link, place) {
  const order = typeof link?.order === 'number' ? link.order : 0;
  if (place !== 'footer') return order;
  return typeof link?.orderFooter === 'number' ? link.orderFooter : order;
}

/**
 * The published links one page shows in one place ("hero" | "footer"), in the site's order:
 * the hero by `order` (then label, then short name), the footer by `orderFooter` (then
 * `order`, then short name).
 */
export function linksInPlace(links, page, place) {
  const shown = (Array.isArray(links) ? links : []).filter(
    (link) => link !== null && typeof link === 'object' && link.published === true && linkOnPage(link, page)[place] === true,
  );
  if (place === 'footer') {
    return shown.sort(
      (a, b) =>
        linkPosition(a, 'footer') - linkPosition(b, 'footer') ||
        linkPosition(a, 'hero') - linkPosition(b, 'hero') ||
        compareText(text(a.slug), text(b.slug)),
    );
  }
  return shown.sort(
    (a, b) =>
      linkPosition(a, 'hero') - linkPosition(b, 'hero') ||
      compareText(text(a.label), text(b.label)) ||
      compareText(text(a.slug), text(b.slug)),
  );
}

/** "Resume for a specific tab" rows as the site reads them: a row without a tab is dropped. */
export function cleanTabResumes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row !== null && typeof row === 'object' && !isBlank(row.tab))
    .map((row) => ({ tab: text(row.tab), url: text(row.url), label: text(row.label) }));
}

/**
 * The resume button of a page while the tab `tabId` is open (getResume in selectors.ts): the
 * tab's own row when it has a link, otherwise the page's main resume. `from` is "tab" or "main".
 */
export function resumeForTab(track, tabId) {
  const main = { url: text(track?.resumeUrl), label: text(track?.resumeLabel), from: 'main' };
  const own = cleanTabResumes(track?.tabResumes).find((row) => row.tab === tabId && row.url.trim() !== '');
  if (!own) return main;
  return { url: own.url, label: own.label.trim() !== '' ? own.label : main.label, from: 'tab' };
}

/** true when a skill group is drawn in the accent colour on `page`. */
export function isEmphasised(group, page) {
  return group?.emphasis === 'both' || group?.emphasis === page;
}
