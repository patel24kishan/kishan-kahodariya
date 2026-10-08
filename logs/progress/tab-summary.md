# tab-summary — progress

- 2026-10-08 — Started on `worktree-agent-adba07160f1f86848` at `096e411` (a descendant of
  `e02d513`: two dashboard content commits from `origin/master` on top). `npm ci` run.
- 2026-10-08 — Contract in: `TabResume.summary`, `getSummary(track, tabId)` in the selectors
  and `@/content`, `summary: text` in the row schema (missing/null reads as `""`).
- 2026-10-08 — Page: `TrackPage` passes `getSummary(track, tab)` to `Hero`; the hero renders
  it in the same block (`data-hero-summary`) on every tab.
- 2026-10-08 — Content: `game.json` has an empty row for `unreal` and one for `unity`, each
  with `"summary": ""`. No summary text written. `softdev.json` untouched.
- 2026-10-08 — Dashboard: list renamed "Resume and summary for a specific tab", new text
  field "Summary on this tab" on both pages, preview facts per row, owner guide section.
  `validate:cms` now counts 125 fields (was 123) and 71 text fields (was 69).
- 2026-10-08 — Tests extended: selectors, content validator, plugin, CMS validator, dashboard,
  round trip, preview, hero fixture, real-page hero, build (`chrome.spec.ts`).
- 2026-10-08 — Checks: tsc exit 0; validate:content OK; validate:cms OK; focused dev run
  731 passed / 43 skipped; whole dev suite 1347 passed / 61 skipped; build suite 246 passed.
- 2026-10-08 — Extra check, not committed: the build suite's `chrome.spec.ts` run once over a
  temporary test-only Unreal summary in `game.json`, then the file was restored (see report).
- 2026-10-08 — Finished. One note filed: `logs/issues/tab-summary-01-short-hero-text-recentres.md`.
