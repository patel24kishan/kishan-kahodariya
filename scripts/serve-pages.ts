/**
 * SERVE-PAGES — a tiny static server that answers the way GitHub Pages does, so the
 * production build can be checked locally (`npm run preview`, and tests/build).
 *
 * dist/ is mounted at the base path (BASE_PATH in src/lib/site-config.ts). For a request
 * path P inside the base, the first rule that applies wins:
 *
 *   1. P is a file                         → 200, that file
 *   2. P has no trailing slash and P.html  → 200, P.html             ("/gamedev" → gamedev.html)
 *      is a file
 *   3. P is a folder, no trailing slash    → 301 to P + "/"          (query string kept)
 *   4. P is a folder, trailing slash       → 200, P/index.html if it exists
 *   5. anything else                       → 404, body of 404.html
 *
 * Paths are matched with exact letter case on every operating system (GitHub Pages is
 * case-sensitive). "/My-Portfolio" (the base without its slash) is a 301 to the base.
 * Outside the base nothing is served (404), except that "/" redirects to the base for
 * convenience. Only GET and HEAD are allowed.
 *
 * Environment: PORT (default 4173).
 */
import { createReadStream, existsSync, realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_PATH, DIST_DIR } from '../src/lib/site-config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_AS_CONFIGURED = path.join(ROOT, DIST_DIR);
if (!existsSync(path.join(DIST_AS_CONFIGURED, 'index.html'))) {
  console.error(`${DIST_DIR}/index.html not found. Run "npm run build" first.`);
  process.exit(1);
}
// The folder's real spelling, so request paths can be compared against it letter for letter.
const DIST = realpathSync.native(DIST_AS_CONFIGURED);
const PORT = Number(process.env.PORT ?? 4173);
const BASE = BASE_PATH; // "/My-Portfolio/"
const BASE_NO_SLASH = BASE.replace(/\/+$/, ''); // "/My-Portfolio", or "" when the base is "/"

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
};

type Kind = 'file' | 'directory' | 'missing';

/**
 * What a path is — with exact letter case. GitHub Pages is case-sensitive, Windows and macOS
 * are not: "/images/Profile.JPG" must be a 404 here too when the file is "profile.jpg",
 * or a wrong-case link would work locally and break once deployed.
 */
async function kindOf(target: string): Promise<Kind> {
  try {
    const info = await stat(target);
    if ((await realpath(target)) !== target) return 'missing';
    if (info.isFile()) return 'file';
    if (info.isDirectory()) return 'directory';
    return 'missing';
  } catch {
    return 'missing';
  }
}

/** Absolute path inside dist/ for a path relative to the base, or null if it would escape. */
function insideDist(relative: string): string | null {
  const target = path.resolve(DIST, relative);
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return null;
  return target;
}

async function sendFile(response: ServerResponse, file: string, status: number, headOnly: boolean): Promise<void> {
  const info = await stat(file);
  response.writeHead(status, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // Always revalidate: a preview must show the build that is on disk right now.
    'Cache-Control': 'no-cache',
  });
  if (headOnly) {
    response.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('error', reject);
    response.on('close', resolve);
    stream.pipe(response);
  });
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(301, { Location: location, 'Content-Length': 0 });
  response.end();
}

async function notFound(response: ServerResponse, headOnly: boolean): Promise<void> {
  const page = path.join(DIST, '404.html');
  if ((await kindOf(page)) === 'file') {
    await sendFile(response, page, 404, headOnly);
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(headOnly ? undefined : 'Not found');
}

const server = createServer((request, response) => {
  void (async () => {
    const headOnly = request.method === 'HEAD';
    if (request.method !== 'GET' && !headOnly) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Bad request');
      return;
    }

    if (BASE !== '/') {
      if (pathname === BASE_NO_SLASH || pathname === '/') {
        redirect(response, BASE + url.search);
        return;
      }
      if (!pathname.startsWith(BASE)) {
        // Not part of this site. (On GitHub Pages this would be another repository.)
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(headOnly ? undefined : `Nothing is served outside ${BASE}`);
        return;
      }
    }

    const relative = pathname.slice(BASE.length);
    const target = insideDist(relative);
    if (target === null || relative.includes('\0')) {
      await notFound(response, headOnly);
      return;
    }

    const endsWithSlash = pathname.endsWith('/');
    const kind = await kindOf(target);

    if (kind === 'file' && !endsWithSlash) {
      await sendFile(response, target, 200, headOnly);
      return;
    }
    if (!endsWithSlash && relative !== '' && (await kindOf(`${target}.html`)) === 'file') {
      await sendFile(response, `${target}.html`, 200, headOnly);
      return;
    }
    if (kind === 'directory') {
      if (!endsWithSlash) {
        redirect(response, `${url.pathname}/${url.search}`);
        return;
      }
      const index = path.join(target, 'index.html');
      if ((await kindOf(index)) === 'file') {
        await sendFile(response, index, 200, headOnly);
        return;
      }
    }
    await notFound(response, headOnly);
  })().catch((error: unknown) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Server error');
  });
});

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Set PORT to another one.` : `Server error: ${error.message}`,
  );
  process.exit(1);
});

server.listen(PORT, 'localhost', () => {
  console.log(`Serving ${DIST_DIR}/ the way GitHub Pages does: http://localhost:${PORT}${BASE}`);
});
