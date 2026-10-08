/**
 * The REAL dashboard — Sveltia CMS at the pinned version with this repo's config.yml —
 * reading and writing a private copy of /content in the browser (see support/dashboard.ts for
 * how that works without a token).
 *
 * What is proven here, with Sveltia's own code doing the reading, validating and writing:
 *   - it accepts the config and lists every content file;
 *   - saving EVERY existing file changes only what was changed, byte for byte, and saving it
 *     back restores the file — and both results equal the model used by roundtrip.spec.ts;
 *   - a new item of every kind, with only the required fields filled, is written complete,
 *     as a draft, under <short name>.json, and the whole folder passes `validate:content`;
 *   - the slug guard keeps "slug" equal to the file name (and what happens without it);
 *   - the form refuses what the content check would refuse;
 *   - a tab added in Site settings can be chosen for a project straight away;
 *   - an uploaded picture is stored as a small WebP under /uploads with a clean name.
 *
 * What is NOT proven here: anything on GitHub's side (token sign-in, the commit, the deploy).
 *
 * Desktop project only; skipped with a clear message when unpkg.com cannot be reached.
 */
import zlib from 'node:zlib';
import { expect, test } from '@playwright/test';
import { loadContent, publishedOnly } from '../../scripts/lib/load-content';
import type { ContentBundle } from '../../src/content/bundle';
import { COLLECTION_FOLDERS } from '../../src/content/schema';
import { createContentApi } from '../../src/content/selectors';
import {
  configTargets,
  isDict,
  newEntry,
  optionLabels,
  optionValues,
  requiredInputs,
  serialise,
  targetFor,
  writeEntry,
  type Dict,
} from './support/cms-model';
import { Dashboard, cdnSkipMessage, cdnStatus, webpSize } from './support/dashboard';
import { contentDir, contentTree, makeTempDir, removeTempDirs, validateContent, writeTree } from './support/env';

test.afterAll(removeTempDirs);

/** The real content as the site reads it (unpublished items included). */
function loadedContent(): ContentBundle {
  const loaded = loadContent(contentDir);
  if (!loaded.ok) throw new Error('the content does not validate');
  return loaded.content;
}

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The dashboard is driven once, in the desktop project: these checks are about data, not layout.');
  const cdn = await cdnStatus(request);
  test.skip(!cdn.ok, cdnSkipMessage(cdn));
});

const targets = configTargets();
const tree = contentTree();

function parsed(repoPath: string, files: Readonly<Record<string, string>> = tree): Dict {
  const data: unknown = JSON.parse(files[repoPath] ?? 'null');
  if (!isDict(data)) throw new Error(`${repoPath} is not a JSON object`);
  return data;
}

const site = parsed('content/site.json');
const tabs = (site.categories as Array<{ id: string; label: string }>).map((tab) => ({ id: tab.id, label: tab.label }));

/** Runs the real content check on what the dashboard left in its private repository copy. */
async function contentCheck(dashboard: Dashboard, label: string): Promise<ReturnType<typeof validateContent>> {
  const dir = makeTempDir(label);
  const files = await dashboard.contentFiles();
  writeTree(dir, Object.fromEntries(Object.entries(files).map(([name, text]) => [name.slice('content/'.length), text])));
  return validateContent(dir);
}

// ---------------------------------------------------------------------------------------
// It starts
// ---------------------------------------------------------------------------------------

test('accepts the config and lists every content file', async ({ page }) => {
  const dashboard = await Dashboard.start(page, tree);
  const list = page.getByRole('tree', { name: 'Collection List' });
  for (const target of targets.filter((candidate) => candidate.type === 'folder')) {
    const count = Object.keys(tree).filter((name) => name.startsWith(`${target.path}/`)).length;
    await expect(list.getByRole('treeitem', { name: target.label, exact: true }), target.label).toContainText(String(count));
  }
  await expect(list.getByRole('treeitem', { name: 'Pages', exact: true })).toContainText('2');
  await expect(list.getByRole('treeitem', { name: 'Site settings', exact: true })).toBeVisible();
  expect(dashboard.logs.find((line) => /Parsed \d+ entries/.test(line))).toContain(`Parsed ${Object.keys(tree).length} entries (0 errors)`);
  expect(dashboard.configComplaints()).toEqual([]);
  // Nothing was written just by opening the dashboard.
  expect(await dashboard.contentFiles()).toEqual(tree);
});

// ---------------------------------------------------------------------------------------
// Round trip of every existing file
// ---------------------------------------------------------------------------------------

interface Group {
  title: string;
  collection: string;
  files: string[];
  entryName: (repoPath: string) => string;
  /** Makes one small change in the open form and returns the same change applied to the data. */
  change: (dashboard: Dashboard, data: Dict) => Promise<Dict>;
  /** Undoes it in the form. */
  undo: (dashboard: Dashboard, data: Dict) => Promise<void>;
}

const baseName = (repoPath: string): string => repoPath.split('/').pop()?.replace(/\.json$/, '') ?? '';

const groups: Group[] = [
  {
    title: 'Site settings',
    collection: '_singletons',
    files: ['content/site.json'],
    entryName: () => 'site',
    change: async (dashboard, data) => {
      await dashboard.fill('Logo letters', `${String(data.monogram)}X`);
      return { ...data, monogram: `${String(data.monogram)}X` };
    },
    undo: async (dashboard, data) => dashboard.fill('Logo letters', String(data.monogram)),
  },
  {
    title: 'Pages',
    collection: 'pages',
    files: ['content/tracks/game.json', 'content/tracks/softdev.json'],
    entryName: baseName,
    change: async (dashboard, data) => {
      await dashboard.flip('Show certificates before education');
      return { ...data, certificatesFirst: !data.certificatesFirst };
    },
    undo: async (dashboard) => dashboard.flip('Show certificates before education'),
  },
  ...COLLECTION_FOLDERS.map(
    (folder): Group => ({
      title: folder,
      collection: folder,
      files: Object.keys(tree)
        .filter((name) => name.startsWith(`content/${folder}/`))
        .sort(),
      entryName: baseName,
      change: async (dashboard, data) => {
        await dashboard.flip('Published');
        return { ...data, published: !data.published };
      },
      undo: async (dashboard) => dashboard.flip('Published'),
    }),
  ),
];

