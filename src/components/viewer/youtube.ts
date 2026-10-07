/**
 * YouTube addresses → video id → privacy-enhanced embed URL. Pure functions, no imports, so
 * the tests can load this module in plain Node.
 *
 * Accepted forms (the id is always 11 characters of [A-Za-z0-9_-]):
 *   https://www.youtube.com/watch?v=<id>        https://youtu.be/<id>
 *   https://www.youtube.com/embed/<id>          https://www.youtube.com/shorts/<id>
 *   https://www.youtube.com/live/<id>           https://www.youtube.com/v/<id>
 *   https://www.youtube.com/<anything>?v=<id>   (one migrated project has "/Gameplay?v=…")
 * Anything else, including a non-YouTube address, gives null and the viewer falls back to a
 * button that opens the address in a new tab.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PATH_PREFIXES = new Set(['embed', 'shorts', 'live', 'v']);

function isYoutubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
}

/** The video id in a YouTube address, or null when none can be read. */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);
  let candidate: string | undefined;

  if (host === 'youtu.be') {
    candidate = segments[0];
  } else if (isYoutubeHost(host)) {
    const fromQuery = parsed.searchParams.get('v');
    if (fromQuery) candidate = fromQuery;
    else if (segments[0] !== undefined && PATH_PREFIXES.has(segments[0])) candidate = segments[1];
  } else {
    return null;
  }

  return candidate !== undefined && VIDEO_ID.test(candidate) ? candidate : null;
}

/** The privacy-enhanced embed address for a video id. */
export function youtubeEmbedUrl(id: string, options: { autoplay?: boolean } = {}): string {
  const params = new URLSearchParams({ rel: '0' });
  if (options.autoplay) params.set('autoplay', '1');
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
}
