/**
 * Drives the REAL dashboard (Sveltia CMS, the pinned release, this repo's config.yml) in the
 * browser without a GitHub token.
 *
 * How: Sveltia's "Work with Local Repository" mode reads and writes a folder the user picks
 * (File System Access API). A test cannot click through the operating system's folder
 * picker, so `showDirectoryPicker` is replaced by a function that returns a folder in the
 * browser's own private file system (OPFS), filled beforehand with a copy of /content.
 * Everything after that — parsing the files, the forms, validation, the save, the bytes
 * written — is Sveltia's real code. Nothing on disk is touched and nothing goes to GitHub.
 *
 * What this cannot cover is the GitHub side: signing in with a token, the commit, the
 * deploy. Those are on the owner's first sign-in checklist (docs/admin-guide.md).
 */
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { pinnedScript } from './env';

/** The admin page, relative to the Playwright baseURL (which ends with the base path). */
export const ADMIN_PATH = 'admin/';

/** What the sign-in screen says when Sveltia rejects the configuration. */
export const CONFIG_ERROR = /error in the CMS configuration/i;

/** Label of the token sign-in button in Sveltia CMS 0.230.0. */
export const TOKEN_BUTTON = /Sign In Using Access Token/i;
export const LOCAL_BUTTON = /Work with Local Repository/i;

// ---------------------------------------------------------------------------------------
// Is the CDN reachable? (the dashboard is one script loaded from unpkg.com)
// ---------------------------------------------------------------------------------------

export interface CdnStatus {
  ok: boolean;
  reason: string;
}

let probe: Promise<CdnStatus> | undefined;

/** Asks unpkg.com for the pinned script once per worker. */
export function cdnStatus(request: APIRequestContext): Promise<CdnStatus> {
  probe ??= (async (): Promise<CdnStatus> => {
    const { src } = pinnedScript();
    try {
      const response = await request.fetch(src, { method: 'HEAD', timeout: 20_000, maxRedirects: 0 });
      return response.ok() ? { ok: true, reason: '' } : { ok: false, reason: `${src} answered ${response.status()}` };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error) };
    }
  })();
  return probe;
}

export function cdnSkipMessage(status: CdnStatus): string {
  return (
    'NOT VERIFIED — the pinned Sveltia CMS script could not be fetched from unpkg.com ' +
    `(${status.reason}). The dashboard cannot start without it, so this check did not run on this machine.`
  );
}

// ---------------------------------------------------------------------------------------
// The browser-private copy of the repository
// ---------------------------------------------------------------------------------------

const REPO_FOLDER = 'kk-repo';

const PICKER_STUB = `
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(${JSON.stringify(REPO_FOLDER)});
  };
`;

export interface RepoFile {
  size: number;
  /** Text of the file (JSON and other text files); '' for binary files. */
  text: string;
  /** First 40 bytes as hex, for recognising binary formats. */
  head: string;
}

async function seed(page: Page, files: Readonly<Record<string, string>>): Promise<void> {
  await page.evaluate(
    async ({ folder, tree }) => {
      const root = await navigator.storage.getDirectory();
      try {
        await root.removeEntry(folder, { recursive: true });
      } catch {
        // first use: nothing to remove
      }
      const repo = await root.getDirectoryHandle(folder, { create: true });
      // Sveltia checks that the picked folder is a repository root.
      await repo.getDirectoryHandle('.git', { create: true });
      for (const [relative, text] of Object.entries(tree)) {
        const parts = relative.split('/');
        const name = parts.pop() ?? '';
        let dir = repo;
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      }
    },
    { folder: REPO_FOLDER, tree: files },
  );
}