test.describe('saving every existing file through the real dashboard', () => {
  for (const group of groups) {
    test(`${group.title}: ${group.files.length} file(s) — one change is one changed line, and saving it back restores the file`, async ({ page }) => {
      test.setTimeout(60_000 + group.files.length * 30_000);
      const dashboard = await Dashboard.start(page, tree);
      const expectedTree: Record<string, string> = { ...tree };

      for (const repoPath of group.files) {
        const fields = targetFor(targets, repoPath).fields;
        const original = parsed(repoPath);
        const restored = serialise(writeEntry(fields, original));

        // 1. one small change
        await dashboard.openEntry(group.collection, group.entryName(repoPath));
        const changed = await group.change(dashboard, original);
        await dashboard.save();
        const afterChange = serialise(writeEntry(fields, changed));
        await expect.poll(() => dashboard.file(repoPath), `${repoPath} after one change`).toBe(afterChange);

        // 2. the same change undone
        await dashboard.openEntry(group.collection, group.entryName(repoPath));
        await group.undo(dashboard, original);
        await dashboard.save();
        await expect.poll(() => dashboard.file(repoPath), `${repoPath} saved back`).toBe(restored);

        // The restored file is the original, except for spaces around a text that Sveltia trims.
        const restoredData: unknown = JSON.parse(restored);
        expect(Object.keys(restoredData as Dict), `${repoPath}: same keys in the same order`).toEqual(Object.keys(original));
        if (JSON.stringify(restoredData) === JSON.stringify(original)) expect(restored, `${repoPath}: byte-identical`).toBe(tree[repoPath]);
        expectedTree[repoPath] = restored;
      }

      // No other file was touched, none was added or removed.
      expect(await dashboard.contentFiles()).toEqual(expectedTree);
      expect(dashboard.configComplaints()).toEqual([]);
      const check = await contentCheck(dashboard, `roundtrip-${group.collection}`);
      expect(check.status, check.output).toBe(0);
    });
  }
});

// ---------------------------------------------------------------------------------------
// New items
// ---------------------------------------------------------------------------------------

test.describe('a new item with only the required fields filled', () => {
  test('one of each kind: written complete, as a draft, under its short name — and the content check passes', async ({ page }) => {
    test.setTimeout(240_000);
    const dashboard = await Dashboard.start(page, tree);
    const expectedTree: Record<string, string> = { ...tree };

    for (const folder of COLLECTION_FOLDERS) {
      const target = targetFor(targets, `content/${folder}/x.json`);
      const slug = `brand-new-${folder}`;
      const values: Record<string, unknown> = {};

      await dashboard.newEntry(folder);
      // Nothing typed yet: the form refuses to save and names what is missing.
      const messages = await dashboard.saveExpectingErrors();
      expect(messages.length, `${folder}: required fields are flagged`).toBeGreaterThan(0);
      expect(messages.every((message) => message === 'This field is required.'), messages.join(' | ')).toBe(true);

      for (const input of requiredInputs(target.fields)) {
        const label = String(input.field.raw.label);
        if (input.kind === 'text') {
          const value = input.field.name === 'slug' ? slug : `Brand New ${folder}`;
          await dashboard.fill(label, value);
          values[input.field.name] = value;
        } else if (input.kind === 'choice') {
          await dashboard.choose(label, optionLabels(input.field)[0] ?? '');
          values[input.field.name] = optionValues(input.field)[0];
        } else {
          await dashboard.choose(label, tabs[0]?.label ?? '');
          values[input.field.name] = tabs[0]?.id;
        }
      }
      await dashboard.save();

      const repoPath = `content/${folder}/${slug}.json`;
      const expected = serialise(newEntry(target.fields, values));
      await expect.poll(() => dashboard.file(repoPath), repoPath).toBe(expected);
      expect(parsed(repoPath, { [repoPath]: expected }).published, 'a new item is a draft').toBe(false);
      expectedTree[repoPath] = expected;
    }

    expect(await dashboard.contentFiles()).toEqual(expectedTree);
    const check = await contentCheck(dashboard, 'new-items');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout, 'every field of every new file was written: the reader filled in nothing').not.toContain('NOTE');
    expect(check.stdout, 'the new items are counted as drafts').toMatch(/links: \d+ \(\d+ published\)/);
  });
});

// ---------------------------------------------------------------------------------------
// The slug guard
// ---------------------------------------------------------------------------------------

