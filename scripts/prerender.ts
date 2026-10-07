/**
 * PRERENDER — the last step of `npm run build` (run with tsx, after `vite build`).
 *
 * Input:  dist/index.html from the client build. It is the HTML template: it holds the
 *         hashed CSS/JS tags and two markers, <!--kk:head-->…<!--/kk:head--> and <!--kk:app-->.
 * Steps:  1. build src/entry-server.tsx into dist-server/ (Vite SSR build, same config);
 *         2. render every route from getAllRoutes() and write it into dist/;
 *         3. write the redirect page(s), 404.html, .nojekyll and robots.txt;
 *         4. delete dist-server/.
 * Any route that fails to render fails the build (exit code 1).
 *
 * WHICH FILES A ROUTE BECOMES, AND WHY
 *   "/"               → dist/index.html
 *   "/gamedev/unity"  → dist/gamedev/unity.html  AND  dist/gamedev/unity/index.html
 *
 * GitHub Pages answers "/a/b" with a/b.html when that file exists (HTTP 200) and "/a/b/"
 * with a/b/index.html (HTTP 200). With only the folder form, "/a/b" is a 301 redirect to
 * "/a/b/"; with only the .html form, "/a/b/" is a 404. Writing both makes each spelling a
 * direct 200 with no redirect hop, so a pasted link works whichever way it was copied.
 * The two files are byte-identical and share one canonical URL (see src/lib/routing.ts).
 * scripts/serve-pages.ts reproduces these rules locally.
 */
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import type * as ServerEntry from '../src/entry-server';
import { DIST_DIR } from '../src/lib/site-config';

// The server bundle loads React from node_modules; make sure it gets the production build,
// the same one the browser bundle contains. (It is imported dynamically, after this line.)
process.env.NODE_ENV = 'production';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, DIST_DIR);
const SERVER_DIR = path.join(ROOT, 'dist-server');
const SERVER_ENTRY = 'src/entry-server.tsx';

const HEAD_BLOCK = /<!--kk:head-->[\s\S]*?<!--\/kk:head-->/;
const APP_MARKER = '<!--kk:app-->';
/** React writes this where a Suspense boundary could not be rendered on the server. */
const CLIENT_ONLY_BOUNDARY = '<!--$!-->';
const ROUTE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A value as a JavaScript literal that is safe inside an inline <script>. */
function inlineJson(value: unknown): string {
  // "<" is escaped so the text can never close the script element early.
  // String.fromCharCode(92) is a backslash: the result is the six characters of a JS unicode escape.
  const escapedLessThan = String.fromCharCode(92) + 'u003c';
  return JSON.stringify(value).replace(/</g, escapedLessThan);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Files (relative to dist/) one route is written to. */
function filesForRoute(route: string): string[] {
  if (route === '/') return ['index.html'];
  const relative = route.slice(1);
  return [`${relative}.html`, `${relative}/index.html`];
}

function assertRouteShape(route: string): void {
  if (route === '/') return;
  const segments = route.split('/');
  const wellFormed =
    route.startsWith('/') && segments.shift() === '' && segments.length > 0 && segments.every((s) => ROUTE_SEGMENT.test(s));
  if (!wellFormed) {
    throw new Error(
      `Route "${route}" cannot be written to a file. Expected "/segment/segment" with no trailing slash; ` +
        'segments may use letters, digits, ".", "_", "~" and "-".',
    );
  }
  if (segments.at(-1)?.toLowerCase() === 'index') {
    throw new Error(`Route "${route}" ends in "index", which collides with its parent folder's index.html.`);
  }
}

/**
 * Run one render and refuse a result that only looks fine: React reports some failures
 * (an error inside a <Suspense> boundary) by logging and leaving a client-only placeholder
 * instead of throwing.
 */
function renderChecked(render: () => ServerEntry.RenderedPage): ServerEntry.RenderedPage {
  const logged: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };
  let page: ServerEntry.RenderedPage;
  try {
    page = render();
  } finally {
    console.error = originalConsoleError;
  }
  if (logged.length > 0) throw new Error(`errors were logged while rendering:\n    ${logged.join('\n    ')}`);
  if (page.html.trim() === '') throw new Error('rendered to an empty string.');
  if (page.html.includes(CLIENT_ONLY_BOUNDARY)) {
    throw new Error('a <Suspense> boundary did not render on the server (it would only appear after JavaScript runs).');
  }
  return page;
}

