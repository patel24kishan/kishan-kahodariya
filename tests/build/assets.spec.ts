import { expect, test, type APIRequestContext } from '@playwright/test';
import { relative, siteMap } from '../infra/support/site-map';
import { classify, referencedUrls } from './support/html';

/**
 * Every URL a prerendered page refers to is either external or under the base path, and
 * every internal one answers 200 directly (no redirect hop, no 404). That covers scripts,
 * stylesheets, icons, the manifest, images and the links between pages; the stylesheets'
 * own url(…) references (fonts) are followed one level down.
 *
 * (hydration.spec.ts checks the same thing from the browser's side: every request a page
 * actually makes.)
 */
async function htmlOf(request: APIRequestContext, address: string, expectedStatus: number): Promise<string> {
  const response = await request.get(address, { maxRedirects: 0 });
  expect(response.status(), address).toBe(expectedStatus);
  return response.text();
}

/** Internal URLs of a document, after asserting none is relative or outside the base. */
function internalUrls(html: string, where: string): string[] {
  const internal: string[] = [];
  for (const url of referencedUrls(html)) {
    const kind = classify(url);
    expect(kind, `${where}: "${url}" is a relative URL — it would break on a deep link`).not.toBe('relative');
    if (kind !== 'internal') continue;
    expect(url.startsWith(siteMap.base), `${where}: "${url}" is outside ${siteMap.base}`).toBe(true);
    internal.push(url.split('#')[0] ?? url);
  }
  return internal;
}

test('every URL in every prerendered page is under the base path and loads', async ({ request, baseURL }) => {
  const pages: Array<{ address: string; status: number }> = [
    ...siteMap.routes.map((route) => ({ address: relative(route), status: 200 })),
    { address: './404.html', status: 200 },
    { address: './no/such/page', status: 404 },
  ];

  const found = new Map<string, string>(); // url → first page that uses it
  for (const { address, status } of pages) {
    const html = await htmlOf(request, address, status);
    const urls = internalUrls(html, address);
    expect(urls.length, `${address} refers to its assets`).toBeGreaterThan(0);
    for (const url of urls) if (!found.has(url)) found.set(url, address);
  }

  const stylesheets: string[] = [];
  let scripts = 0;
  for (const [url, usedBy] of found) {
    const response = await request.get(new URL(url, baseURL).href, { maxRedirects: 0 });
    expect(response.status(), `${url} (used by ${usedBy})`).toBe(200);
    const type = response.headers()['content-type'] ?? '';
    if (type.includes('text/css')) stylesheets.push(url);
    if (type.includes('javascript')) scripts += 1;
  }
  expect(stylesheets.length, 'pages link a stylesheet').toBeGreaterThan(0);
  expect(scripts, 'pages load the app script').toBeGreaterThan(0);

  // One level down: what the stylesheets themselves load (fonts, images).
  for (const stylesheet of stylesheets) {
    const css = await (await request.get(new URL(stylesheet, baseURL).href)).text();
    const references = Array.from(css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g), (match) => match[2] ?? '').filter(
      (url) => !url.startsWith('data:') && !url.startsWith('#'),
    );
    for (const reference of references) {
      const kind = classify(reference);
      if (kind === 'external') continue;
      const resolved = new URL(reference, new URL(stylesheet, baseURL));
      expect(resolved.pathname.startsWith(siteMap.base), `${stylesheet}: ${reference}`).toBe(true);
      const response = await request.get(resolved.href, { maxRedirects: 0 });
      expect(response.status(), `${reference} (from ${stylesheet})`).toBe(200);
    }
  }
});

test('static files from public/ are served under the base path', async ({ request }) => {
  for (const [file, type] of [
    ['./favicon-64.png', 'image/'],
    ['./manifest.json', 'application/json'],
    ['./robots.txt', 'text/plain'],
    ['./images/profile.jpg', 'image/jpeg'],
  ] as const) {
    const response = await request.get(file, { maxRedirects: 0 });
    expect(response.status(), file).toBe(200);
    expect(response.headers()['content-type'], file).toContain(type);
  }
});

test('nothing is served outside the base path', async ({ request, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  for (const pathname of ['/assets/', '/favicon-64.png', '/gamedev', '/index.html']) {
    const response = await request.get(`${origin}${pathname}`, { maxRedirects: 0 });
    expect(response.status(), pathname).toBe(404);
  }
});
