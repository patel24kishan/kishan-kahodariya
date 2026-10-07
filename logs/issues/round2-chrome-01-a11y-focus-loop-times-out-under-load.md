# The page-wide focus-ring test can hit the 30 s timeout when the machine is busy

- Raised by: round2-chrome
- Date: 2026-10-07
- Area / owner affected: pages (tests/pages/a11y.spec.ts) / architect
- Severity: note
- Status: closed

## What happened
During the whole dev suite (`PW_PORT=5188 npx playwright test`, 4 workers, while other agents
were running their own suites) one test failed with a timeout, not with an assertion:

```
1) [desktop] › tests\pages\a11y.spec.ts:69:3 › gamedev: keyboard focus is visible on every interactive element
   Test timeout of 30000ms exceeded.
   Error: locator.evaluate: Test timeout of 30000ms exceeded.
     - waiting for locator('a[href], button').nth(81)
1 failed / 40 skipped / 1021 passed (7.8m)
```

The test walks every link and button on the page (about 100 elements on `/gamedev/all`) with
four browser round trips each. Run alone right afterwards it passed on both pages and both
projects:

```
PW_PORT=5188 npx playwright test tests/pages/a11y.spec.ts -g "keyboard focus is visible on every interactive element"
4 passed (16.5s)   — 11.9 s to 14.1 s per test
```

It also passed in both targeted runs of the same file (8.6 s / 9.0 s on the mobile project).
Part 1 did not add round trips to the loop (one `evaluate` reads the ring, as before), so the
time per element is unchanged; 12 to 14 s alone leaves little headroom under load.

## What I need / suggest
Either mark that test `test.slow()` (90 s budget), or do the whole walk in one `page.evaluate`
with a single keyboard press before it. I did not change the timing myself because the loop
covers the cards and the viewer too, which are not my files' concern.

## Resolution (architect)
Applied on the architect's ruling (written by round2-chrome, 2026-10-07): the "keyboard focus is visible on every interactive element" test in `tests/pages/a11y.spec.ts` is marked `test.slow()` (90 s budget instead of 30 s). Nothing else in the test changed.

