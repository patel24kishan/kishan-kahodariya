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
import { COLLECTION_FOLDERS } from '../../src/content/schema';
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
import { contentTree, makeTempDir, removeTempDirs, validateContent, writeTree } from './support/env';

test.afterAll(removeTempDirs);

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
