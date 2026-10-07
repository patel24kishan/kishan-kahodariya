/**
 * `npm run validate:cms` — passes on the real config and fails, with a message that says
 * what to fix, on a table of deliberately broken copies.
 *
 * Every case runs the real script (the same command the build runs) against a temp copy of
 * public/admin, the deploy workflow and /content. Plain Node tests: no page is opened.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { parse, stringify } from 'yaml';
import {
  BARE_UPLOAD_NAME,
  TEXT_SAMPLES,
  checkCmsConfig,
  contentKinds,
  deployBranches,
  expectedRepo,
  formAcceptsText,
  parsePattern,
  readCmsConfig,
  type FieldNode,
} from '../../scripts/validate-cms-config';
import { isAssetPath, isLinkUrl, isSlug, isWebUrl, isYearMonth, countWords, MAX_HOVER_WORDS } from '../../src/content/schema';
import {
  adminDir,
  configText,
  contentDir,
  copyProjectInputs,
  deployPath,
  htmlText,
  pinnedScript,
  removeTempDirs,
  replaceOnce,
  repoRoot,
  validateCms,
  writeTree,
} from './support/env';

type Dict = Record<string, unknown>;
const isDict = (value: unknown): value is Dict => value !== null && typeof value === 'object' && !Array.isArray(value);

test.afterAll(removeTempDirs);

// ---------------------------------------------------------------------------------------
// Helpers to break a copy of the config
// ---------------------------------------------------------------------------------------

/** config.yml as a plain object (aliases expanded), ready to be changed and written back. */
function configObject(): Dict {
  const value: unknown = parse(configText());
  if (!isDict(value)) throw new Error('config.yml is not a mapping');
  return value;
}

function configFile(config: Dict, version = pinnedScript().version): string {
  return `# yaml-language-server: $schema=https://unpkg.com/@sveltia/cms@${version}/schema/sveltia-cms.json\n${stringify(config, { lineWidth: 0 })}`;
}

function list(value: unknown, what: string): Dict[] {
  if (!Array.isArray(value)) throw new Error(`${what} is not a list`);
  return value.filter(isDict);
}

function collection(config: Dict, name: string): Dict {
  const found = list(config.collections, 'collections').find((entry) => entry.name === name);
  if (!found) throw new Error(`no collection "${name}"`);
  return found;
}

function pageFile(config: Dict, name: string): Dict {
  const found = list(collection(config, 'pages').files, 'pages.files').find((entry) => entry.name === name);
  if (!found) throw new Error(`no page file "${name}"`);
  return found;
}

function site(config: Dict): Dict {
  const found = list(config.singletons, 'singletons').find((entry) => entry.name === 'site');
  if (!found) throw new Error('no site settings entry');
  return found;
}

function field(owner: Dict, name: string): Dict {
  const found = list(owner.fields, 'fields').find((entry) => entry.name === name);
  if (!found) throw new Error(`no field "${name}"`);
  return found;
}

function fields(owner: Dict): Dict[] {
  return owner.fields as Dict[];
}

function removeField(owner: Dict, name: string): void {
  owner.fields = list(owner.fields, 'fields').filter((entry) => entry.name !== name);
}

function backend(config: Dict): Dict {
  return config.backend as Dict;
}

interface Case {
  name: string;
  /** Change the config object in place. */
  config?: (config: Dict) => void;
  /** Change the text of the written config file (after `config`). */
  configTextChange?: (text: string) => string;
  html?: (html: string) => string;
  deploy?: (deploy: string) => string;
  /** Extra files for the temp content folder, relative to it. */
  content?: Record<string, string>;
  /** Every expression must be found in the script's output. */
  expect: RegExp[];
}

const LINK_PATTERN_WITHOUT_MAILTO = '^(?:[Hh][Tt][Tt][Pp][Ss]?://\\S+|/(?!/)\\S*)$';