function fillTemplate(template: string, page: ServerEntry.RenderedPage): string {
  // Function replacers: the markup may contain "$&" and friends, which a string would expand.
  return template.replace(HEAD_BLOCK, () => page.head).replace(APP_MARKER, () => page.html);
}

/** A page that sends the visitor on, with or without JavaScript. */
function redirectPage(redirect: ServerEntry.LegacyRedirect): string {
  const href = escapeHtml(redirect.toHref);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(redirect.title)}</title>
    <link rel="canonical" href="${escapeHtml(redirect.canonicalUrl)}" />
    <script>
      location.replace(${inlineJson(redirect.toHref)} + location.search + location.hash);
    </script>
    <meta http-equiv="refresh" content="0; url=${href}" />
  </head>
  <body>
    <p>This page has moved. <a href="${href}">Continue</a></p>
  </body>
</html>
`;
}

/**
 * Inline script for 404.html. GitHub Pages serves 404.html for every address without a file,
 * so before showing "not found" it checks whether the address is one the app knows how to
 * repair, and if so replaces it (no history entry):
 *   /game, /game/<tab>          → /gamedev, /gamedev/<tab>        (old address)
 *   /gamedev/<unknown tab>      → /gamedev                        (unknown tab → that page)
 *   /GameDev/Unity              → /gamedev/unity                  (letter case)
 * Anything else stays on the not-found page. The page is hidden while a redirect is under
 * way so "Page Not Found" does not flash.
 */
function notFoundScript(manifest: ServerEntry.SiteManifest): string {
  const data = inlineJson({
    base: manifest.base,
    routes: manifest.routes,
    pages: manifest.pageSegments,
    legacy: manifest.legacySegments,
  });
  return `<script>
      (function () {
        try {
          var site = ${data};
          var path = location.pathname;
          if (path.toLowerCase().indexOf(site.base.toLowerCase()) !== 0) return;
          var parts = path.slice(site.base.length).split('/').filter(Boolean).map(function (part) {
            try { return decodeURIComponent(part).toLowerCase(); } catch (e) { return part.toLowerCase(); }
          });
          if (!parts.length) return;
          var page = Object.prototype.hasOwnProperty.call(site.legacy, parts[0]) ? site.legacy[parts[0]] : parts[0];
          if (site.pages.indexOf(page) === -1) return;
          var target = '/' + [page].concat(parts.slice(1)).join('/');
          if (site.routes.indexOf(target) === -1) target = '/' + page;
          var url = site.base.replace(/\\/$/, '') + target;
          if (url === path) return;
          document.documentElement.setAttribute('data-kk-redirecting', '');
          location.replace(url + location.search + location.hash);
        } catch (e) {}
      })();
    </script>
    <style>
      [data-kk-redirecting] body { visibility: hidden; }
    </style>`;
}

/** The template without the app bundle: 404.html is a static page and must not boot the app. */
function withoutAppScripts(template: string): string {
  let removed = 0;
  const stripped = template
    .replace(/[ \t]*<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>\r?\n?/g, () => {
      removed += 1;
      return '';
    })
    .replace(/[ \t]*<link\b[^>]*\brel="modulepreload"[^>]*>\r?\n?/g, '');
  if (removed === 0) {
    throw new Error('dist/index.html has no <script type="module"> tag: the 404 page cannot be derived from it.');
  }
  return stripped;
}

/**
 * In the deploy workflow, PAGES_BASE_PATH is the path GitHub Pages will really serve the site
 * under ("/kishan-kahodariya", or "" for a custom domain). If the build was configured with a
 * different base, every asset URL in it would be wrong — stop before publishing that.
 */
function assertBaseMatchesHost(base: string): void {
  const reported = process.env.PAGES_BASE_PATH;
  if (reported === undefined) return;
  const expected = `/${reported.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
  if (expected !== base) {
    throw new Error(
      `The site is built for "${base}" but GitHub Pages serves this repository under "${expected}". ` +
        'Set BASE_PATH in src/lib/site-config.ts to the Pages path (it changes when the repository is renamed ' +
        'or a custom domain is added).',
    );
  }
}

