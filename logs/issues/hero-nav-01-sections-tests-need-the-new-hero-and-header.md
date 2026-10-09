# Seven tests in the sections agent's files fail (or are unsteady) with the motion hero and header

- Raised by: hero-nav
- Date: 2026-10-09
- Area / owner affected: sections (tests/pages/sections.spec.ts, tests/pages/projects.spec.ts) / architect
- Severity: bug (tests only; no page defect found)
- Status: open

## What happened

With the motion hero and header merged on top of the sections work, the whole dev suite
(`PW_PORT=5186 npx playwright test`) has 14 or 15 failures in two files that are not mine to edit (final run: 15 failed / 1594 passed
/ 87 skipped, all 15 listed here; in the run before it the hover test below passed). None is a page defect; each is a test that still assumes the old hero or the
old header:

| Test (both pages unless noted) | Project | Why it fails now |
|---|---|---|
| `sections.spec.ts` "the footer links follow the footer order and the hero buttons the hero order" | desktop + mobile (4) | asserts `#about [data-hero-link]`; the locked boards removed the hero link buttons |
| `sections.spec.ts` "has the contact block and the credit lines, and no section links" | mobile (2) | expects one `switch` on the page; on phones the theme toggle is inside the menu, so none is on show until the menu opens |
| `sections.spec.ts` "the footer has no theme toggle; the one in the nav switches the theme" | mobile (2) | same: clicks the bar's switch, which a phone does not have |
| `projects.spec.ts` "the title is on the left and the square tabs on the right…" | mobile (2) | the hero is one viewport tall, so Projects is below the fold and its title is measured while it still waits for its reveal (`transform: translateY(28px)`), 11px over the tabs. Measured after the entrance it is 16px clear |
| `projects.spec.ts` "changing the tab changes the address and the cards, keeps the scroll position…" | desktop + mobile (4) | `#projects.scrollIntoViewIfNeeded()` now centres the tall section, which puts the tabs above the viewport; Playwright then scrolls to reach the tab it clicks, and that scroll is what the test sees. With the tabs in view the position is kept (tests/pages/hero.spec.ts checks exactly that and passes) |
| `projects.spec.ts` "shows the hover text on hover and on keyboard focus" | desktop (1) | passed in one full run, failed in the other and 4 of 4 alone: the card is hovered while the smooth scroll and its entrance are still moving it, so the pointer loses it |

## What I need / suggest

`logs/issues/hero-nav-01-sections-tests.patch` (a `git diff`, apply with `git apply`) changes only
those tests. I applied it in my worktree, ran `tests/pages/projects.spec.ts` and
`tests/pages/sections.spec.ts` on both projects (153 passed, 6 skipped, and the hover test 4 of 4
after its part of the patch), and then restored both files, because they are not mine.
Nothing in it weakens a check: the hero-link assertions become "no hero link buttons" (the new
design), the phone variants open the menu to reach the toggle, and the other three wait for the
section to come to rest before measuring.

## Resolution (architect)