test.describe('the short name and the file name stay equal', () => {
  const project = Object.keys(tree).find((name) => name.startsWith('content/projects/')) ?? '';
  const slug = baseName(project);

  async function fillNewProject(dashboard: Dashboard, shortName: string, title: string): Promise<void> {
    await dashboard.newEntry('projects');
    await dashboard.fill('Short name (file name)', shortName);
    await dashboard.fill('Title', title);
    await dashboard.choose('Tab', tabs[0]?.label ?? '');
    await dashboard.choose('Page', 'Game page');
    await dashboard.save();
  }

  test('editing the short name of an existing item changes nothing', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('projects', slug);
    await dashboard.fill('Short name (file name)', `${slug}-renamed`);
    await dashboard.fill('Title', 'A New Title');
    await dashboard.save();

    const expected = serialise(writeEntry(targetFor(targets, project).fields, { ...parsed(project), title: 'A New Title' }));
    await expect.poll(() => dashboard.file(project)).toBe(expected);
    const files = await dashboard.contentFiles();
    expect(Object.keys(files).sort(), 'no file was renamed or added').toEqual(Object.keys(tree).sort());
    expect((await contentCheck(dashboard, 'guard-edit')).status).toBe(0);
  });

  test('a new item whose short name is taken is saved under "<name>-1", with that name inside', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree);
    await fillNewProject(dashboard, slug, 'A Second One');
    const added = `content/projects/${slug}-1.json`;
    await expect.poll(async () => Object.keys(await dashboard.contentFiles()).includes(added)).toBe(true);
    const files = await dashboard.contentFiles();
    expect(parsed(added, files).slug).toBe(`${slug}-1`);
    expect(parsed(added, files).title).toBe('A Second One');
    expect(files[project], 'the existing item is untouched').toBe(tree[project]);
    const check = await contentCheck(dashboard, 'guard-collision');
    expect(check.status, check.output).toBe(0);
  });

  test('without the guard the same two actions would stop the next deploy (the content check catches both)', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree, { withoutSlugGuard: true });
    await dashboard.openEntry('projects', slug);
    await dashboard.fill('Short name (file name)', `${slug}-renamed`);
    await dashboard.save();
    await expect.poll(async () => parsed(project, await dashboard.contentFiles()).slug).toBe(`${slug}-renamed`);

    await fillNewProject(dashboard, 'second-one', 'Second One');
    await fillNewProject(dashboard, 'second-one', 'Second One Again');
    await expect.poll(async () => Object.keys(await dashboard.contentFiles()).includes('content/projects/second-one-1.json')).toBe(true);

    const check = await contentCheck(dashboard, 'no-guard');
    expect(check.status, 'the deploy would be blocked, the live site untouched').toBe(1);
    expect(check.stderr).toContain(`must be "${slug}" to match the file name (it is "${slug}-renamed")`);
    expect(check.stderr).toContain('must be "second-one-1" to match the file name (it is "second-one")');
  });
});

// ---------------------------------------------------------------------------------------
// The form refuses what the content check would refuse
// ---------------------------------------------------------------------------------------

