/**
 * Document head per route: <title>, description, canonical link and Open Graph basics.
 *
 * One description of the head (`DocumentHead`) has two consumers:
 *   - scripts/prerender.ts writes it into each route's HTML file with renderHead();
 *   - the running app keeps the live document in sync after a client navigation with
 *     applyHead() (called from an effect — never during render).
 *
 * The tags live in <head>, outside the React root, so they can never cause a hydration
 * mismatch. Managed tags carry the `data-kk-head` attribute; everything else in <head>
 * (charset, viewport, theme-color, the theme script, icons, the built CSS/JS) is static and
 * comes from index.html.
 *
 * Pages must not render their own <title> / <meta> elements: this module owns them.
 */
import { getSite, type TrackProfile } from '@/content';
import { absoluteAssetUrl, absoluteUrl } from './paths';

export const HEAD_ATTR = 'data-kk-head';

export interface HeadTag {
  tag: 'meta' | 'link';
  attrs: Readonly<Record<string, string>>;
}

export interface DocumentHead {
  title: string;
  tags: HeadTag[];
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** <title> of a page: its metaTitle, else "<name> — <headline>". */
export function trackTitle(track: TrackProfile): string {
  const explicit = collapseWhitespace(track.metaTitle);
  if (explicit) return explicit;
  return [getSite().name, track.headline].map(collapseWhitespace).filter(Boolean).join(' — ');
}

/** Meta description of a page: its metaDescription, else its summary, word for word. */
export function trackDescription(track: TrackProfile): string {
  return collapseWhitespace(track.metaDescription) || collapseWhitespace(track.summary);
}

/** A picture for shared links (WhatsApp, LinkedIn, …), a file under public/. */
interface ShareImage {
  path: string;
  /** Pixel size, when it is known: lets a chat app lay out the card before the picture loads. */
  width?: number;
  height?: number;
  /** "summary" (small square) or "summary_large_image" (wide card). */
  card: 'summary' | 'summary_large_image';
}

/** The logo, a 512 px square: what a shared link shows unless the page has a picture of its own. */
export const SHARE_IMAGE: ShareImage = { path: '/icon-512.png', width: 512, height: 512, card: 'summary' };

/** Pages with a picture of their own: a still from the page's hero video, 1200 × 630. */
const SHARE_IMAGE_BY_TRACK: Partial<Record<TrackProfile['id'], ShareImage>> = {
  softdev: { path: '/share/softdev.jpg', width: 1200, height: 630, card: 'summary_large_image' },
};

/** Head for a public page. `canonicalPath` is a router path ("/", "/softdev", "/gamedev/unreal"). */
export function trackHead(track: TrackProfile, canonicalPath: string): DocumentHead {
  const site = getSite();
  const title = trackTitle(track);
  const description = trackDescription(track);
  const url = absoluteUrl(canonicalPath);
  const shareImage = SHARE_IMAGE_BY_TRACK[track.id] ?? SHARE_IMAGE;
  const image = absoluteAssetUrl(shareImage.path);

  const tags: HeadTag[] = [];
  if (description) tags.push({ tag: 'meta', attrs: { name: 'description', content: description } });
  tags.push({ tag: 'link', attrs: { rel: 'canonical', href: url } });
  tags.push({ tag: 'meta', attrs: { property: 'og:type', content: 'website' } });
  if (site.name) tags.push({ tag: 'meta', attrs: { property: 'og:site_name', content: site.name } });
  tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title } });
  if (description) tags.push({ tag: 'meta', attrs: { property: 'og:description', content: description } });
  tags.push({ tag: 'meta', attrs: { property: 'og:url', content: url } });
  if (image) {
    tags.push({ tag: 'meta', attrs: { property: 'og:image', content: image } });
    if (shareImage.width) tags.push({ tag: 'meta', attrs: { property: 'og:image:width', content: String(shareImage.width) } });
    if (shareImage.height) tags.push({ tag: 'meta', attrs: { property: 'og:image:height', content: String(shareImage.height) } });
    const imageAlt = collapseWhitespace(site.logoAlt) || collapseWhitespace(site.name);
    if (imageAlt) tags.push({ tag: 'meta', attrs: { property: 'og:image:alt', content: imageAlt } });
  }
  tags.push({ tag: 'meta', attrs: { name: 'twitter:card', content: shareImage.card } });
  return { title, tags };
}

/** Head for anything that is not a public page (not-found, dev-only routes): never indexed. */
export function plainHead(label: string): DocumentHead {
  const name = getSite().name;
  return {
    title: [label, name].filter(Boolean).join(' — '),
    tags: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } }],
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The head as an HTML string, one element per line. */
export function renderHead(head: DocumentHead, indent = '    '): string {
  const lines = [`<title>${escapeHtml(head.title)}</title>`];
  for (const { tag, attrs } of head.tags) {
    const rendered = Object.entries(attrs)
      .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
      .join(' ');
    lines.push(`<${tag} ${rendered} ${HEAD_ATTR} />`);
  }
  return lines.join(`\n${indent}`);
}

function matches(element: Element, expected: HeadTag): boolean {
  if (element.tagName.toLowerCase() !== expected.tag) return false;
  const entries = Object.entries(expected.attrs);
  // +1: the marker attribute.
  if (element.attributes.length !== entries.length + 1) return false;
  return entries.every(([name, value]) => element.getAttribute(name) === value);
}

/** Bring the live document's head in line with `head`. Browser only — call it from an effect. */
export function applyHead(head: DocumentHead): void {
  if (document.title !== head.title) document.title = head.title;

  const current = Array.from(document.head.querySelectorAll(`[${HEAD_ATTR}]`));
  const unchanged =
    current.length === head.tags.length && current.every((element, index) => matches(element, head.tags[index]!));
  if (unchanged) return;

  for (const element of current) element.remove();
  const fragment = document.createDocumentFragment();
  for (const { tag, attrs } of head.tags) {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    element.setAttribute(HEAD_ATTR, '');
    fragment.append(element);
  }
  const title = document.head.querySelector('title');
  if (title) title.after(fragment);
  else document.head.append(fragment);
}
