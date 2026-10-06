/**
 * Content gate — `npm run validate:content`.
 *
 * Reads every file under /content, checks it against the schema and the cross-file rules,
 * prints one readable block per problem (file, field, reason) and exits with code 1 when
 * anything is wrong. CI runs it before every deploy, so a bad save from the admin blocks the
 * deploy instead of breaking the live site.
 *
 * Values that were only tidied while reading (an empty optional field read as its default,
 * a blank list entry dropped) are printed as a NOTE. A note never changes the exit code.
 *
 * Usage: tsx scripts/validate-content.ts [--dir <content folder>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssues, formatNotes, loadContent } from './lib/load-content';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inGitHubActions = process.env.GITHUB_ACTIONS === 'true';

function parseArgs(argv: readonly string[]): { dir: string } {
  let dir = path.join(repoRoot, 'content');
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      const value = argv[i + 1];
      if (!value) throw new Error('--dir needs a folder path');
      dir = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { dir };
}

/** One line for the GitHub Actions summary page. */
function annotation(level: 'error' | 'notice', label: string, file: string, title: string, message: string): string {
  const location = file.startsWith('(') ? '' : `file=${label}/${file},`;
  return `::${level} ${location}title=${title}::${message.replace(/\r?\n/g, ' ')}`;
}

function main(): number {
  let dir: string;
  try {
    ({ dir } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: tsx scripts/validate-content.ts [--dir <content folder>]');
    return 2;
  }

  const label = path.relative(repoRoot, dir).split(path.sep).join('/') || '.';
  const displayLabel = label.startsWith('..') || path.isAbsolute(label) ? dir : label;
  const result = loadContent(dir);

  // Notes first or last, they never decide the outcome.
  const printNotes = (): void => {
    if (result.notes.length === 0) return;
    console.log(`\n${formatNotes(result.notes, displayLabel)}`);
    if (inGitHubActions) {
      for (const note of result.notes) {
        console.log(annotation('notice', displayLabel, note.file, 'Content tidied', `${note.field}: ${note.message}`));
      }
    }
  };

  if (!result.ok) {
    console.error(formatIssues(result.issues, displayLabel));
    if (inGitHubActions) {
      for (const issue of result.issues) {
        console.error(annotation('error', displayLabel, issue.file, 'Content check', `${issue.field}: ${issue.message}`));
      }
    }
    console.error('Nothing was deployed. Fix the fields above (in the admin or in the file) and save again.');
    printNotes();
    return 1;
  }

  const { content } = result;
  const live = (items: readonly { published: boolean }[]): string => {
    const published = items.filter((item) => item.published).length;
    return published === items.length ? `${items.length}` : `${items.length} (${published} published)`;
  };
  console.log(
    [
      `Content OK — ${displayLabel}`,
      `  site settings: 1, tracks: ${content.tracks.length}, categories: ${content.site.categories.length}`,
      `  projects: ${live(content.projects)}`,
      `  experience: ${live(content.experience)}`,
      `  skill groups: ${live(content.skills)}`,
      `  links: ${live(content.links)}`,
      `  education: ${live(content.education)}`,
      `  certificates: ${live(content.certificates)}`,
    ].join('\n'),
  );
  printNotes();
  return 0;
}

process.exitCode = main();
