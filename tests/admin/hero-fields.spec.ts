/**
 * The fields of the top section ("hero") in the dashboard: the two button texts and the list of
 * numbers in Site settings, and the background video, its poster and the two badge lines of
 * each page.
 *
 *   - config.yml lists them in the schema's order, as optional fields with plain-language
 *     hints that say what an empty field does (plain Node tests);
 *   - a save through the REAL dashboard of each of them writes exactly the keys the model
 *     expects, and the folder still passes `validate:content`, and the site reads the values;
 *   - the content preview shows the hero in the same words as the site (tagline, name,
 *     summary, buttons, badge, numbers), with the same numbers as getHeroStats.
 *
 * Tests that drive the dashboard run in the desktop project only and are skipped, with a
 * message, when unpkg.com cannot be reached (same as dashboard.spec.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { loadContent } from '../../scripts/lib/load-content';
import { siteSchema, trackSchema } from '../../src/content/schema';
import { createContentApi } from '../../src/content/selectors';
import { configTargets, serialise, targetFor, writeEntry, type Dict } from './support/cms-model';
import { Dashboard, cdnSkipMessage, cdnStatus } from './support/dashboard';
import { configText, contentDir, contentTree, repoRoot, expectNoNewNotes, makeTempDir, removeTempDirs, validateContent, writeTree } from './support/env';

test.afterAll(removeTempDirs);

const targets = configTargets();
const tree = contentTree();
const sitePath = 'content/site.json';
const trackPaths = { game: 'content/tracks/game.json', softdev: 'content/tracks/softdev.json' } as const;

function parsed(repoPath: string, files: Readonly<Record<string, string>> = tree): Dict {
  return JSON.parse(files[repoPath] ?? 'null') as Dict;
}

/** The config entry (a field list) of the site settings or of one page, straight from config.yml. */
function configFields(owner: 'site' | 'game' | 'softdev'): Dict[] {
  const config = parse(configText()) as Dict;
  if (owner === 'site') {
    const entry = (config.singletons as Dict[]).find((item) => item.name === 'site');
    return (entry?.fields ?? []) as Dict[];
  }
  const pages = (config.collections as Dict[]).find((item) => item.name === 'pages');
  const entry = ((pages?.files ?? []) as Dict[]).find((item) => item.name === owner);
  return (entry?.fields ?? []) as Dict[];
}

const names = (fields: readonly Dict[]): string[] => fields.map((field) => String(field.name));

async function contentCheck(dashboard: Dashboard, label: string): Promise<ReturnType<typeof validateContent>> {
  const dir = makeTempDir(label);
  const files = await dashboard.contentFiles();
  writeTree(dir, Object.fromEntries(Object.entries(files).map(([name, text]) => [name.slice('content/'.length), text])));
  return validateContent(dir);
}

async function siteApi(dashboard: Dashboard, label: string): Promise<ReturnType<typeof createContentApi>> {
  const dir = makeTempDir(label);
  const files = await dashboard.contentFiles();
  writeTree(dir, Object.fromEntries(Object.entries(files).map(([name, text]) => [name.slice('content/'.length), text])));
  const loaded = loadContent(dir);
  if (!loaded.ok) throw new Error('the content saved by the dashboard does not validate');
  return createContentApi(loaded.content);
}

// ---------------------------------------------------------------------------------------
// The config (no page is opened)
// ---------------------------------------------------------------------------------------