/** robots.txt paths are relative to the host, so under a base path they need the base. */
function robotsWithBase(robots: string, base: string): string {
  if (base === '/') return robots;
  return robots.replace(/^(\s*(?:Allow|Disallow)\s*:\s*)\/(\S*)/gim, (line, directive: string, rest: string) =>
    `/${rest}`.startsWith(base) ? line : `${directive}${base}${rest}`,
  );
}

async function main(): Promise<void> {
  const templateFile = path.join(DIST, 'index.html');
  if (!(await exists(templateFile))) {
    throw new Error(`${DIST_DIR}/index.html not found. Run the client build first (vite build).`);
  }
  const template = await readFile(templateFile, 'utf8');
  if (!HEAD_BLOCK.test(template) || !template.includes(APP_MARKER)) {
    throw new Error(
      `${DIST_DIR}/index.html does not contain the <!--kk:head--> and ${APP_MARKER} markers. ` +
        'It must come straight from the client build: run `vite build` again before prerendering.',
    );
  }

  try {
    const result = await build({
      root: ROOT,
      logLevel: 'warn',
      build: { ssr: SERVER_ENTRY, outDir: SERVER_DIR, emptyOutDir: true, copyPublicDir: false },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const entryChunk = outputs
      .flatMap((output) => ('output' in output ? output.output : []))
      .find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
    if (!entryChunk) throw new Error('The server build produced no entry chunk.');

    const server = (await import(pathToFileURL(path.join(SERVER_DIR, entryChunk.fileName)).href)) as typeof ServerEntry;
    const manifest = server.getManifest();
    if (manifest.routes.length === 0) throw new Error('getAllRoutes() returned no routes.');
    assertBaseMatchesHost(manifest.base);

    const written = new Map<string, string>(); // lower-cased file → what wrote it
    const report: Array<{ what: string; files: string[] }> = [];
    const failures: string[] = [];

    const emit = async (what: string, files: string[], contents: string): Promise<void> => {
      for (const file of files) {
        const key = file.toLowerCase();
        const owner = written.get(key);
        if (owner !== undefined) throw new Error(`${what} and ${owner} would both be written to ${DIST_DIR}/${file}.`);
        const target = path.join(DIST, file);
        if (file !== 'index.html' && (await exists(target))) {
          throw new Error(`${what} would overwrite ${DIST_DIR}/${file}, which the client build or public/ already provides.`);
        }
        written.set(key, what);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, contents, 'utf8');
      }
      report.push({ what, files });
    };

    for (const route of manifest.routes) {
      try {
        assertRouteShape(route);
        const page = renderChecked(() => server.render(route));
        await emit(`route ${route}`, filesForRoute(route), fillTemplate(template, page));
      } catch (error) {
        failures.push(`${route}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${manifest.routes.length} routes failed to prerender:\n\n${failures.join('\n\n')}`);
    }

    for (const redirect of manifest.redirects) {
      assertRouteShape(redirect.from);
      await emit(`redirect ${redirect.from} → ${redirect.toHref}`, filesForRoute(redirect.from), redirectPage(redirect));
    }

    const notFound = renderChecked(() => server.renderNotFound());
    await emit(
      'not-found page',
      ['404.html'],
      fillTemplate(withoutAppScripts(template), {
        html: notFound.html,
        head: `${notFound.head}\n    ${notFoundScript(manifest)}`,
      }),
    );

    // Tells GitHub Pages not to run Jekyll (which would drop files that start with "_").
    await writeFile(path.join(DIST, '.nojekyll'), '', 'utf8');

    const robotsFile = path.join(DIST, 'robots.txt');
    if (await exists(robotsFile)) {
      await writeFile(robotsFile, robotsWithBase(await readFile(robotsFile, 'utf8'), manifest.base), 'utf8');
    }

    console.log(`\nPrerendered ${manifest.routes.length} routes under ${manifest.base} into ${DIST_DIR}/`);
    for (const { what, files } of report) console.log(`  ${what.padEnd(34)} ${files.join('  +  ')}`);
    console.log('  also: .nojekyll, robots.txt (paths prefixed with the base)\n');
  } finally {
    await rm(SERVER_DIR, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(`\nPrerender failed.\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