const CASES: Case[] = [
  // ---- fields ----
  {
    name: 'a schema field is missing from a collection',
    config: (config) => removeField(collection(config, 'projects'), 'hoverText'),
    expect: [/where:\s+Projects\n\s+problem: the field "hoverText" is in the schema but not in the config/, /lost on the next save/],
  },
  {
    name: 'a field the schema does not know',
    config: (config) => fields(collection(config, 'projects')).push({ name: 'subtitle', label: 'Subtitle', widget: 'string', required: false, default: '' }),
    expect: [/"subtitle" is not in the schema/, /the deploy would stop/],
  },
  {
    name: 'fields in another order than the schema',
    config: (config) => {
      const all = fields(collection(config, 'links'));
      const [first, second] = [all[1], all[2]];
      if (first && second) all.splice(1, 2, second, first);
    },
    expect: [/Links/, /different order than the schema/, /Schema order: slug, label, url, icon/],
  },
  {
    name: 'a key of a list row is missing',
    config: (config) => removeField(field(collection(config, 'projects'), 'screenshots'), 'alt'),
    expect: [/Screenshots \(screenshots\)/, /"alt" is in the schema but not in the config/],
  },
  {
    name: 'a list row has a key the schema does not know',
    config: (config) => fields(field(collection(config, 'projects'), 'links')).push({ name: 'caption', widget: 'string', required: false, default: '' }),
    expect: [/Buttons \(links\)/, /"caption" is not in the schema/],
  },
  {
    name: 'a project tab row misses a key',
    config: (config) => removeField(field(site(config), 'categories'), 'hoverWithVideo'),
    expect: [/Site settings › Project tabs \(categories\)/, /"hoverWithVideo" is in the schema but not in the config/],
  },
  // ---- required / optional / defaults ----
  {
    name: 'an identity field made optional',
    config: (config) => {
      field(collection(config, 'projects'), 'title').required = false;
    },
    expect: [/Title \(title\)/, /identity field .* must be required/],
  },
  {
    name: 'an optional field made required',
    config: (config) => {
      delete field(collection(config, 'experience'), 'role').required;
    },
    expect: [/Job title \(role\)/, /optional in the schema: add `required: false`/],
  },
  {
    name: 'an optional text field without a default',
    config: (config) => {
      delete field(collection(config, 'education'), 'grade').default;
    },
    expect: [/Grade \(grade\)/, /needs an explicit `default: ''`/],
  },
  {
    name: 'a new item published by default',
    config: (config) => {
      field(collection(config, 'projects'), 'published').default = true;
    },
    expect: [/Published \(published\)/, /must default to false/],
  },
  {
    name: 'a switch without a default',
    config: (config) => {
      delete field(collection(config, 'links'), 'showInHero').default;
    },
    expect: [/showInHero/, /needs an explicit `default: true` or `default: false`/],
  },
  {
    name: 'a required number without a default',
    config: (config) => {
      delete field(collection(config, 'skills'), 'orderGame').default;
    },
    expect: [/Position on the game page \(orderGame\)/, /needs a numeric `default`/],
  },
  {
    name: 'a number stored as text',
    config: (config) => {
      field(collection(config, 'links'), 'order').value_type = 'int/string';
    },
    expect: [/Position next to your name \(order\)/, /would store the number as text/],
  },
  {
    name: 'a list without a default',
    config: (config) => {
      delete field(collection(config, 'projects'), 'tags').default;
    },
    expect: [/Tags \(tags\)/, /needs an explicit `default: \[\]`/],
  },
  {
    name: 'a hidden field without a default',
    config: (config) => {
      delete field(collection(config, 'projects'), 'legacyId').default;
    },
    expect: [/legacyId/, /is hidden and needs a `default`/],
  },
  // ---- choices ----
  {
    name: 'a choice misses an option of the schema',
    config: (config) => {
      const kind = field(field(collection(config, 'projects'), 'links'), 'kind');
      kind.options = list(kind.options, 'options').filter((option) => option.value !== 'store');
    },
    expect: [/Kind of link \(kind\)/, /is missing the option\(s\) "store"/],
  },
  {
    name: 'a choice offers an option the schema rejects',
    config: (config) => {
      (field(collection(config, 'links'), 'audience').options as unknown[]).push({ label: 'Press page', value: 'press' });
    },
    expect: [/Page \(audience\)/, /offers the option\(s\) "press" that the schema rejects/],
  },
  {
    name: 'a choice made optional',
    config: (config) => {
      field(collection(config, 'skills'), 'emphasis').required = false;
    },
    expect: [/Highlight on \(emphasis\)/, /must be required: an unselected choice is saved as ""/],
  },
  {
    name: 'a choice whose default is not an option',
    config: (config) => {
      field(collection(config, 'links'), 'icon').default = 'web';
    },
    expect: [/Icon \(icon\)/, /default "web", which is not one of its options/],
  },
  {
    name: 'the project tab as free text',
    config: (config) => {
      const category = field(collection(config, 'projects'), 'category');
      category.widget = 'string';
    },
    expect: [/Tab \(category\)/, /must be a choice driven by Site settings/],
  },
  {
    name: 'the tab choice pointing at the wrong list',
    config: (config) => {
      field(pageFile(config, 'softdev'), 'defaultTab').value_field = 'categories.*.label';
    },
    expect: [/Software page › Project tab that opens first \(defaultTab\)/, /must list the project tabs of Site settings/],
  },
  // ---- text rules ----
  {
    name: 'the video address without a pattern',
    config: (config) => {
      delete field(collection(config, 'projects'), 'videoUrl').pattern;
    },
    expect: [/videoUrl/, /the form accepts "[^"]+" but the content check rejects it/, /Add or tighten the `pattern`/],
  },
  {
    name: 'a hover text pattern that allows five words',
    config: (config) => {
      field(collection(config, 'projects'), 'hoverText').pattern = ['^\\S+(?:\\s+\\S+){0,4}$', 'Use at most 5 words.'];
    },
    expect: [/Card hover text \(hoverText\)/, /the form accepts "one two three four five" but the content check rejects it/],
  },
  {
    name: 'a hover text pattern stricter than the schema',
    config: (config) => {
      field(field(site(config), 'categories'), 'hoverWithVideo').pattern = ['^\\S+(?:\\s+\\S+){0,2}$', 'Use at most 3 words.'];
    },
    expect: [/hoverWithVideo/, /the form refuses "View Gameplay & Screenshots" but the content check accepts it/, /stricter than the schema/],
  },
  {
    name: 'a link pattern that forgets mailto',
    config: (config) => {
      // The real pattern with only its mailto alternative taken out.
      const url = field(collection(config, 'links'), 'url');
      const real = String((url.pattern as unknown[])[0]);
      const start = real.indexOf('|[Mm][Aa][Ii][Ll]');
      const end = real.indexOf('|/(?!/)');
      if (start < 0 || end < start) throw new Error('the link pattern no longer has a mailto alternative to remove');
      url.pattern = [real.slice(0, start) + real.slice(end), 'Write a full address starting with https://'];
    },
    expect: [/Address \(url\)/, /the form refuses "mailto:name@example\.com" but the content check accepts it/],
  },
  {
    name: 'a pattern that is not a regular expression',
    config: (config) => {
      field(collection(config, 'certificates'), 'url').pattern = ['^(https?://', 'Write a full address starting with https://'];
    },
    expect: [/Link to the certificate \(url\)/, /valid regular expression/, /silently ignores/],
  },
  {
    name: 'a pattern without a helpful message',
    config: (config) => {
      const pattern = field(collection(config, 'projects'), 'videoUrl').pattern as unknown[];
      pattern[1] = 'Invalid';
    },
    expect: [/videoUrl/, /the message the owner sees/],
  },
  {
    name: 'the short name without a pattern',
    config: (config) => {
      delete field(collection(config, 'experience'), 'slug').pattern;
    },
    expect: [/Experience › Short name \(file name\) \(slug\)/, /the form accepts "[^"]+" but the content check rejects it/],
  },
  {
    name: 'a tab id that may be "all"',
    config: (config) => {
      field(field(site(config), 'categories'), 'id').pattern = ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Use lower-case letters, numbers and hyphens.'];
    },
    expect: [/Tab ID/, /the form accepts "all" but the content check rejects it/],
  },
  {
    name: 'a date field without its pattern',
    config: (config) => {
      delete field(collection(config, 'experience'), 'startDate').pattern;
    },
    expect: [/startDate/, /the form accepts "[^"]+" but the content check rejects it/],
  },
  {
    name: 'an email field with a looser pattern',
    config: (config) => {
      field(site(config), 'email').pattern = ['^\\S+@\\S+$', 'Write a full email address.'];
    },
    expect: [/Email address \(email\)/, /the form accepts "name@example" but the content check rejects it/],
  },
  {
    name: "a rule of Sveltia's own that the check cannot compare",
    config: (config) => {
      field(collection(config, 'projects'), 'videoUrl').type = 'url';
    },
    expect: [/videoUrl/, /`type` adds a rule/],
  },
  {
    name: 'an image field that would refuse every upload',
    config: (config) => {
      field(collection(config, 'certificates'), 'image').pattern = [LINK_PATTERN_WITHOUT_MAILTO, 'Write a full address starting with https://'];
    },
    expect: [/Badge image \(image\)/, /refuses the upload name "screenshot\.png"/, /every upload to this field would be refused/],
  },
  {
    name: 'an image field without a pattern',
    config: (config) => {
      delete field(collection(config, 'experience'), 'logo').pattern;
    },
    expect: [/Company logo \(logo\)/, /the form accepts "[^"]+" but the content check rejects it/],
  },
  // ---- lists ----
  {
    name: 'a list of rows written as a plain list',
    config: (config) => {
      delete field(collection(config, 'projects'), 'links').fields;
    },
    expect: [/Buttons \(links\)/, /is a list of rows in the schema and needs `fields:`/],
  },
  {
    name: 'a plain list given row fields',
    config: (config) => {
      field(collection(config, 'skills'), 'skills').fields = [{ name: 'name', widget: 'string' }];
    },
    expect: [/Skills \(skills\)/, /list of plain text in the schema: remove `fields:`/],
  },
  // ---- the pages: id and route ----
  {
    name: 'a page id the owner could edit',
    config: (config) => {
      const id = field(pageFile(config, 'game'), 'id');
      id.widget = 'select';
      id.options = ['game', 'softdev'];
      id.required = true;
    },
    expect: [/Game page › id/, /must be hidden \(or read-only\)/],
  },
  {
    name: 'a page id that is not the file name',
    config: (config) => {
      field(pageFile(config, 'game'), 'id').default = 'softdev';
    },
    expect: [/Game page › id/, /must default to "game", the name of the file it is in/],
  },
  {
    name: 'a page address the owner could edit',
    config: (config) => {
      const route = field(pageFile(config, 'softdev'), 'route');
      route.widget = 'string';
      route.required = true;
    },
    expect: [/Software page › route/, /must be hidden \(or read-only\)/],
  },
  // ---- backend, branch, sign-in ----
  {
    name: 'another repository',
    config: (config) => {
      backend(config).repo = 'someone-else/My-Portfolio';
    },
    expect: [/backend › repo/, new RegExp(`must be "${expectedRepo()}"`)],
  },
  {
    name: 'a branch that is not the deployed one',
    config: (config) => {
      backend(config).branch = 'main';
    },
    expect: [/backend › branch/, /is "main" but .*deploy\.yml deploys pushes to "master"/, /never reaches the live site/],
  },
  {
    name: 'no branch at all',
    config: (config) => {
      delete backend(config).branch;
    },
    expect: [/backend › branch/, /must be written out/],
  },
  {
    name: 'the deploy workflow moved to another branch',
    deploy: (deploy) => replaceOnce(deploy, 'branches: [master]', 'branches: [main]'),
    expect: [/backend › branch/, /is "master" but .*deploy\.yml deploys pushes to "main"/],
  },
  {
    name: 'sign-in methods that need an OAuth server',
    config: (config) => {
      delete backend(config).auth_methods;
    },
    expect: [/backend › auth_methods/, /must be \[token\]/],
  },
  {
    name: 'a review workflow instead of direct saves',
    config: (config) => {
      config.publish_mode = 'editorial_workflow';
    },
    expect: [/publish_mode/, /must be left out or "simple"/],
  },
  {
    name: 'a wrong site address',
    config: (config) => {
      config.site_url = 'https://patel24kishan.github.io';
    },
    expect: [/site_url/, /must be "https:\/\/patel24kishan\.github\.io\/My-Portfolio"/],
  },
  // ---- media and output ----
  {
    name: 'uploads in another folder',
    config: (config) => {
      config.media_folder = 'static/uploads';
    },
    expect: [/media_folder/, /must be "public\/uploads"/],
  },
  {
    name: 'a public path that carries the base path',
    config: (config) => {
      config.public_folder = '/My-Portfolio/uploads';
    },
    expect: [/public_folder/, /must be "\/uploads"/],
  },
  {
    name: 'upload names kept as typed',
    config: (config) => {
      ((config.media_libraries as Dict).default as { config: Dict }).config.slugify_filename = false;
    },
    expect: [/slugify_filename/, /must be true/],
  },
  {
    name: 'empty fields left out of the file',
    config: (config) => {
      (config.output as Dict).omit_empty_optional_fields = true;
    },
    expect: [/omit_empty_optional_fields/, /must not be true/],
  },
  {
    name: 'a collection saved as YAML',
    config: (config) => {
      const skills = collection(config, 'skills');
      skills.format = 'yaml';
      skills.extension = 'yml';
    },
    expect: [/Skill groups/, /needs `format: json`/, /needs `extension: json`/],
  },
  // ---- file names ----
  {
    name: 'file names taken from the title',
    config: (config) => {
      collection(config, 'projects').slug = '{{title}}';
    },
    expect: [/Projects › slug › template/, /must be "\{\{fields\.slug\}\}"/],
  },
  {
    name: 'file names the owner can change in the side panel',
    config: (config) => {
      (collection(config, 'links').slug as Dict).editable = true;
    },
    expect: [/Links › slug › editable/, /must be false/],
  },
  {
    name: 'duplicating items',
    config: (config) => {
      delete collection(config, 'projects').duplicate;
    },
    expect: [/Projects › duplicate/, /must be false/, /half-edited item on the site/],
  },
  {
    name: 'drag-reordering of entries',
    config: (config) => {
      collection(config, 'links').reorder = { key: 'order' };
    },
    expect: [/Links › reorder/, /first key of every file/],
  },
  // ---- every content kind has one home ----
  {
    name: 'a content folder nobody edits',
    config: (config) => {
      config.collections = list(config.collections, 'collections').filter((entry) => entry.name !== 'certificates');
    },
    expect: [/no collection has `folder: content\/certificates`/, /where:\s+content\/certificates\/[a-z0-9-]+\.json\n\s+problem: is not editable in the dashboard/],
  },
  {
    name: 'two collections writing the same folder',
    config: (config) => {
      const copy = JSON.parse(JSON.stringify(collection(config, 'links'))) as Dict;
      copy.name = 'links-again';
      copy.label = 'More links';
      (config.collections as unknown[]).push(copy);
    },
    expect: [/content\/links is edited by 2 entries/],
  },
  {
    name: 'an entry that edits something outside /content',
    config: (config) => {
      (config.singletons as unknown[]).push({ name: 'pkg', label: 'Package', file: 'package.json', fields: [{ name: 'name', widget: 'string' }] });
    },
    expect: [/Package/, /edits "package\.json", which is not a content location/],
  },
  {
    name: 'a content file in a folder the dashboard does not know',
    content: { 'notes/todo.json': '{}\n' },
    expect: [/content\/notes\/todo\.json/, /is not editable in the dashboard/],
  },
  // ---- the page ----
  {
    name: 'the script not pinned to a version',
    html: (html) => html.replace(/@sveltia\/cms@[\d.]+\//, '@sveltia/cms/'),
    expect: [/index\.html/, /an exact version, not "latest" and not a range/],
  },
  {
    name: 'the script pinned to a range',
    html: (html) => html.replace(/@sveltia\/cms@[\d.]+\//, '@sveltia/cms@^0/'),
    expect: [/an exact version, not "latest" and not a range/],
  },
  {
    name: 'no integrity hash',
    html: (html) => html.replace(/\s+integrity="[^"]+"/, ''),
    expect: [/needs an `integrity="sha384-…"` attribute/],
  },
  {
    name: 'no crossorigin attribute',
    html: (html) => html.replace(/\s+crossorigin="anonymous"/, ''),
    expect: [/needs `crossorigin="anonymous"`/],
  },
  {
    name: 'no noindex',
    html: (html) => html.replace(/<meta name="robots"[^>]*>/, ''),
    expect: [/needs exactly one <meta name="robots" content="noindex">/],
  },
  {
    name: 'a second script from another site',
    html: (html) => html.replace('</body>', '<script src="https://example.com/analytics.js"></script></body>'),
    expect: [/must load exactly one script from another site/],
  },
  {
    name: 'a stylesheet from another site',
    html: (html) => html.replace('</head>', '<link rel="stylesheet" href="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.css" /></head>'),
    expect: [/<link>/, /from another site — only the pinned Sveltia script may/],
  },
  {
    name: 'an inline script',
    html: (html) => html.replace('</body>', '<script>window.CMS_MANUAL_INIT = true;</script></body>'),
    expect: [/inline scripts are not used on this page/],
  },
  {
    name: 'a local script that does not exist',
    html: (html) => html.replace('src="slug-guard.js"', 'src="guard.js"'),
    expect: [/loads "guard\.js", which is not a file in the admin folder/],
  },
  {
    name: 'the schema comment naming another version',
    configTextChange: (text) => text.replace(/cms@[\d.]+\/schema/, 'cms@0.1.0/schema'),
    expect: [/comment must name version \d+\.\d+\.\d+/],
  },
  // ---- the file itself ----
  {
    name: 'broken YAML',
    configTextChange: (text) => `${text}\ncollections: [unclosed\n`,
    expect: [/is not valid YAML/],
  },
  {
    name: 'a YAML merge key',
    config: (config) => {
      field(collection(config, 'projects'), 'title')['<<'] = { hint: 'x' };
    },
    expect: [/merge key/],
  },
  // ---- the logo, the footer order and the resume per tab (added at the end so the numbers above stay) ----
  {
    name: 'the logo image missing from Site settings',
    config: (config) => removeField(site(config), 'logo'),
    expect: [/where:\s+Site settings\n\s+problem: the field "logo" is in the schema but not in the config/, /lost on the next save/],
  },
  {
    name: 'the logo description missing from Site settings',
    config: (config) => removeField(site(config), 'logoAlt'),
    expect: [/Site settings/, /"logoAlt" is in the schema but not in the config/],
  },
  {
    name: 'the logo as free text instead of an image with its pattern',
    config: (config) => {
      const logo = field(site(config), 'logo');
      logo.widget = 'string';
      delete logo.pattern;
    },
    expect: [/Site settings › Logo image \(logo\)/, /the form accepts "[^"]+" but the content check rejects it/],
  },
  {
    name: 'a logo field that would refuse every upload',
    config: (config) => {
      field(site(config), 'logo').pattern = [LINK_PATTERN_WITHOUT_MAILTO, 'Write a full address starting with https://'];
    },
    expect: [/Logo image \(logo\)/, /refuses the upload name "screenshot\.png"/],
  },
  {
    name: 'the footer order missing from Links',
    config: (config) => removeField(collection(config, 'links'), 'orderFooter'),
    expect: [/where:\s+Links\n\s+problem: the field "orderFooter" is in the schema but not in the config/, /lost on the next save/],
  },
  {
    name: 'the footer order placed before the position next to the name',
    config: (config) => {
      const all = fields(collection(config, 'links'));
      const order = all.findIndex((entry) => entry.name === 'order');
      const [first, second] = [all[order], all[order + 1]];
      if (order < 0 || !first || !second || second.name !== 'orderFooter') throw new Error('orderFooter is expected right after order');
      all.splice(order, 2, second, first);
    },
    expect: [/Links/, /different order than the schema/, /audience, order, orderFooter, showInHero/],
  },
  {
    name: 'a footer order without a default',
    config: (config) => {
      delete field(collection(config, 'links'), 'orderFooter').default;
    },
    expect: [/Footer order \(orderFooter\)/, /needs a numeric `default`/],
  },
  {
    name: 'a footer order stored as text',
    config: (config) => {
      field(collection(config, 'links'), 'orderFooter').value_type = 'int/string';
    },
    expect: [/Footer order \(orderFooter\)/, /would store the number as text/],
  },
  {
    name: 'the resume-per-tab list missing from one page',
    config: (config) => removeField(pageFile(config, 'softdev'), 'tabResumes'),
    expect: [/where:\s+Pages › Software page\n\s+problem: the field "tabResumes" is in the schema but not in the config/, /lost on the next save/],
  },
  {
    name: 'a resume-per-tab row misses a key',
    config: (config) => removeField(field(pageFile(config, 'game'), 'tabResumes'), 'label'),
    expect: [/Game page › Resume for a specific tab \(tabResumes\)/, /"label" is in the schema but not in the config/],
  },
  {
    name: 'a resume-per-tab row has a key the schema does not know',
    config: (config) => fields(field(pageFile(config, 'game'), 'tabResumes')).push({ name: 'note', widget: 'string', required: false, default: '' }),
    expect: [/Resume for a specific tab \(tabResumes\)/, /"note" is not in the schema/, /the deploy would stop/],
  },
  {
    name: 'the resume-per-tab rows in another order than the schema',
    config: (config) => {
      (field(pageFile(config, 'game'), 'tabResumes').fields as Dict[]).reverse();
    },
    expect: [/Resume for a specific tab \(tabResumes\)/, /different order than the schema/, /Schema order: tab, url, label/],
  },
  {
    name: 'the tab of a resume row as free text',
    config: (config) => {
      const tab = field(field(pageFile(config, 'game'), 'tabResumes'), 'tab');
      tab.widget = 'string';
    },
    expect: [/Tab with its own resume \(tab\)/, /must be a choice driven by Site settings/, /could name a tab that does not exist/],
  },
  {
    name: 'the tab of a resume row pointing at the wrong list',
    config: (config) => {
      field(field(pageFile(config, 'softdev'), 'tabResumes'), 'tab').value_field = 'categories.*.label';
    },
    expect: [/Software page › Resume for a specific tab \(tabResumes\) › Tab with its own resume \(tab\)/, /must list the project tabs of Site settings/],
  },
  {
    name: 'the tab of a resume row made optional',
    config: (config) => {
      field(field(pageFile(config, 'game'), 'tabResumes'), 'tab').required = false;
    },
    expect: [/Tab with its own resume \(tab\)/, /must be required: Sveltia writes null for an unselected relation/],
  },
  {
    name: 'the link of a resume row without a pattern',
    config: (config) => {
      delete field(field(pageFile(config, 'game'), 'tabResumes'), 'url').pattern;
    },
    expect: [/Resume link for this tab \(url\)/, /the form accepts "[^"]+" but the content check rejects it/, /Add or tighten the `pattern`/],
  },
  {
    name: 'the link of a resume row with the looser pattern of the main resume link',
    config: (config) => {
      const main = field(pageFile(config, 'game'), 'resumeUrl').pattern as unknown[];
      field(field(pageFile(config, 'game'), 'tabResumes'), 'url').pattern = [main[0], 'Write a full address starting with https://'];
    },
    // The main resume may be a site path or a mailto: address; a tab resume may not.
    expect: [/Resume link for this tab \(url\)/, /the form accepts "(?:\/|mailto:)[^"]*" but the content check rejects it/],
  },
  {
    name: 'the link of a resume row made required',
    config: (config) => {
      delete field(field(pageFile(config, 'softdev'), 'tabResumes'), 'url').required;
    },
    expect: [/Resume link for this tab \(url\)/, /optional in the schema: add `required: false`/],
  },
  {
    name: 'the resume-per-tab list without its rows',
    config: (config) => {
      delete field(pageFile(config, 'game'), 'tabResumes').fields;
    },
    expect: [/Resume for a specific tab \(tabResumes\)/, /is a list of rows in the schema and needs `fields:`/],
  },
];

// ---------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------

function runCase(testCase: Case, label: string): ReturnType<typeof validateCms> {
  const copy = copyProjectInputs(label);
  const config = configObject();
  testCase.config?.(config);
  let text = testCase.config ? configFile(config) : configText();
  if (testCase.configTextChange) text = testCase.configTextChange(text);
  writeFileSync(copy.config, text, 'utf8');
  if (testCase.html) writeFileSync(copy.html, testCase.html(htmlText()), 'utf8');
  if (testCase.deploy) writeFileSync(copy.deploy, testCase.deploy(readFileSync(deployPath, 'utf8')), 'utf8');
  if (testCase.content) writeTree(copy.content, testCase.content);
  return validateCms(['--config', copy.config, '--html', copy.html, '--deploy', copy.deploy, '--content', copy.content]);
}

test.describe('validate:cms on the real project', () => {
  test('passes, and says what it checked', () => {
    const result = validateCms();
    expect(result.output).toContain('CMS config OK — public/admin/config.yml');
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toMatch(new RegExp(`Sveltia CMS ${pinnedScript().version.replace(/\./g, '\\.')}, pinned with an integrity hash`));
    expect(result.stdout).toMatch(/saves go to "master", the branch \.github\/workflows\/deploy\.yml deploys/);
    expect(result.stdout).toMatch(/9 kinds of content, \d+ fields match the schema/);
    expect(result.stdout).toMatch(/\d+ content files, each editable in exactly one place/);
    expect(result.stdout, 'no content value is refused by the form today').not.toContain('NOTE');
  });

  test('is part of `npm run build`, before the site is built', () => {
    const scripts = (JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['validate:cms']).toBe('tsx scripts/validate-cms-config.ts');
    const steps = (scripts.build ?? '').split('&&').map((step) => step.trim());
    expect(steps).toContain('npm run validate:cms');
    expect(steps.indexOf('npm run validate:cms'), 'the config is checked before vite builds anything').toBeLessThan(steps.indexOf('vite build'));
    expect(steps.indexOf('npm run validate:content')).toBeLessThan(steps.indexOf('vite build'));
  });

  test('the config rewritten by the test harness still passes (so a failing case is the case, not the harness)', () => {
    const result = runCase({ name: 'unchanged', config: () => undefined, expect: [] }, 'unchanged');
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain('CMS config OK');
  });

  test('the branch is named in one place of each file and they agree', () => {
    const config = configObject();
    const branch = backend(config).branch;
    expect(deployBranches(readFileSync(deployPath, 'utf8'))).toEqual([branch]);
    expect(configText().match(/^\s*branch:/gm) ?? [], 'config.yml names the branch once').toHaveLength(1);
    expect(backend(config).repo).toBe('patel24kishan/My-Portfolio');
    expect(config.media_folder).toBe('public/uploads');
    expect(config.public_folder).toBe('/uploads');
  });
});

test.describe('validate:cms rejects a broken setup', () => {
  for (const [index, testCase] of CASES.entries()) {
    test(`${String(index + 1).padStart(2, '0')} ${testCase.name}`, () => {
      const result = runCase(testCase, `case-${index + 1}`);
      expect(result.status, `exit code — output was:\n${result.output}`).toBe(1);
      expect(result.stderr).toContain('CMS config check failed');
      expect(result.stderr).toContain('Nothing was deployed.');
      expect(result.stdout, 'a failing run never prints the OK line').not.toContain('CMS config OK');
      for (const expected of testCase.expect) expect(result.output).toMatch(expected);
    });
  }

  test('a missing file is reported, not crashed on', () => {
    const copy = copyProjectInputs('missing');
    const result = validateCms(['--config', path.join(copy.dir, 'nope.yml'), '--html', copy.html, '--deploy', copy.deploy, '--content', copy.content]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/nope\.yml\n\s+where:\s+\(file\)\n\s+problem: was not found/);
  });

  test('an unknown argument is a usage error', () => {
    const result = validateCms(['--confg', 'x']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown argument: --confg');
  });
});

test.describe('content the form would refuse is a note, never a failure', () => {
  test('a hand-edited address with a user name and password', () => {
    const copy = copyProjectInputs('note');
    const file = path.join(copy.content, 'links', 'github.json');
    const link = JSON.parse(readFileSync(file, 'utf8')) as Dict;
    link.url = 'https://user:secret@example.com/profile';
    writeFileSync(file, `${JSON.stringify(link, null, 2)}\n`, 'utf8');
    const result = validateCms(['--config', copy.config, '--html', copy.html, '--deploy', copy.deploy, '--content', copy.content]);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain('CMS config OK');
    expect(result.stdout).toMatch(/NOTE — 1 content value the dashboard would refuse as typed today/);
    expect(result.stdout).toMatch(/links\/github\.json › url/);
    expect(result.stdout).toContain('nothing is blocked');
  });
});

// ---------------------------------------------------------------------------------------
// The patterns themselves, against the schema's own functions
// ---------------------------------------------------------------------------------------

test.describe('form patterns behave like the schema rules', () => {
  const model = readCmsConfig(configText());

  function find(targetLabel: string, ...names: string[]): FieldNode {
    const target = model.targets.find((candidate) => candidate.label === targetLabel);
    let list2: FieldNode[] | undefined = target?.fields;
    let node: FieldNode | undefined;
    for (const name of names) {
      node = list2?.find((candidate) => candidate.name === name);
      list2 = node?.fields;
    }
    if (!node) throw new Error(`no field ${targetLabel} › ${names.join(' › ')}`);
    return node;
  }

  /** Verdict of the form for a value the schema function would see after the form's trim. */
  const table: Array<{ title: string; field: FieldNode; schema: (value: string) => boolean; image?: boolean }> = [
    { title: 'link address (links.url)', field: find('Links', 'url'), schema: isLinkUrl },
    { title: 'project button address', field: find('Projects', 'links', 'url'), schema: isLinkUrl },
    { title: 'resume link', field: find('Pages › Game page', 'resumeUrl'), schema: isLinkUrl },
    { title: 'certificate link', field: find('Certificates', 'url'), schema: isLinkUrl },
    { title: 'video address', field: find('Projects', 'videoUrl'), schema: isWebUrl },
    { title: 'project hover text', field: find('Projects', 'hoverText'), schema: (value) => countWords(value) <= MAX_HOVER_WORDS },
    { title: 'tab hover text', field: find('Site settings', 'categories', 'hoverWithoutVideo'), schema: (value) => countWords(value) <= MAX_HOVER_WORDS },
    { title: 'short name', field: find('Projects', 'slug'), schema: (value) => value !== '' && isSlug(value) },
    { title: 'tab id', field: find('Site settings', 'categories', 'id'), schema: (value) => isSlug(value) && value !== 'all' },
    { title: 'start date', field: find('Experience', 'startDate'), schema: isYearMonth },
    { title: 'screenshot image', field: find('Projects', 'screenshots', 'src'), schema: isAssetPath, image: true },
    { title: 'profile photo', field: find('Pages › Software page', 'photo'), schema: isAssetPath, image: true },
    { title: 'company logo', field: find('Experience', 'logo'), schema: isAssetPath, image: true },
    { title: 'badge image', field: find('Certificates', 'image'), schema: isAssetPath, image: true },
    { title: 'site logo', field: find('Site settings', 'logo'), schema: isAssetPath, image: true },
    { title: 'resume link of one tab (game page)', field: find('Pages › Game page', 'tabResumes', 'url'), schema: isWebUrl },
    { title: 'resume link of one tab (software page)', field: find('Pages › Software page', 'tabResumes', 'url'), schema: isWebUrl },
  ];

  for (const row of table) {
    test(`${row.title}: same verdict as the schema on every sample`, () => {
      expect(Array.isArray(row.field.raw.pattern), 'the field has a pattern').toBe(true);
      const disagreements: string[] = [];
      let compared = 0;
      for (const sample of TEXT_SAMPLES) {
        if (row.image && BARE_UPLOAD_NAME.test(sample.trim())) continue;
        compared += 1;
        const form = formAcceptsText(row.field, sample);
        const schema = row.schema(sample.trim());
        if (form !== schema) disagreements.push(`${JSON.stringify(sample)}: form ${form ? 'accepts' : 'refuses'}, schema ${schema ? 'accepts' : 'rejects'}`);
      }
      expect(disagreements).toEqual([]);
      expect(compared).toBeGreaterThan(60);
    });
  }

  test('address fields are stricter than the schema only for addresses that carry credentials', () => {
    const link = find('Links', 'url');
    for (const value of ['https://user:secret@example.com/', 'https://user@example.com/']) {
      expect(isLinkUrl(value), `${value}: the schema accepts it`).toBe(true);
      expect(formAcceptsText(link, value), `${value}: the form refuses it`).toBe(false);
    }
  });

  test('image fields accept what an upload looks like before and after saving', () => {
    const image = find('Projects', 'screenshots', 'src');
    for (const value of ['my-shot-1-final.webp', 'screenshot.png', '/uploads/my-shot-1-final.webp', 'https://example.com/a.png', '/images/profile.jpg']) {
      expect(formAcceptsText(image, value), value).toBe(true);
    }
    for (const value of ['not a url', 'example.com/a.png', 'ftp://example.com/a.png', 'My Shot.PNG', '//example.com/a.png']) {
      expect(formAcceptsText(image, value), value).toBe(false);
    }
  });

  test('a pattern is read the way Sveltia reads it', () => {
    expect(parsePattern('^[a-z]+$')?.test('abc')).toBe(true);
    expect(parsePattern('/^[a-z]+$/i')?.test('ABC')).toBe(true);
    expect(parsePattern('/^[a-z]+$/gi')?.flags, 'the g flag is dropped').toBe('i');
    expect(parsePattern('^(unclosed')).toBeUndefined();
    expect(parsePattern('')).toBeUndefined();
    expect(parsePattern(42)).toBeUndefined();
  });

  test('every existing content value passes its form field (so every item can be saved as it is)', () => {
    const result = checkCmsConfig({
      configText: configText(),
      htmlText: htmlText(),
      deployText: readFileSync(deployPath, 'utf8'),
      contentDir,
      adminFiles: readdirSync(adminDir),
    });
    expect(result.problems).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.summary.kinds).toBe(contentKinds().length);
    expect(result.summary.contentFiles).toBeGreaterThan(0);
  });

  test('the logo: an image field and a description, right after the logo letters, set up like the profile photo', () => {
    const siteFields = model.targets.find((candidate) => candidate.label === 'Site settings')?.fields ?? [];
    expect(siteFields.map((entry) => entry.name).slice(0, 5)).toEqual(['name', 'monogram', 'logo', 'logoAlt', 'email']);
    const logo = find('Site settings', 'logo');
    const photo = find('Pages › Game page', 'photo');
    expect(logo.widget).toBe('image');
    expect(logo.raw.required).toBe(false);
    expect(logo.raw.default).toBe('');
    expect(logo.raw.pattern, 'the same pattern and message as the profile photo').toEqual(photo.raw.pattern);
    expect(String(logo.raw.hint)).toMatch(/logo letters instead/);
    const alt = find('Site settings', 'logoAlt');
    expect(alt.widget).toBe('string');
    expect(alt.raw.required).toBe(false);
    expect(alt.raw.default).toBe('');
    // An empty logo and the uploaded form of a picture are both saved values the schema takes.
    for (const value of ['', '/uploads/logo.webp', '/images/logo-96.webp', 'https://example.com/logo.png']) {
      expect(formAcceptsText(logo, value), value).toBe(true);
      expect(isAssetPath(value), value).toBe(true);
    }
  });

  test('links: "Footer order" sits right after the hero position, and each hint says which place it moves', () => {
    const names = (model.targets.find((candidate) => candidate.label === 'Links')?.fields ?? []).map((entry) => entry.name);
    expect(names.slice(names.indexOf('order'), names.indexOf('order') + 2)).toEqual(['order', 'orderFooter']);
    const hero = find('Links', 'order');
    const footer = find('Links', 'orderFooter');
    expect(footer.raw.label).toBe('Footer order');
    for (const node of [hero, footer]) {
      expect(node.widget).toBe('number');
      expect(node.raw.value_type).toBe('int');
      expect(node.raw.required).toBe(true);
      expect(node.raw.default).toBe(0);
    }
    expect(String(hero.raw.hint)).toMatch(/next to your name/);
    expect(String(hero.raw.hint)).toMatch(/footer has its own order/i);
    expect(String(footer.raw.hint)).toMatch(/footer/);
    expect(String(footer.raw.hint)).toMatch(/separate from the order at the top of the\s+page/);
  });

  test('pages: "Resume for a specific tab" is the same list on both pages — a tab choice from Site settings, a link, an optional label', () => {
    const projectTab = find('Projects', 'category');
    const shapes = ['Pages › Game page', 'Pages › Software page'].map((label) => {
      const names = (model.targets.find((candidate) => candidate.label === label)?.fields ?? []).map((entry) => entry.name);
      expect(names.slice(names.indexOf('resumeLabel'), names.indexOf('resumeLabel') + 3), label).toEqual(['resumeLabel', 'tabResumes', 'defaultTab']);

      const list2 = find(label, 'tabResumes');
      expect(list2.widget).toBe('list');
      expect(list2.raw.required).toBe(false);
      expect(list2.raw.default).toEqual([]);
      expect(String(list2.raw.hint)).toContain('Leave empty to use the main resume on every tab.');
      expect((list2.fields ?? []).map((entry) => entry.name)).toEqual(['tab', 'url', 'label']);

      // The tab choice is generated from Site settings exactly like the project's "Tab" choice.
      const tab = find(label, 'tabResumes', 'tab');
      expect(tab.widget).toBe('relation');
      expect(tab.raw.required).toBe(true);
      for (const key of ['collection', 'file', 'value_field', 'display_fields', 'search_fields']) {
        expect(tab.raw[key], `${label}: ${key}`).toEqual(projectTab.raw[key]);
      }

      const url = find(label, 'tabResumes', 'url');
      expect(url.raw.required).toBe(false);
      expect(url.raw.default).toBe('');
      expect(url.raw.pattern, 'the web-address pattern of the video field').toEqual(find('Projects', 'videoUrl').raw.pattern);
      const text = find(label, 'tabResumes', 'label');
      expect(text.raw.required).toBe(false);
      expect(text.raw.default).toBe('');
      return JSON.stringify(list2.raw);
    });
    expect(shapes[0], 'the two pages offer the same list').toBe(shapes[1]);
  });

  test('the admin folder holds exactly the files the page needs', () => {
    expect(readdirSync(adminDir).sort()).toEqual(['config.yml', 'index.html', 'preview-logic.js', 'preview.css', 'preview.js', 'slug-guard.js']);
  });
});