async function readAll(page: Page): Promise<Record<string, RepoFile>> {
  return page.evaluate(async (folder) => {
    const root = await navigator.storage.getDirectory();
    const repo = await root.getDirectoryHandle(folder);
    const out: Record<string, { size: number; text: string; head: string }> = {};
    const walk = async (dir: FileSystemDirectoryHandle, relative: string): Promise<void> => {
      // entries() is typed in some versions of TypeScript's DOM library and not in others.
      const entries = (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
      for await (const [name, handle] of entries) {
        const rel = relative === '' ? name : `${relative}/${name}`;
        if (handle.kind === 'directory') {
          await walk(handle as FileSystemDirectoryHandle, rel);
          continue;
        }
        const file = await (handle as FileSystemFileHandle).getFile();
        const head = Array.from(new Uint8Array(await file.slice(0, 40).arrayBuffer()), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const isText = /\.(?:json|ya?ml|md|txt|svg|html?|css|js)$/i.test(name);
        out[rel] = { size: file.size, text: isText ? await file.text() : '', head };
      }
    };
    await walk(repo, '');
    return out;
  }, REPO_FOLDER);
}

// ---------------------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------------------

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface StartOptions {
  /** Do not load slug-guard.js (to show what the guard prevents). */
  withoutSlugGuard?: boolean;
  /** Serve this text instead of the real config.yml. */
  config?: string;
}

export class Dashboard {
  /** Console output of the page: Sveltia reports config warnings there. */
  readonly logs: string[] = [];

  private constructor(readonly page: Page) {
    page.on('console', (message) => this.logs.push(`[${message.type()}] ${message.text()}`));
    page.on('pageerror', (error) => this.logs.push(`[pageerror] ${error.message}`));
  }

  /** Opens the dashboard on a private copy of `files` and enters through the local workflow. */
  static async start(page: Page, files: Readonly<Record<string, string>>, options: StartOptions = {}): Promise<Dashboard> {
    const dashboard = new Dashboard(page);
    await page.addInitScript(PICKER_STUB);
    if (options.withoutSlugGuard) await page.route('**/admin/slug-guard.js', (route) => route.abort());
    if (options.config !== undefined) {
      const body = options.config;
      // Sveltia asks for config.yml?_=<time>, hence the trailing wildcard.
      await page.route('**/admin/config.yml*', (route) => route.fulfill({ status: 200, contentType: 'text/yaml; charset=utf-8', body }));
    }
    await page.goto(ADMIN_PATH);
    await seed(page, files);
    const enter = page.getByRole('button', { name: LOCAL_BUTTON });
    await expect(enter, 'the sign-in screen offers the local workflow on a dev host').toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(CONFIG_ERROR)).toHaveCount(0);
    await enter.click();
    await expect(page.getByRole('tree', { name: 'Collection List' })).toBeVisible({ timeout: 30_000 });
    return dashboard;
  }

  get editor(): Locator {
    return this.page.getByRole('group', { name: 'Content Editor' });
  }

  /** The preview pane's document (the custom preview is drawn inside an iframe). */
  get preview(): ReturnType<Page['frameLocator']> {
    return this.page.getByRole('group', { name: 'Preview Content' }).frameLocator('iframe');
  }

  /** A field of the open form by its label ("Published", "Card hover text"…). */
  field(label: string): Locator {
    // Sveltia names the group “<label>” Field, with invisible direction marks around the label.
    return this.editor.getByRole('group', { name: new RegExp(`^“[\\u2066-\\u2069]?${escapeRegExp(label)}[\\u2066-\\u2069]?” Field$`) }).first();
  }

  private async goToHash(hash: string): Promise<void> {
    await this.page.evaluate((target) => {
      window.location.hash = target;
    }, hash);
  }

  /** Shows the list of a collection ("projects", "pages"…). */
  async openCollection(collection: string): Promise<void> {
    await this.goToHash(`#/collections/${collection}`);
    await expect(this.page.getByRole('main')).toBeVisible();
    await expect(this.editor).toHaveCount(0);
  }

  /**
   * Opens an entry: a slug of a folder collection, a file of "pages", or "site" of
   * "_singletons". Goes through a list first: Sveltia 0.230 shows an empty editor when the
   * address changes straight from one file-collection entry to another.
   */
  async openEntry(collection: string, entry: string): Promise<void> {
    await this.openCollection(collection === '_singletons' ? 'pages' : collection);
    await this.goToHash(`#/collections/${collection}/entries/${entry}`);
    await expect(this.editor).toBeVisible();
    await expect(this.editor.getByRole('group', { name: /\bField$/ }).first()).toBeVisible();
  }

  /** Opens an empty form for a new entry of a folder collection. */
  async newEntry(collection: string): Promise<void> {
    await this.openCollection(collection);
    await this.page.getByRole('button', { name: 'Create New Entry' }).click();
    await expect(this.editor).toBeVisible();
    await expect(this.editor.getByRole('group', { name: /\bField$/ }).first()).toBeVisible();
  }

  /**
   * Sveltia draws the fields of a long form as they scroll into view. This scrolls the form
   * down, one screen at a time, until the wanted control exists, then brings it into view.
   */
  async reveal(target: Locator): Promise<Locator> {
    const rendered = this.editor.getByRole('group', { name: 'Edit Content' }).getByRole('group', { name: /” Field$/ });
    for (let attempt = 0; attempt < 60 && (await target.count()) === 0; attempt += 1) {
      await rendered.last().scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(100);
    }
    await expect(target.first(), 'the field is in the form').toBeAttached();
    await target.first().scrollIntoViewIfNeeded();
    return target.first();
  }

  /** A field of the open form, scrolled into view. */
  async shown(label: string): Promise<Locator> {
    return this.reveal(this.field(label));
  }

  async textbox(label: string): Promise<Locator> {
    return this.reveal(this.editor.getByRole('textbox', { name: label, exact: true }));
  }

  async toggle(label: string): Promise<Locator> {
    return this.reveal(this.editor.getByRole('switch', { name: label, exact: true }));
  }

  /** A radio button of a choice field, by the field's label and the option's text. */
  async choice(fieldLabel: string, option: string): Promise<Locator> {
    return (await this.shown(fieldLabel)).getByRole('radio', { name: option, exact: true });
  }

  async fill(label: string, value: string): Promise<void> {
    await (await this.textbox(label)).fill(value);
  }

  async flip(label: string): Promise<void> {
    await (await this.toggle(label)).click();
  }

  async choose(fieldLabel: string, option: string): Promise<void> {
    await (await this.choice(fieldLabel, option)).check();
  }

  private get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  /** Saves and expects the editor to close (Sveltia returns to the list after a save). */
  async save(): Promise<void> {
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
    await expect(this.editor, 'the editor closes after a successful save').toHaveCount(0, { timeout: 20_000 });
  }

  /** Presses Save expecting the form to refuse; returns the messages it shows. */
  async saveExpectingErrors(): Promise<string[]> {
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
    const alerts = this.editor.getByRole('alert');
    await expect(alerts.first(), 'the form shows a validation message').toBeVisible();
    await expect(this.editor).toBeVisible();
    return (await alerts.allInnerTexts()).map((text) => text.replace(/^error\s*/i, '').trim());
  }

  /** Every file of the private repository copy. */
  async files(): Promise<Record<string, RepoFile>> {
    return readAll(this.page);
  }

  /** Text of one file, or undefined when it does not exist. */
  async file(repoPath: string): Promise<string | undefined> {
    return (await this.files())[repoPath]?.text;
  }

  /** Text files under content/ as { path: text } — the shape the content validator takes. */
  async contentFiles(): Promise<Record<string, string>> {
    const all = await this.files();
    return Object.fromEntries(
      Object.entries(all)
        .filter(([name]) => name.startsWith('content/'))
        .map(([name, file]) => [name, file.text]),
    );
  }

  /** Console lines in which Sveltia complains about the configuration. */
  configComplaints(): string[] {
    return this.logs.filter(
      (line) => /^\[(?:warning|error|pageerror)\]/.test(line) && /config|collection|field|option|schema/i.test(line) && !/sandbox/i.test(line),
    );
  }
}

/** Width and height stored in a WebP file's header (hex of its first 40 bytes). */
export function webpSize(headHex: string): { width: number; height: number } | undefined {
  const bytes = Uint8Array.from(headHex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  const ascii = (from: number, to: number): string => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return undefined;
  const at = (index: number): number => bytes[index] ?? 0;
  switch (ascii(12, 16)) {
    case 'VP8X':
      return { width: 1 + at(24) + (at(25) << 8) + (at(26) << 16), height: 1 + at(27) + (at(28) << 8) + (at(29) << 16) };
    case 'VP8 ':
      return { width: (at(26) | (at(27) << 8)) & 0x3fff, height: (at(28) | (at(29) << 8)) & 0x3fff };
    case 'VP8L': {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    default:
      return undefined;
  }
}
