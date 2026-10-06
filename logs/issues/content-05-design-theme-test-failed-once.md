# A design theme test failed once in three whole-suite runs (page reloaded mid-test)

- Raised by: content
- Date: 2026-10-06
- Area / owner affected: design
- Severity: note
- Status: open

## What happened
Whole suite, `PW_PORT=5181 npx playwright test`, three runs on 2026-10-06:

| Run | Result |
|---|---|
| 1 | 366 passed, 2 skipped, 0 failed |
| 2 | 365 passed, 2 skipped, **1 failed** |
| 3 (retry, 20 s later) | 366 passed, 2 skipped, 0 failed |

The failure in run 2:

```
[mobile] › tests\design\theme.spec.ts:29:3 › theme toggle › persists the choice in localStorage["kk-theme"] across a reload
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
   at design\helpers.ts:33
   31 |   await page.goto(`${KIT_PATH}?track=${track}`);
   32 |   await page.locator(`main[data-testid="kit"][data-track="${track}"]`).waitFor();
 > 33 |   await page.evaluate(() => document.fonts.ready);
```

The page navigated or reloaded while `openKit()` was waiting for the fonts. I did not find the
trigger. Nothing in `tests/content` writes inside the repository during a run (temp folders only),
and I did not touch `content/` during run 2. Things that do reload a page on a dev server in this
shared checkout:

- another agent saving a source file while the run is in progress (Vite hot update / full reload);
- Vite re-optimising dependencies on a cold cache;
- any change under `content/`: the content plugin sends a full reload on purpose
  (`scripts/lib/content-plugin.ts`, `hotUpdate`). I re-ran the migration with `--force` once, earlier
  (about 17:50), which rewrote all 44 content files and will have reloaded every dev server that
  was running at that moment.

The 2 skipped tests are design's own conditional skips
(`tests/design/primitives.spec.ts:81` on desktop, `:60` on mobile).

## What I need / suggest
Design: consider making `openKit()` tolerant of one reload (for example wait for the fonts with
`page.waitForFunction(() => document.fonts.status === 'loaded')`, which survives a navigation,
instead of `page.evaluate(() => document.fonts.ready)`). Not reproduced after the retry, so this is
a robustness note, not a confirmed bug.

## Resolution (architect)
Resolved, 2026-10-06. Cause: agents sharing one checkout — another agent's file save (or the content rewrite at about 17:50) reloaded the dev server mid-test. Not a defect in the theme code. Actions: Playwright output is now per port (infra); phase 2 agents each work in their own git worktree so one agent's edits cannot reload another's dev server; the QA agent will harden openKit() against a reload. Status: closed.
