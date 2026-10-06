/**
 * Small readers for raw HTML text — what a crawler or a browser with JavaScript switched off
 * receives. Deliberately string-based: these tests are about the bytes the server sends,
 * before any script has had a chance to fix anything.
 */

export function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/g, '&');
}

/** Text of the <title> elements in the document. */
export function titles(html: string): string[] {
  return Array.from(html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi), (match) => decodeEntities(match[1] ?? '').trim());
}

/** Every opening tag with the given name, as written ("<meta name=… />"). */
export function tags(html: string, name: string): string[] {
  return Array.from(html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi')), (match) => match[0]);
}

/** Value of an attribute inside one opening tag, or null. */
export function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  if (!match) return null;
  return decodeEntities(match[1] ?? match[2] ?? '');
}

/** The first opening tag that carries attribute="value". */
export function tagWith(html: string, name: string, value: string): string | null {
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    if (attribute(match[0], name) === value) return match[0];
  }
  return null;
}

/** `content` of <meta name|property="key">, one entry per matching tag. */
export function meta(html: string, key: string): string[] {
  return tags(html, 'meta')
    .filter((tag) => attribute(tag, 'name') === key || attribute(tag, 'property') === key)
    .map((tag) => attribute(tag, 'content') ?? '');
}

/** `href` of every <link rel="…">. */
export function links(html: string, rel: string): string[] {
  return tags(html, 'link')
    .filter((tag) => attribute(tag, 'rel') === rel)
    .map((tag) => attribute(tag, 'href') ?? '');
}

/** What is inside <div id="root">…</div>. */
export function rootMarkup(html: string): string {
  const match = /<div id="root">([\s\S]*)<\/div>\s*<\/body>/i.exec(html);
  return match?.[1] ?? '';
}

/** Every URL the document refers to through src, href, poster or srcset. */
export function referencedUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    for (const name of ['src', 'href', 'poster']) {
      const value = attribute(match[0], name);
      if (value !== null) urls.push(value);
    }
    const srcset = attribute(match[0], 'srcset');
    if (srcset !== null) {
      for (const candidate of srcset.split(',')) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) urls.push(url);
      }
    }
  }
  return urls;
}

export type UrlKind = 'internal' | 'external' | 'fragment' | 'relative' | 'empty';

/** How a URL found in a page relates to the site. `base` ends with "/". */
export function classify(url: string): UrlKind {
  const trimmed = url.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.startsWith('#')) return 'fragment';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return 'external';
  if (trimmed.startsWith('/')) return 'internal';
  return 'relative';
}