test.describe('the form stops bad values before they are saved', () => {
  const project = Object.keys(tree).find((name) => name.startsWith('content/projects/')) ?? '';

  const refusals: Array<{ name: string; label: string; value: string; message: RegExp }> = [
    { name: 'a hover text of five words', label: 'Card hover text', value: 'one two three four five', message: /at most 4 words/ },
    { name: 'a video address without https://', label: 'Gameplay / demo video (YouTube)', value: 'youtube.com/watch?v=abc', message: /starting with https:\/\// },
    { name: 'an empty title', label: 'Title', value: '', message: /This field is required/ },
  ];

  for (const refusal of refusals) {
    test(refusal.name, async ({ page }) => {
      const dashboard = await Dashboard.start(page, tree);
      await dashboard.openEntry('projects', baseName(project));
      await dashboard.fill(refusal.label, refusal.value);
      const messages = await dashboard.saveExpectingErrors();
      expect(messages.join(' | ')).toMatch(refusal.message);
      expect(await dashboard.file(project), 'nothing was written').toBe(tree[project]);
    });
  }

  test('four words, a full video address and a mailto link are accepted', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('projects', baseName(project));
    await dashboard.fill('Card hover text', '  Watch The Full Demo  ');
    await dashboard.fill('Gameplay / demo video (YouTube)', 'https://www.youtube.com/watch?v=abc123');
    await dashboard.save();
    const expected = serialise(
      writeEntry(targetFor(targets, project).fields, { ...parsed(project), hoverText: 'Watch The Full Demo', videoUrl: 'https://www.youtube.com/watch?v=abc123' }),
    );
    await expect.poll(() => dashboard.file(project)).toBe(expected);

    const link = Object.keys(tree).find((name) => name.startsWith('content/links/')) ?? '';
    await dashboard.openEntry('links', baseName(link));
    await dashboard.fill('Address', 'mailto:someone@example.com');
    await dashboard.save();
    await expect.poll(async () => parsed(link, await dashboard.contentFiles()).url).toBe('mailto:someone@example.com');
    expect((await contentCheck(dashboard, 'accepted')).status).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// Tabs are driven by Site settings
// ---------------------------------------------------------------------------------------

test('a tab added in Site settings can be chosen for a project, and the result passes the content check', async ({ page }) => {
  test.setTimeout(120_000);
  const dashboard = await Dashboard.start(page, tree);
  const project = Object.keys(tree).find((name) => name.startsWith('content/projects/')) ?? '';

  // The choices of a project are exactly the tabs of Site settings.
  await dashboard.openEntry('projects', baseName(project));
  await expect((await dashboard.shown('Tab')).getByRole('radio')).toHaveCount(tabs.length);
  for (const tab of tabs) await expect(await dashboard.choice('Tab', tab.label)).toBeVisible();
  await expect(await dashboard.choice('Tab', tabs.find((tab) => tab.id === parsed(project).category)?.label ?? '')).toBeChecked();
  await page.getByRole('button', { name: 'Cancel Editing' }).click();

  // Add a tab.
  await dashboard.openEntry('_singletons', 'site');
  const tabsField = await dashboard.shown('Project tabs');
  await tabsField.getByRole('button', { name: /Add.*Project tab/ }).click();
  await tabsField.getByRole('textbox', { name: 'Tab ID (part of the page address)', exact: true }).last().fill('godot');
  await tabsField.getByRole('textbox', { name: 'Tab name', exact: true }).last().fill('Godot');
  await dashboard.save();
  await expect.poll(async () => (parsed('content/site.json', await dashboard.contentFiles()).categories as Dict[]).map((tab) => tab.id)).toEqual([
    ...tabs.map((tab) => tab.id),
    'godot',
  ]);
  const added = (parsed('content/site.json', await dashboard.contentFiles()).categories as Dict[]).at(-1);
  expect(added).toEqual({ id: 'godot', label: 'Godot', order: 0, hoverWithVideo: '', hoverWithoutVideo: '' });

  // Choose it for a project.
  await dashboard.openEntry('projects', baseName(project));
  await expect((await dashboard.shown('Tab')).getByRole('radio')).toHaveCount(tabs.length + 1);
  await dashboard.choose('Tab', 'Godot');
  await dashboard.save();
  await expect.poll(async () => parsed(project, await dashboard.contentFiles()).category).toBe('godot');

  const check = await contentCheck(dashboard, 'new-tab');
  expect(check.status, check.output).toBe(0);
  expect(check.stdout).toContain(`categories: ${tabs.length + 1}`);
});

// ---------------------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------------------

/** A real PNG of the given size (one colour), built by hand so no image library is needed. */
function png(width: number, height: number): Buffer {
  const table = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buffer) c = (table[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x66)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('an uploaded screenshot is stored as a scaled-down WebP under /uploads, with a clean file name', async ({ page }) => {
  test.setTimeout(120_000);
  const dashboard = await Dashboard.start(page, tree);
  const project = Object.keys(tree).find((name) => name.startsWith('content/projects/')) ?? '';
  const before = parsed(project);
  const shots = before.screenshots as Dict[];

  await dashboard.openEntry('projects', baseName(project));
  const field = await dashboard.shown('Screenshots');
  await field.getByRole('button', { name: /Add.*Screenshot/ }).click();
  await field.getByRole('button', { name: 'Browse' }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Image' });
  await expect(dialog).toBeVisible();
  // No stock-photo services in the picker.
  await expect(dialog.getByRole('option', { name: /Unsplash|Pexels|Pixabay|Picsum/ })).toHaveCount(0);

  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Upload' }).click();
  await (await chooser).setFiles({ name: 'My Shot 1 (final).PNG', mimeType: 'image/png', buffer: png(2400, 1200) });
  await expect(dialog.getByRole('option', { name: /my-shot-1-final/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await expect(dialog).toHaveCount(0);
  // The picked file is in the row once it can be renamed (only files not saved yet can be).
  await expect(field.getByRole('button', { name: 'Rename' })).toBeVisible();
  await field.getByRole('textbox', { name: 'Description of the image', exact: true }).last().fill('A grey test picture');
  await dashboard.save();

  await expect.poll(async () => (parsed(project, await dashboard.contentFiles()).screenshots as Dict[]).length).toBe(shots.length + 1);
  const after = parsed(project, await dashboard.contentFiles());
  expect(after.screenshots).toEqual([...shots, { src: '/uploads/my-shot-1-final.webp', alt: 'A grey test picture' }]);
  expect({ ...after, screenshots: shots }, 'nothing else in the item changed').toEqual(writeEntry(targetFor(targets, project).fields, before));

  const files = await dashboard.files();
  const uploads = Object.keys(files).filter((name) => !name.startsWith('content/'));
  expect(uploads).toEqual(['public/uploads/my-shot-1-final.webp']);
  const stored = files['public/uploads/my-shot-1-final.webp'];
  const size = webpSize(stored?.head ?? '');
  expect(size, 'the stored file is a WebP image').toBeDefined();
  expect(size?.width, 'scaled down to the configured maximum').toBeLessThanOrEqual(1920);
  expect(size?.width).toBeGreaterThan(1000);
  expect(Math.round(((size?.width ?? 0) / (size?.height ?? 1)) * 10) / 10, 'the proportions are kept').toBe(2);
  expect(stored?.size ?? 0).toBeLessThan(200_000);

  const check = await contentCheck(dashboard, 'upload');
  expect(check.status, check.output).toBe(0);
});

test.describe('a typed image address must be a real address', () => {
  const certificate = Object.keys(tree).find((name) => name.startsWith('content/certificates/')) ?? '';

  for (const [value, accepted] of [
    ['not a url', false],
    ['example.com/badge.png', false],
    ['https://example.com/badge.png', true],
  ] as const) {
    test(`${JSON.stringify(value)} is ${accepted ? 'accepted' : 'refused'}`, async ({ page }) => {
      test.skip(certificate === '', 'there is no certificate in the content');
      const dashboard = await Dashboard.start(page, tree);
      await dashboard.openEntry('certificates', baseName(certificate));
      const field = await dashboard.shown('Badge image');
      const replace = field.getByRole('button', { name: 'Replace Image' });
      if (await replace.count()) await replace.click();
      else await field.getByRole('button', { name: 'Browse' }).click();
      const dialog = page.getByRole('dialog', { name: 'Select Image' });
      await dialog.getByRole('option', { name: 'Enter URL' }).click();
      await dialog.getByRole('textbox').last().fill(value);
      await dialog.getByRole('button', { name: 'Insert' }).click();
      if (accepted) {
        await dashboard.save();
        await expect.poll(async () => parsed(certificate, await dashboard.contentFiles()).image).toBe(value);
      } else {
        const messages = await dashboard.saveExpectingErrors();
        expect(messages.join(' | ')).toMatch(/Upload or pick a picture, or write a full address/);
        expect(await dashboard.file(certificate), 'nothing was written').toBe(tree[certificate]);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------
// The logo, the footer order and the resume per tab
// ---------------------------------------------------------------------------------------

/** What the site itself reads from the dashboard's private repository copy. */
async function siteApi(dashboard: Dashboard, label: string): Promise<ReturnType<typeof createContentApi>> {
  const dir = makeTempDir(label);
  const files = await dashboard.contentFiles();
  writeTree(dir, Object.fromEntries(Object.entries(files).map(([name, text]) => [name.slice('content/'.length), text])));
  const loaded = loadContent(dir);
  if (!loaded.ok) throw new Error(`the saved content does not validate: ${JSON.stringify(loaded.issues)}`);
  return createContentApi(publishedOnly(loaded.content));
}

/** Number of lines that differ between two texts with the same number of lines (-1 when the counts differ). */
function changedLines(before: string, after: string): number {
  const [a, b] = [before.split('\n'), after.split('\n')];
  return a.length === b.length ? a.filter((line, index) => line !== b[index]).length : -1;
}

test.describe('a resume and a summary for one project tab', () => {
  const gamePath = 'content/tracks/game.json';
  const LIST = 'Resume and summary for a specific tab';
  const TAB = 'Tab this row is for';
  const LINK = 'Resume link for this tab';
  const TEXT = 'Button text for this tab';
  const SUMMARY = 'Summary on this tab';
  const [firstTab, secondTab] = tabs;

  /** The real content, with the game page holding one prepared row (a tab, no link yet). */
  function seeded(rows: Dict[] = [{ tab: firstTab?.id, url: '', label: '', summary: '' }]): { files: Record<string, string>; start: Dict } {
    const start = { ...parsed(gamePath), tabResumes: rows };
    return { files: { ...tree, [gamePath]: serialise(writeEntry(targetFor(targets, gamePath).fields, start)) }, start };
  }

  /** Opens the list on the game page with every row unfolded (one saved row opens folded). */
  async function openList(dashboard: Dashboard, rows: number): Promise<Awaited<ReturnType<Dashboard['shown']>>> {
    await dashboard.openEntry('pages', 'game');
    const list = await dashboard.shown(LIST);
    const unfold = list.getByRole('button', { name: 'Expand', exact: true });
    for (let attempt = 0; attempt < 10 && (await list.getByRole('textbox', { name: LINK, exact: true }).count()) < rows; attempt += 1) {
      if (await unfold.count()) await unfold.first().click();
      else await list.page().waitForTimeout(100);
    }
    await expect(list.getByRole('textbox', { name: LINK, exact: true })).toHaveCount(rows);
    return list;
  }

  test('pasting a link in the prepared row changes one line; a second row is written complete; the site uses both', async ({ page }) => {
    test.setTimeout(150_000);
    test.skip(!firstTab || !secondTab, 'the content has fewer than two project tabs');
    if (!firstTab || !secondTab) return;
    const { files, start } = seeded();
    const fields = targetFor(targets, gamePath).fields;
    const dashboard = await Dashboard.start(page, files);
    const track = parsed(gamePath);

    // The prepared row: the hint, the tab choices of Site settings, its tab selected, no link.
    const list = await openList(dashboard, 1);
    await expect(list).toContainText('Leave empty to use the main resume and the main summary on every tab.');
    const choice = list.getByRole('radiogroup', { name: TAB, exact: true });
    await expect(choice.getByRole('radio')).toHaveCount(tabs.length);
    for (const tab of tabs) await expect(choice.getByRole('radio', { name: tab.label, exact: true })).toBeVisible();
    await expect(choice.getByRole('radio', { name: firstTab.label, exact: true })).toBeChecked();
    await expect(list.getByRole('textbox', { name: LINK, exact: true })).toHaveValue('');

    // 1. Paste the link (with spaces around it, as a paste often has).
    await list.getByRole('textbox', { name: LINK, exact: true }).fill('  https://example.com/first-tab-resume  ');
    await dashboard.save();
    const withLink = { ...start, tabResumes: [{ tab: firstTab.id, url: 'https://example.com/first-tab-resume', label: '', summary: '' }] };
    const afterLink = serialise(writeEntry(fields, withLink));
    await expect.poll(() => dashboard.file(gamePath), 'after pasting the link').toBe(afterLink);
    expect(changedLines(files[gamePath] ?? '', afterLink), 'one line of the file changed').toBe(1);
    let api = await siteApi(dashboard, 'tab-resume-1');
    expect(api.getResume('game', firstTab.id)).toEqual({ url: 'https://example.com/first-tab-resume', label: track.resumeLabel });
    expect(api.getResume('game', secondTab.id)).toEqual({ url: track.resumeUrl, label: track.resumeLabel });

    // 2. Add a row for another tab, with a button text of its own.
    const again = await openList(dashboard, 1);
    await again.getByRole('button', { name: /Add.*Resume and summary for one tab/ }).click();
    await expect(again.getByRole('radiogroup', { name: TAB, exact: true })).toHaveCount(2);
    await again.getByRole('radiogroup', { name: TAB, exact: true }).last().getByRole('radio', { name: secondTab.label, exact: true }).check();
    await again.getByRole('textbox', { name: LINK, exact: true }).last().fill('https://example.com/second-tab-resume');
    await again.getByRole('textbox', { name: TEXT, exact: true }).last().fill('Second Tab Resume');
    await dashboard.save();
    const withRow = {
      ...withLink,
      tabResumes: [...withLink.tabResumes, { tab: secondTab.id, url: 'https://example.com/second-tab-resume', label: 'Second Tab Resume', summary: '' }],
    };
    const afterRow = serialise(writeEntry(fields, withRow));
    await expect.poll(() => dashboard.file(gamePath), 'after adding a row').toBe(afterRow);
    expect(Object.keys((parsed(gamePath, { [gamePath]: afterRow }).tabResumes as Dict[])[1] ?? {}), 'the new row has every key, in order').toEqual(['tab', 'url', 'label', 'summary']);

    // No other file was touched; the content check passes; the site answers with both.
    expect(await dashboard.contentFiles()).toEqual({ ...files, [gamePath]: afterRow });
    expect(dashboard.configComplaints()).toEqual([]);
    const check = await contentCheck(dashboard, 'tab-resume');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout, 'every key was written: the reader filled in nothing').not.toContain('NOTE');
    api = await siteApi(dashboard, 'tab-resume-2');
    expect(api.getResume('game', firstTab.id)).toEqual({ url: 'https://example.com/first-tab-resume', label: track.resumeLabel });
    expect(api.getResume('game', secondTab.id)).toEqual({ url: 'https://example.com/second-tab-resume', label: 'Second Tab Resume' });
    expect(api.getResume('game', 'all')).toEqual({ url: track.resumeUrl, label: track.resumeLabel });
    expect(api.getResume('softdev', firstTab.id).url, 'the other page keeps its own resume').toBe(parsed('content/tracks/softdev.json').resumeUrl);

    // 3. Removing a row gives the tab back to the main resume.
    const last = await openList(dashboard, 2);
    await last.getByRole('button', { name: 'Remove', exact: true }).first().click();
    await dashboard.save();
    const withoutFirst = serialise(writeEntry(fields, { ...withRow, tabResumes: [withRow.tabResumes[1]] }));
    await expect.poll(() => dashboard.file(gamePath), 'after removing the first row').toBe(withoutFirst);
    api = await siteApi(dashboard, 'tab-resume-3');
    expect(api.getResume('game', firstTab.id)).toEqual({ url: track.resumeUrl, label: track.resumeLabel });
  });

  test('typing a summary in the prepared row changes one line; a summary alone is used by the site; emptying it gives the tab the main summary back', async ({ page }) => {
    test.setTimeout(150_000);
    test.skip(!firstTab || !secondTab, 'the content has fewer than two project tabs');
    if (!firstTab || !secondTab) return;
    const { files, start } = seeded();
    const fields = targetFor(targets, gamePath).fields;
    const dashboard = await Dashboard.start(page, files);
    const track = parsed(gamePath);
    // Test-only text: it lives in the dashboard's private copy and never reaches /content.
    const OWN = 'Test-only summary, first paragraph.\n\nTest-only summary, second paragraph.';
    expect(String(track.summary).trim(), 'the game page has a main summary to fall back to').not.toBe('');

    // The prepared row: an empty multi-line box with its hint; the link is described as optional.
    const list = await openList(dashboard, 1);
    const box = await dashboard.reveal(list.getByRole('textbox', { name: SUMMARY, exact: true }));
    await expect(box).toHaveValue('');
    expect(await box.evaluate((element) => element.tagName), 'a multi-line box').toBe('TEXTAREA');
    await expect(list).toContainText('Leave empty to use the main summary above.');
    await expect(list).toContainText('Leave empty to use the main resume above.');

    // 1. Type two paragraphs (with spaces around them); the row has no resume link.
    await box.fill(`  ${OWN}  `);
    await dashboard.save();
    const withSummary = { ...start, tabResumes: [{ tab: firstTab.id, url: '', label: '', summary: OWN }] };
    const afterSummary = serialise(writeEntry(fields, withSummary));
    await expect.poll(() => dashboard.file(gamePath), 'after typing the summary').toBe(afterSummary);
    expect(changedLines(files[gamePath] ?? '', afterSummary), 'one line of the file changed').toBe(1);
    expect((parsed(gamePath, { [gamePath]: afterSummary }).tabResumes as Dict[])[0]).toEqual({ tab: firstTab.id, url: '', label: '', summary: OWN });
    expect(await dashboard.contentFiles()).toEqual({ ...files, [gamePath]: afterSummary });
    expect(dashboard.configComplaints()).toEqual([]);
    const check = await contentCheck(dashboard, 'tab-summary');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout, 'every key was written: the reader filled in nothing').not.toContain('NOTE');

    // The site: that tab shows the text, every other tab and the other page keep their own,
    // and the resume of the tab is still the main one.
    let api = await siteApi(dashboard, 'tab-summary-1');
    expect(api.getSummary('game', firstTab.id)).toBe(OWN);
    expect(api.getSummary('game', secondTab.id)).toBe(track.summary);
    expect(api.getSummary('game', 'all')).toBe(track.summary);
    expect(api.getSummary('softdev', firstTab.id), 'the other page keeps its own summary').toBe(parsed('content/tracks/softdev.json').summary);
    expect(api.getResume('game', firstTab.id)).toEqual({ url: track.resumeUrl, label: track.resumeLabel });
    expect(api.getTrack('game').summary, 'the main summary is untouched').toBe(track.summary);

    // 2. The saved text comes back in the form as it was saved; emptying it restores the file.
    const again = await openList(dashboard, 1);
    const boxAgain = await dashboard.reveal(again.getByRole('textbox', { name: SUMMARY, exact: true }));
    await expect(boxAgain).toHaveValue(OWN);
    await boxAgain.fill('');
    await dashboard.save();
    await expect.poll(() => dashboard.file(gamePath), 'after emptying the summary').toBe(files[gamePath]);
    api = await siteApi(dashboard, 'tab-summary-2');
    expect(api.getSummary('game', firstTab.id)).toBe(track.summary);
  });

  for (const value of ['drive.google.com/file/d/1', 'mailto:someone@example.com', '/uploads/resume.pdf']) {
    test(`the link of a row must be a web address: ${JSON.stringify(value)} is refused`, async ({ page }) => {
      const { files } = seeded();
      const dashboard = await Dashboard.start(page, files);
      const list = await openList(dashboard, 1);
      await list.getByRole('textbox', { name: LINK, exact: true }).fill(value);
      const messages = await dashboard.saveExpectingErrors();
      expect(messages.join(' | ')).toMatch(/Write a full address starting with https:\/\//);
      expect(await dashboard.file(gamePath), 'nothing was written').toBe(files[gamePath]);
    });
  }

  test('the form cannot stop two rows for one tab — the content check does, and names the row', async ({ page }) => {
    test.skip(!firstTab, 'the content has no project tab');
    if (!firstTab) return;
    const { files } = seeded();
    const dashboard = await Dashboard.start(page, files);
    const list = await openList(dashboard, 1);
    await list.getByRole('button', { name: /Add.*Resume and summary for one tab/ }).click();
    await expect(list.getByRole('radiogroup', { name: TAB, exact: true })).toHaveCount(2);
    await list.getByRole('radiogroup', { name: TAB, exact: true }).last().getByRole('radio', { name: firstTab.label, exact: true }).check();
    await dashboard.save();
    await expect.poll(async () => (parsed(gamePath, await dashboard.contentFiles()).tabResumes as Dict[]).map((row) => row.tab)).toEqual([firstTab.id, firstTab.id]);

    const check = await contentCheck(dashboard, 'tab-resume-twice');
    expect(check.status, 'the deploy would be blocked, the live site untouched').toBe(1);
    expect(check.stderr).toMatch(/tracks\/game\.json\s+field:\s+tabResumes\[1\]\.tab\s+problem:\s+"[^"]+" has more than one row/);
  });

  test('a page without rows saves an empty list, and a row can be added from nothing', async ({ page }) => {
    test.skip(!firstTab, 'the content has no project tab');
    if (!firstTab) return;
    const { files, start } = seeded([]);
    const fields = targetFor(targets, gamePath).fields;
    const dashboard = await Dashboard.start(page, files);
    const list = await openList(dashboard, 0);
    await list.getByRole('button', { name: /Add.*Resume and summary for one tab/ }).click();
    await expect(list.getByRole('radiogroup', { name: TAB, exact: true })).toHaveCount(1);
    // The tab is required: a row without one is not saved.
    const messages = await dashboard.saveExpectingErrors();
    expect(messages).toContain('This field is required.');
    await list.getByRole('radiogroup', { name: TAB, exact: true }).getByRole('radio', { name: firstTab.label, exact: true }).check();
    await dashboard.save();
    const expected = serialise(writeEntry(fields, { ...start, tabResumes: [{ tab: firstTab.id, url: '', label: '', summary: '' }] }));
    await expect.poll(() => dashboard.file(gamePath)).toBe(expected);
    expect((await contentCheck(dashboard, 'tab-resume-new')).status).toBe(0);
  });
});

test.describe('the footer order of a link', () => {
  test('changing "Footer order" changes one line, moves the link in the footer and leaves the top of the page alone', async ({ page }) => {
    test.setTimeout(120_000);
    const before = createContentApi(publishedOnly(loadedContent()));
    const footer = before.getLinks('game', 'footer');
    const hero = before.getLinks('game', 'hero');
    const moved = footer.at(-1);
    test.skip(footer.length < 2 || !moved, 'the game page has fewer than two footer links');
    if (footer.length < 2 || !moved) return;
    const repoPath = `content/links/${moved.slug}.json`;
    const first = Math.min(...footer.map((link) => link.orderFooter)) - 5;

    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('links', moved.slug);
    const box = await dashboard.reveal(dashboard.editor.getByRole('spinbutton', { name: 'Footer order', exact: true }));
    await expect(box).toHaveValue(String(moved.orderFooter));
    await expect(await dashboard.shown('Footer order')).toContainText('separate from the order at the top of the page');
    await box.fill(String(first));
    await dashboard.save();

    const expected = serialise(writeEntry(targetFor(targets, repoPath).fields, { ...parsed(repoPath), orderFooter: first }));
    await expect.poll(() => dashboard.file(repoPath)).toBe(expected);
    expect(changedLines(tree[repoPath] ?? '', expected), 'one line of the file changed').toBe(1);
    expect(parsed(repoPath, { [repoPath]: expected }).order, 'the position next to the name is untouched').toBe(parsed(repoPath).order);
    expect(await dashboard.contentFiles()).toEqual({ ...tree, [repoPath]: expected });

    const after = await siteApi(dashboard, 'footer-order');
    expect(after.getLinks('game', 'footer').map((link) => link.slug)).toEqual([moved.slug, ...footer.slice(0, -1).map((link) => link.slug)]);
    expect(after.getLinks('game', 'hero').map((link) => link.slug), 'the buttons next to the name keep their order').toEqual(hero.map((link) => link.slug));
    const check = await contentCheck(dashboard, 'footer-order');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout).not.toContain('NOTE');
  });

  test('a new link gets both positions written (0 and 0), so nothing is left for the reader to fill in', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.newEntry('links');
    await dashboard.fill('Short name (file name)', 'brand-new-link');
    await dashboard.fill('Link text', 'Brand New Link');
    await dashboard.save();
    const repoPath = 'content/links/brand-new-link.json';
    await expect.poll(async () => Object.keys(await dashboard.contentFiles()).includes(repoPath)).toBe(true);
    const link = parsed(repoPath, await dashboard.contentFiles());
    expect(link).toMatchObject({ order: 0, orderFooter: 0, published: false });
    expect(Object.keys(link)).toEqual(Object.keys(parsed(Object.keys(tree).find((name) => name.startsWith('content/links/')) ?? '')));
    const check = await contentCheck(dashboard, 'new-link');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout).not.toContain('NOTE');
  });
});

test.describe('files written before the logo, the footer order and the resume list existed', () => {
  test('a save writes the missing keys in their place: "" for the logo, [] for the list, 0 for the footer order', async ({ page }) => {
    test.setTimeout(150_000);
    const sitePath = 'content/site.json';
    const gamePath = 'content/tracks/game.json';
    const linkPath = Object.keys(tree).find((name) => name.startsWith('content/links/') && Number(parsed(name).order) !== 0) ?? '';
    test.skip(linkPath === '', 'no link has a position other than 0');

    const without = (repoPath: string, ...keys: string[]): Dict => Object.fromEntries(Object.entries(parsed(repoPath)).filter(([key]) => !keys.includes(key)));
    const old = {
      [sitePath]: without(sitePath, 'logo', 'logoAlt'),
      [gamePath]: without(gamePath, 'tabResumes'),
      [linkPath]: without(linkPath, 'orderFooter'),
    };
    const files = { ...tree, ...Object.fromEntries(Object.entries(old).map(([repoPath, data]) => [repoPath, serialise(data)])) };
    const dashboard = await Dashboard.start(page, files);
    // The old files load (0 errors) and the site reads them: the link keeps its place.
    expect(dashboard.logs.find((line) => /Parsed \d+ entries/.test(line))).toContain('(0 errors)');
    const before = await siteApi(dashboard, 'old-files-before');
    expect(before.getSite().logo).toBe('');
    expect(before.getTrack('game').tabResumes).toEqual([]);

    // One small change in each form, then save.
    await dashboard.openEntry('_singletons', 'site');
    await dashboard.fill('Logo letters', `${String(site.monogram)}X`);
    await dashboard.save();
    await dashboard.openEntry('pages', 'game');
    await dashboard.flip('Show certificates before education');
    await dashboard.save();
    await dashboard.openEntry('links', baseName(linkPath));
    await expect(await dashboard.reveal(dashboard.editor.getByRole('spinbutton', { name: 'Footer order', exact: true })), 'the form has no footer order to show').toHaveValue('0');
    await dashboard.flip('Published');
    await dashboard.save();

    const expected = {
      [sitePath]: serialise(writeEntry(targetFor(targets, sitePath).fields, { ...old[sitePath], monogram: `${String(site.monogram)}X` })),
      [gamePath]: serialise(writeEntry(targetFor(targets, gamePath).fields, { ...old[gamePath], certificatesFirst: !old[gamePath]?.certificatesFirst })),
      [linkPath]: serialise(writeEntry(targetFor(targets, linkPath).fields, { ...old[linkPath], published: !old[linkPath]?.published })),
    };
    await expect.poll(() => dashboard.contentFiles()).toEqual({ ...files, ...expected });

    // Every key is now in the file, where the real files have it.
    const after = await dashboard.contentFiles();
    expect(Object.keys(parsed(sitePath, after))).toEqual(Object.keys(parsed(sitePath)));
    expect(parsed(sitePath, after)).toMatchObject({ logo: '', logoAlt: '' });
    expect(Object.keys(parsed(gamePath, after))).toEqual(Object.keys(parsed(gamePath)));
    expect(parsed(gamePath, after).tabResumes).toEqual([]);
    expect(Object.keys(parsed(linkPath, after))).toEqual(Object.keys(parsed(linkPath)));
    // The form writes its default for a footer order it was never given. Every real link
    // file states its footer order (roundtrip.spec.ts), so this cannot move a real link.
    expect(parsed(linkPath, after).orderFooter).toBe(0);
    const check = await contentCheck(dashboard, 'old-files');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout, 'nothing is left for the reader to fill in').not.toContain('NOTE');
  });
});

test.describe('the site logo', () => {
  const sitePath = 'content/site.json';

  test('an uploaded logo is stored as a WebP under /uploads and saved with its description; removing it saves ""', async ({ page }) => {
    test.setTimeout(150_000);
    const fields = targetFor(targets, sitePath).fields;
    const dashboard = await Dashboard.start(page, tree);

    // 1. Upload a picture.
    await dashboard.openEntry('_singletons', 'site');
    const field = await dashboard.shown('Logo image');
    await expect(field).toContainText('logo letters instead');
    const replace = field.getByRole('button', { name: 'Replace Image' });
    if (await replace.count()) await replace.click();
    else await field.getByRole('button', { name: 'Browse' }).click();
    const dialog = page.getByRole('dialog', { name: 'Select Image' });
    await expect(dialog).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await (await chooser).setFiles({ name: 'My New Logo.PNG', mimeType: 'image/png', buffer: png(256, 256) });
    await expect(dialog.getByRole('option', { name: /my-new-logo/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Insert' }).click();
    await expect(dialog).toHaveCount(0);
    await dashboard.fill('Logo description', '  A new logo  ');
    await dashboard.save();

    const withLogo = serialise(writeEntry(fields, { ...site, logo: '/uploads/my-new-logo.webp', logoAlt: 'A new logo' }));
    await expect.poll(() => dashboard.file(sitePath), 'after the upload').toBe(withLogo);
    const all = await dashboard.files();
    expect(Object.keys(all).filter((name) => !name.startsWith('content/'))).toEqual(['public/uploads/my-new-logo.webp']);
    expect(webpSize(all['public/uploads/my-new-logo.webp']?.head ?? ''), 'the stored file is a WebP image').toEqual({ width: 256, height: 256 });
    expect(await dashboard.contentFiles()).toEqual({ ...tree, [sitePath]: withLogo });
    let check = await contentCheck(dashboard, 'logo-upload');
    expect(check.status, check.output).toBe(0);
    expect((await siteApi(dashboard, 'logo-upload-api')).getSite()).toMatchObject({ logo: '/uploads/my-new-logo.webp', logoAlt: 'A new logo' });

    // 2. Remove it: "" is saved, which the site reads as "show the logo letters".
    await dashboard.openEntry('_singletons', 'site');
    await (await dashboard.shown('Logo image')).getByRole('button', { name: 'Remove Image' }).click();
    await dashboard.save();
    const withoutLogo = serialise(writeEntry(fields, { ...site, logo: '', logoAlt: 'A new logo' }));
    await expect.poll(() => dashboard.file(sitePath), 'after removing the picture').toBe(withoutLogo);
    check = await contentCheck(dashboard, 'logo-removed');
    expect(check.status, check.output).toBe(0);
    expect(check.stdout).not.toContain('NOTE');
    const api = await siteApi(dashboard, 'logo-removed-api');
    expect(api.getSite().logo).toBe('');
    expect(api.getSite().monogram).toBe(site.monogram);
  });

  for (const [value, accepted] of [
    ['logo.png please', false],
    ['example.com/logo.png', false],
    ['https://example.com/logo.png', true],
  ] as const) {
    test(`a typed logo address: ${JSON.stringify(value)} is ${accepted ? 'accepted' : 'refused'}`, async ({ page }) => {
      const dashboard = await Dashboard.start(page, tree);
      await dashboard.openEntry('_singletons', 'site');
      const field = await dashboard.shown('Logo image');
      const replace = field.getByRole('button', { name: 'Replace Image' });
      if (await replace.count()) await replace.click();
      else await field.getByRole('button', { name: 'Browse' }).click();
      const dialog = page.getByRole('dialog', { name: 'Select Image' });
      await dialog.getByRole('option', { name: 'Enter URL' }).click();
      await dialog.getByRole('textbox').last().fill(value);
      await dialog.getByRole('button', { name: 'Insert' }).click();
      if (accepted) {
        await dashboard.save();
        await expect.poll(async () => parsed(sitePath, await dashboard.contentFiles()).logo).toBe(value);
        expect((await contentCheck(dashboard, 'logo-url')).status).toBe(0);
      } else {
        const messages = await dashboard.saveExpectingErrors();
        expect(messages.join(' | ')).toMatch(/Upload or pick a picture, or write a full address/);
        expect(await dashboard.file(sitePath), 'nothing was written').toBe(tree[sitePath]);
      }
    });
  }
});
