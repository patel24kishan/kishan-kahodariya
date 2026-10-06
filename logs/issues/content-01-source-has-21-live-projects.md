# The legacy file has 21 live projects, not 20

- Raised by: content
- Date: 2026-10-06
- Area / owner affected: architect
- Severity: note
- Status: open

## What happened
The task brief says to check the migrated counts against "20 published projects + 1 unpublished".
`legacy/constants.js` actually exports 21 project objects in `projects` (5 with category `unreal`,
11 `unity`, 5 `webapp`), plus the one inside a comment ("Unity Tools"). Counted from the file itself,
not typed by hand:

- `npm run migrate` prints `projects (published) 21 → 21` and `projects (unpublished) 1 → 1`.
- `tests/content/migration.spec.ts` compares the migrated counts with `legacy.projects.length` and with
  the commented-out blocks parsed from the file text.

All 21 + 1 are migrated (22 files under `content/projects/`). Nothing was dropped to reach 20.
The other counts match the brief: 5 experience, 4 skill groups (22 skills), 2 education,
3 certificates, 5 links, 2 tracks, 1 site file.

## What I need / suggest
Nothing to change in the content. If any other document or test assumes 20 published projects,
it should say 21.

## Resolution (architect)
Accepted, 2026-10-06. The source has 21 live projects (5 unreal, 11 unity, 5 webapp) plus the commented-out one; the brief's "20" was the architect's miscount. All 22 are migrated. The owner will be told the corrected number. Status: closed.