test.describe('config.yml: the fields of the top section', () => {
  test('Site settings lists the two button texts and the numbers, where the schema has them', () => {
    const siteFields = names(configFields('site'));
    expect(siteFields.slice(siteFields.indexOf('allTabLabel'))).toEqual(['allTabLabel', 'workLabel', 'contactLabel', 'stats', 'categories']);
    expect(siteFields).toEqual(Object.keys(siteSchema.shape));
  });

  test('each page lists the video, the poster and the two badge lines before the certificates switch', () => {
    for (const id of ['game', 'softdev'] as const) {
      const fields = names(configFields(id));
      expect(fields.slice(fields.indexOf('photoAlt'), fields.indexOf('certificatesFirst') + 1), id).toEqual([
        'photoAlt',
        'heroVideo',
        'heroPoster',
        'badgeLine1',
        'badgeLine2',
        'certificatesFirst',
      ]);
      expect(fields, id).toEqual(Object.keys(trackSchema.shape));
    }
  });

  test('every new field is optional, has an empty (or the site\'s own) default and a hint written for the owner', () => {
    const wanted: Array<[Dict[], string, unknown]> = [
      [configFields('site'), 'workLabel', 'See my work'],
      [configFields('site'), 'contactLabel', 'Get in touch'],
      [configFields('site'), 'stats', []],
      ...(['game', 'softdev'] as const).flatMap((id) =>
        ['heroVideo', 'heroPoster', 'badgeLine1', 'badgeLine2'].map((name): [Dict[], string, unknown] => [configFields(id), name, '']),
      ),
    ];
    for (const [fields, name, expectedDefault] of wanted) {
      const field = fields.find((item) => item.name === name);
      expect(field, name).toBeDefined();
      expect(field?.required, `${name} is optional`).toBe(false);
      expect(field?.default, `${name} default`).toEqual(expectedDefault);
      expect(String(field?.hint ?? '').length, `${name} has a hint`).toBeGreaterThan(20);
    }
  });

  test('the hints say what an empty field does, and that a counted number updates by itself', () => {
    const hint = (fields: Dict[], name: string): string => String(fields.find((item) => item.name === name)?.hint ?? '').replace(/\s+/g, ' ');
    const site = configFields('site');
    expect(hint(site, 'workLabel')).toMatch(/Leave empty to hide the button/);
    expect(hint(site, 'contactLabel')).toMatch(/empty .*Get in touch/);
    expect(hint(site, 'stats')).toMatch(/updates by itself/);
    expect(hint(site, 'stats')).toMatch(/empty to hide the whole row/);
    const row = (site.find((item) => item.name === 'stats')?.fields ?? []) as Dict[];
    expect(hint(row, 'value')).toMatch(/Only used when .*A number I type myself/);
    for (const id of ['game', 'softdev'] as const) {
      const fields = configFields(id);
      expect(hint(fields, 'heroVideo'), id).toMatch(/Leave empty for no video/);
      expect(hint(fields, 'heroPoster'), id).toMatch(/Leave empty/);
      expect(hint(fields, 'badgeLine1'), id).toMatch(/Leave both badge lines empty to hide the badge/);
      expect(hint(fields, 'badgeLine2'), id).toMatch(/Leave both badge lines empty to hide the badge/);
    }
  });

  test('the source of a number is a choice with a human label for each value of the schema', () => {
    const stats = configFields('site').find((item) => item.name === 'stats');
    const source = ((stats?.fields ?? []) as Dict[]).find((item) => item.name === 'source');
    expect(source?.widget).toBe('select');
    expect(source?.required).toBe(true);
    const options = (source?.options ?? []) as Array<{ label: string; value: string }>;
    expect(options.map((option) => option.value)).toEqual(['projects', 'companies', 'years', 'certificates', 'custom']);
    for (const option of options) {
      expect(option.label, option.value).not.toBe(option.value);
      expect(option.label, option.value).toMatch(/\s/);
    }
    expect(names((stats?.fields ?? []) as Dict[])).toEqual(['source', 'value', 'label']);
  });

  test('the video is an address (never an uploaded file) and the poster is a picture', () => {
    for (const id of ['game', 'softdev'] as const) {
      const fields = configFields(id);
      expect(fields.find((item) => item.name === 'heroVideo')?.widget, id).toBe('string');
      expect(fields.find((item) => item.name === 'heroPoster')?.widget, id).toBe('image');
    }
  });

  test('the admin guide explains the new fields', () => {
    const guide = readFileSync(path.join(repoRoot, 'docs', 'admin-guide.md'), 'utf8');
    for (const label of ['Background video of the top section', 'Picture shown before the video', 'Badge, first line', 'Numbers in the top section', 'A number I type myself']) {
      expect(guide, label).toContain(label);
      expect(configText(), label).toContain(`label: ${label}`);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Saving through the real dashboard
// ---------------------------------------------------------------------------------------

test.describe('saving the top section through the real dashboard', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The dashboard is driven once, in the desktop project: these checks are about data, not layout.');
    const cdn = await cdnStatus(request);
    test.skip(!cdn.ok, cdnSkipMessage(cdn));
  });

  test('the button texts of Site settings: a change is written, and an empty text is written as ""', async ({ page }) => {
    test.setTimeout(120_000);
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('_singletons', 'site');
    await dashboard.fill('Text of the "See my work" button', 'View my projects');
    await dashboard.fill('Text of the contact button', 'Say hello');
    await dashboard.save();

    const fields = targetFor(targets, sitePath).fields;
    const changed = serialise(writeEntry(fields, { ...parsed(sitePath), workLabel: 'View my projects', contactLabel: 'Say hello' }));
    await expect.poll(() => dashboard.file(sitePath)).toBe(changed);
    expect(await dashboard.contentFiles()).toEqual({ ...tree, [sitePath]: changed });
    let check = await contentCheck(dashboard, 'hero-labels');
    expect(check.status, check.output).toBe(0);
    expectNoNewNotes(check.stdout);
    expect((await siteApi(dashboard, 'hero-labels-api')).getSite()).toMatchObject({ workLabel: 'View my projects', contactLabel: 'Say hello' });

    // Emptied: "" is written (the page hides the first button and shows "Get in touch").
    await dashboard.openEntry('_singletons', 'site');
    await dashboard.fill('Text of the "See my work" button', '');
    await dashboard.fill('Text of the contact button', '');
    await dashboard.save();
    const emptied = serialise(writeEntry(fields, { ...parsed(sitePath), workLabel: '', contactLabel: '' }));
    await expect.poll(() => dashboard.file(sitePath)).toBe(emptied);
    check = await contentCheck(dashboard, 'hero-labels-empty');
    expect(check.status, check.output).toBe(0);
    expectNoNewNotes(check.stdout);
    expect((await siteApi(dashboard, 'hero-labels-empty-api')).getSite()).toMatchObject({ workLabel: '', contactLabel: '' });
  });

  test('the video, the poster and the badge of each page: each is written, and the content check passes', async ({ page }) => {
    test.setTimeout(180_000);
    const dashboard = await Dashboard.start(page, tree);
    const videoAddress = 'https://example.com/media/hero-loop.mp4';
    for (const id of ['game', 'softdev'] as const) {
      await dashboard.openEntry('pages', id);
      await dashboard.fill('Background video of the top section', ` ${videoAddress} `);
      await dashboard.fill('Badge, first line', ` First ${id} `);
      await dashboard.fill('Badge, second line', `Second ${id}`);
      // The poster, by its address (the picker's "Enter URL" way); an upload is covered by the logo test.
      const field = await dashboard.shown('Picture shown before the video');
      const replace = field.getByRole('button', { name: 'Replace Image' });
      if (await replace.count()) await replace.click();
      else await field.getByRole('button', { name: 'Browse' }).click();
      const dialog = page.getByRole('dialog', { name: 'Select Image' });
      await dialog.getByRole('option', { name: 'Enter URL' }).click();
      await dialog.getByRole('textbox').last().fill(`https://example.com/media/${id}-poster.png`);
      await dialog.getByRole('button', { name: 'Insert' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(field.getByRole('button', { name: 'Remove Image' }), 'the picture is set').toBeVisible();
      await dashboard.save();
    }

    const expected: Record<string, string> = {};
    for (const id of ['game', 'softdev'] as const) {
      expected[trackPaths[id]] = serialise(
        writeEntry(targetFor(targets, trackPaths[id]).fields, {
          ...parsed(trackPaths[id]),
          heroVideo: videoAddress,
          heroPoster: `https://example.com/media/${id}-poster.png`,
          badgeLine1: `First ${id}`,
          badgeLine2: `Second ${id}`,
        }),
      );
    }
    await expect.poll(() => dashboard.contentFiles()).toEqual({ ...tree, ...expected });
    const check = await contentCheck(dashboard, 'hero-track');
    expect(check.status, check.output).toBe(0);
    expectNoNewNotes(check.stdout);
    const api = await siteApi(dashboard, 'hero-track-api');
    expect(api.getTrack('softdev')).toMatchObject({ heroVideo: videoAddress, badgeLine1: 'First softdev', badgeLine2: 'Second softdev' });
    expect(api.getTrack('game').heroPoster).toBe('https://example.com/media/game-poster.png');

    // Emptied again: "" everywhere (no video, no poster, no badge).
    await dashboard.openEntry('pages', 'game');
    for (const label of ['Background video of the top section', 'Badge, first line', 'Badge, second line']) await dashboard.fill(label, '');
    await (await dashboard.shown('Picture shown before the video')).getByRole('button', { name: 'Remove Image' }).click();
    await dashboard.save();
    const emptied = serialise(
      writeEntry(targetFor(targets, trackPaths.game).fields, { ...parsed(trackPaths.game), heroVideo: '', heroPoster: '', badgeLine1: '', badgeLine2: '' }),
    );
    await expect.poll(() => dashboard.file(trackPaths.game)).toBe(emptied);
    const after = await contentCheck(dashboard, 'hero-track-empty');
    expect(after.status, after.output).toBe(0);
    expectNoNewNotes(after.stdout);
    expect((await siteApi(dashboard, 'hero-track-empty-api')).getTrack('game')).toMatchObject({ heroVideo: '', heroPoster: '', badgeLine1: '', badgeLine2: '' });
  });

  test('a video address that is not an address is refused by the form', async ({ page }) => {
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('pages', 'game');
    await dashboard.fill('Background video of the top section', 'hero loop.mp4');
    const messages = await dashboard.saveExpectingErrors();
    expect(messages.join(' ')).toContain('Write a full address starting with https://');
    expect(await dashboard.contentFiles()).toEqual(tree);
  });

  test('the numbers: a row changed in place, and a typed number, are written key by key', async ({ page }) => {
    test.setTimeout(150_000);
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('_singletons', 'site');
    const list = await dashboard.shown('Numbers in the top section');
    const unfold = list.getByRole('button', { name: 'Expand', exact: true });
    const wordsBox = list.getByRole('textbox', { name: 'Words under the number', exact: true });
    for (let attempt = 0; attempt < 10 && (await wordsBox.count()) === 0; attempt += 1) {
      if (await unfold.count()) await unfold.first().click();
      else await page.waitForTimeout(100);
    }
    await wordsBox.first().fill('Things shipped');
    await dashboard.save();

    const stats = (parsed(sitePath).stats as Dict[]).map((row, index) => (index === 0 ? { ...row, label: 'Things shipped' } : row));
    const fields = targetFor(targets, sitePath).fields;
    const changed = serialise(writeEntry(fields, { ...parsed(sitePath), stats }));
    await expect.poll(() => dashboard.file(sitePath)).toBe(changed);
    expect(await dashboard.contentFiles()).toEqual({ ...tree, [sitePath]: changed });
    const check = await contentCheck(dashboard, 'hero-stats-edit');
    expect(check.status, check.output).toBe(0);
    expectNoNewNotes(check.stdout);
    const resolved = (await siteApi(dashboard, 'hero-stats-edit-api')).getHeroStats('game');
    expect(resolved[0]?.label).toBe('Things shipped');
  });

  test('a new row for a number you type yourself is written complete, and shows on both pages', async ({ page }) => {
    test.setTimeout(150_000);
    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('_singletons', 'site');
    const list = await dashboard.shown('Numbers in the top section');
    await list.getByRole('button', { name: /^Add\b.*Number/ }).click();
    // The new row is the last one; open it if it is folded.
    const rows = list.getByRole('textbox', { name: 'Words under the number', exact: true });
    const before = (parsed(sitePath).stats as unknown[]).length;
    for (let attempt = 0; attempt < 20 && (await rows.count()) <= before; attempt += 1) {
      const unfold = list.getByRole('button', { name: 'Expand', exact: true });
      if (await unfold.count()) await unfold.first().click();
      else await page.waitForTimeout(100);
    }
    await expect(rows).toHaveCount(before + 1);
    await list.getByRole('radio', { name: 'A number I type myself', exact: true }).last().check();
    await list.getByRole('textbox', { name: 'Your number', exact: true }).last().fill(' 12+ ');
    await rows.last().fill('Things made');
    await dashboard.save();

    const stats = [...(parsed(sitePath).stats as Dict[]), { source: 'custom', value: '12+', label: 'Things made' }];
    const changed = serialise(writeEntry(targetFor(targets, sitePath).fields, { ...parsed(sitePath), stats }));
    await expect.poll(() => dashboard.file(sitePath)).toBe(changed);
    const check = await contentCheck(dashboard, 'hero-stats-new');
    expect(check.status, check.output).toBe(0);
    expectNoNewNotes(check.stdout);
    const api = await siteApi(dashboard, 'hero-stats-new-api');
    for (const id of ['game', 'softdev'] as const) expect(api.getHeroStats(id).at(-1), id).toEqual({ value: '12+', label: 'Things made' });
  });
});

// ---------------------------------------------------------------------------------------
// The content preview
// ---------------------------------------------------------------------------------------

/** The month the preview counts "years" up to: the current month, as "YYYY-MM". */
function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

test.describe('the content preview of the top section', () => {
  test('its numbers are the site\'s numbers (counted, typed, zero and blank rows included)', async ({ page }) => {
    const loaded = loadContent(contentDir);
    if (!loaded.ok) throw new Error('the content does not validate');
    const real = loaded.content;
    const stats = [
      ...real.site.stats,
      { source: 'certificates' as const, value: '', label: 'Certificates' },
      { source: 'custom' as const, value: ' 99 ', label: 'Typed' },
      { source: 'custom' as const, value: '', label: 'Typed but empty' },
      { source: 'custom' as const, value: '0', label: 'Zero' },
      { source: 'projects' as const, value: '', label: '   ' },
    ];
    const bundles = {
      real,
      withExtras: { ...real, site: { ...real.site, stats } },
      noRows: { ...real, site: { ...real.site, stats: [] } },
      noJobs: { ...real, site: { ...real.site, stats }, experience: [] },
    };
    // The same "now" for both sides: the preview takes a Date, the site a month.
    const buildMonth = thisMonth();
    const expected = Object.fromEntries(
      Object.entries(bundles).map(([name, bundle]) => [name, createContentApi({ ...bundle, buildMonth }).getHeroStats('game')]),
    );
    await page.goto('admin/preview-logic.js');
    const actual = await page.evaluate(
      async ({ data }) => {
        const logic = (await import(window.location.href)) as { heroStats: (site: unknown, items: unknown, now?: Date) => unknown };
        return Object.fromEntries(
          Object.entries(data).map(([name, bundle]) => {
            const b = bundle as { site: unknown; projects: unknown; experience: unknown; certificates: unknown };
            return [name, logic.heroStats(b.site, { projects: b.projects, experience: b.experience, certificates: b.certificates })];
          }),
        );
      },
      { data: JSON.parse(JSON.stringify(bundles)) as typeof bundles },
    );
    expect(actual).toEqual(expected);
    const labels = (expected.withExtras ?? []).map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['Certificates', 'Typed']));
    expect(labels).not.toContain('Zero');
    expect(labels).not.toContain('Typed but empty');
    expect(expected.noRows).toEqual([]);
  });

  test('a page shows tagline, name, summary, buttons, badge and numbers; an empty badge is not drawn', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The dashboard is driven once, in the desktop project.');
    const cdn = await cdnStatus(page.request);
    test.skip(!cdn.ok, cdnSkipMessage(cdn));

    const dashboard = await Dashboard.start(page, tree);
    const loaded = loadContent(contentDir);
    if (!loaded.ok) throw new Error('the content does not validate');
    const api = createContentApi({ ...loaded.content, buildMonth: thisMonth() });
    const track = api.getTrack('game');
    await dashboard.openEntry('pages', 'game');
    const preview = dashboard.preview;
    await expect(preview.locator('.kk-hero__headline')).toHaveText(track.headline);
    await expect(preview.locator('.kk-hero__name')).toHaveText(api.getSite().name);
    if (track.summary.trim() !== '') await expect(preview.locator('.kk-hero [data-key-path="summary"]')).toHaveText(track.summary);
    await expect(preview.locator('.kk-hero__work')).toHaveText(api.getSite().workLabel);
    await expect(preview.locator('.kk-hero__badge span')).toHaveText([track.badgeLine1, track.badgeLine2]);
    await expect(preview.locator('.kk-hero__stats li')).toHaveText(api.getHeroStats('game').map((stat) => `${stat.value} ${stat.label}`));
    await expect(preview.locator('.kk-hero__photo'), 'the photo is no longer part of the hero').toHaveCount(0);
    await expect(preview.locator('.kk-facts')).toContainText(track.heroVideo);

    // Both badge lines emptied: the badge is gone. The video emptied: the facts say so.
    await dashboard.fill('Badge, first line', '');
    await dashboard.fill('Badge, second line', '');
    await expect(preview.locator('.kk-hero__badge')).toHaveCount(0);
    await dashboard.fill('Background video of the top section', '');
    await expect(preview.locator('.kk-facts')).toContainText('None — the dark gradient is shown.');
  });

  test('site settings: the preview names the button texts and the numbers', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The dashboard is driven once, in the desktop project.');
    const cdn = await cdnStatus(page.request);
    test.skip(!cdn.ok, cdnSkipMessage(cdn));

    const dashboard = await Dashboard.start(page, tree);
    await dashboard.openEntry('_singletons', 'site');
    const facts = dashboard.preview.locator('.kk-facts');
    await expect(facts).toContainText('“See my work” in the top section');
    await expect(facts).toContainText('Projects built');
    await dashboard.fill('Text of the "See my work" button', '');
    await expect(facts).toContainText('The projects button is hidden');
  });
});
