import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { formatIssues, loadContent, publishedOnly } from './load-content';

/** Module id the app imports. Typed in src/content/virtual-content.d.ts. */
export const VIRTUAL_CONTENT_ID = 'virtual:content';
const RESOLVED_CONTENT_ID = `\0${VIRTUAL_CONTENT_ID}`;

export interface ContentPluginOptions {
  /**
   * Folder that holds the content files. Relative paths are resolved from the Vite root.
   * Default: "content". Only the tests point this somewhere else.
   */
  contentDir?: string;
  /** Build month "YYYY-MM" to embed. Default: the current month (UTC). Only tests set it. */
  buildMonth?: string;
}

/** "YYYY-MM" of a date, in UTC so every machine and the prerender agree. */
export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * CONTRACT (architect): Vite plugin that exposes the /content folder to the app as the
 * virtual module "virtual:content" — read from disk at dev/build time, validated with the
 * zod schema, with unpublished items removed so they never reach the client bundle.
 *
 * - Dev: the module is rebuilt and the page reloads whenever a file under /content is
 *   added, changed or removed. Invalid content shows the list of problems in the error
 *   overlay instead of a broken page.
 * - Build (client and SSR): invalid content fails the build with the same list, even when
 *   no module imports the content.
 * - The generated module is plain data. zod runs here, in Node, and is never imported by
 *   the module, so it stays out of the client bundle.
 */
export function contentPlugin(options: ContentPluginOptions = {}): Plugin {
  let contentDir = '';
  let contentLabel = 'content';
  let isBuild = false;

  /** Reads and validates /content; throws one readable error listing every problem. */
  function readValidContent() {
    const result = loadContent(contentDir);
    if (!result.ok) {
      throw new Error(`[content] ${formatIssues(result.issues, contentLabel)}`);
    }
    return result;
  }

  function isContentFile(file: string): boolean {
    const normalized = normalizePath(file);
    return normalized === contentDir || normalized.startsWith(`${contentDir}/`);
  }

  return {
    name: 'kk-content',

    configResolved(config) {
      contentDir = normalizePath(path.resolve(config.root, options.contentDir ?? 'content'));
      const relative = normalizePath(path.relative(config.root, contentDir));
      contentLabel = relative === '' || relative.startsWith('..') || path.isAbsolute(relative) ? contentDir : relative;
      isBuild = config.command === 'build';
    },

    buildStart() {
      // A production build must never ship with invalid content, whether or not a module
      // imports it. In dev the server still starts; the error appears when the module loads.
      if (!isBuild) return;
      try {
        readValidContent();
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
    },

    resolveId(id) {
      return id === VIRTUAL_CONTENT_ID ? RESOLVED_CONTENT_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_CONTENT_ID) return undefined;
      let result: ReturnType<typeof readValidContent>;
      try {
        result = readValidContent();
      } catch (error) {
        return this.error(error instanceof Error ? error.message : String(error));
      }
      const buildMonth = options.buildMonth ?? monthOf(new Date());
      // Lets `vite build --watch` rebuild when a content file changes.
      for (const file of result.absolutePaths) this.addWatchFile(file);
      return `export default ${JSON.stringify({ ...publishedOnly(result.content), buildMonth })};\n`;
    },

    configureServer(server) {
      // /content is inside the project root and already watched; this covers a custom folder.
      server.watcher.add(contentDir);
    },

    hotUpdate({ file, timestamp }) {
      if (!isContentFile(file)) return undefined;
      // A content file was added, changed or removed: drop the cached module (and, through
      // it, everything that imports it) and reload the page so no stale content is shown.
      const { moduleGraph, hot } = this.environment;
      const contentModule = moduleGraph.getModuleById(RESOLVED_CONTENT_ID);
      if (contentModule) moduleGraph.invalidateModule(contentModule, new Set(), timestamp, true);
      hot.send({ type: 'full-reload', path: '*' });
      return [];
    },
  };
}
