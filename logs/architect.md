# Architect log

## 2026-10-06 — Phase 0: foundation

- Repo initialised in place from `patel24kishan/My-Portfolio`, branch `redesign/v2` created from `Deploy`. Nothing pushed.
- Old Create React App source removed on this branch. Kept: `legacy/constants.js` (migration source), the three images (moved to `public/images/`), favicon and manifest files.
- Installed: react 19, react-dom, react-router-dom 7, zod 4, vite 8, @vitejs/plugin-react, typescript 7, tsx, @playwright/test 1.63 (+ Chromium), @axe-core/playwright, yaml, @fontsource-variable/inter.
- Wrote the contract: `ARCHITECTURE.md`, `src/content/types.ts`, the content API with a temporary seed (`src/content/index.ts`), placeholders `src/pages/TrackPage.tsx` and `src/dev/Kit.tsx`, a baseline `playwright.config.ts`.
- Verified: `npx tsc --noEmit` passes; `npx vite build` succeeds; `PW_PORT=5180 npx playwright test` → 2 passed (desktop, mobile).

## Decisions

- Hosting: GitHub Pages (owner confirmed). Netlify's free plan caps production deploys at about 20 a month, which conflicts with "every dashboard save is a deploy".
- Admin tool: Sveltia CMS with the GitHub backend and token sign-in (no server).
- Prerender: custom script (server bundle + `renderToString` per route), no extra dependency.
- Tests: Playwright CLI, one dev port per agent (`PW_PORT`), build tests separate.

## 2026-10-06 — Phase 1 launched

Foundation committed locally (`7ebbd47`, `493cc05`). Three builder agents started in parallel, each with its own files and test port:

| Agent | Model | Scope | Dev port |
|---|---|---|---|
| content | Opus 5.5 | schema, migration from `legacy/constants.js`, content validation, `virtual:content` plugin, loader | 5181 |
| design | Fable 5.1 | tokens, light/dark themes, sun/moon toggle, UI primitives, kit page | 5182 |
| infra | Opus 5.5 | routing, prerender, GitHub Pages emulation server, Playwright build config, deploy workflow, README | 5183 / 4183 |

Phase 2 (pages, admin) starts after the architect has reviewed and integrated phase 1.

## 2026-10-06 — design agent reported (phase 1)

- Delivered: tokens (dark + derived light, both accents), theme provider and sun/moon toggle, UI primitives, kit page, 68 design test runs.
- Agent's own results: `tsc` clean; whole suite `366 passed, 2 skipped, 0 failed` on port 5182. To be re-run by the architect once content and infra finish.
- Rule adopted from its report: accent text on the canvas uses `--color-accent-ink`, accent borders use `--color-accent-border`, `--color-accent` is a fill only; the footer band carries `data-on-accent`; muted text never sits on `--color-surface-raised` (4.4:1).
- Conflict found and resolved: parallel Playwright runs shared `test-results/` and deleted each other's traces. Asked infra (owner of the Playwright configs) to derive `outputDir` from the port.
- Open issue from design: `logs/issues/design-01-content-migration-report-mismatch.md` (one transient failure in a content test) — to check when the content agent reports.

## 2026-10-06 — content and infra reported (phase 1)

- content: 44 content files migrated (22 projects: 21 published + 1 unpublished; the brief's "20" was my miscount), schema, validator, `virtual:content` plugin, loader, 158 content test runs. `docs/migration-report.md` lists 37 items for the owner.
- infra: routing, hydration entries, head management, prerender (each route written as `a/b.html` and `a/b/index.html`), GitHub Pages emulation server, dev suite 416 passed / 2 skipped, build suite 194 passed (agent's own runs), deploy and CI workflows written but never run.
- Rulings: see each file in `logs/issues/` (10 issues: 5 content, 1 design, 4 infra). Main ones: optional fields are normalised instead of failing validation (content agent resumed to apply); phase 2 agents work in separate git worktrees; the owner's K24 mark stays as the site icon; production branch is `master`.
- Design system reviewed visually by the architect (kit in dark/game, light/game, light/softdev): accepted.

## 2026-10-06 — Phase 1 accepted, phase 2 launched

- Architect regression on the integrated phase 1: `npx tsc --noEmit` exit 0; `npm run validate:content` exit 0; `PW_PORT=5180 npx playwright test` → 444 passed, 2 skipped (design's hover/touch counterparts), 0 failed; `PW_BUILD_PORT=4180 npx playwright test -c playwright.build.config.ts` → 194 passed. Committed locally as `46cac14`.
- GitHub Action majors in the workflows checked against each action's latest release (checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5, upload-artifact v7): all current. The workflows themselves have never run.
- Security check: `PUT /repos/patel24kishan/My-Portfolio/contents/unauthenticated-write-check.txt` with no credentials → HTTP 401 "Requires authentication"; a follow-up GET for that file → 404 (nothing was written). GitHub, not the admin page, is what refuses the write.
- Icons: the owner's K24 mark (was `favicon.ico`, really a 512px PNG) converted to `favicon-64.png`, `icon-192.png`, `icon-512.png`; the two default React logo files removed.
- Profile photo: the 2329px, 647 KB JPEG is kept; `profile-640.webp` (37 KB) and `profile-320.webp` (12 KB) generated from it; both pages now point at the 640px file.
- Ruling on the content agent's question: a missing choice field falls back to its neutral option (`audience` both, `emphasis` none, link `kind` other, link `icon` link). Accepted.
- Phase 2 agents, each in its own git worktree: `pages` (Fable 5.1, ports 5184/4184) builds the real page, nav, footer and media viewer; `admin` (Opus 5.5, ports 5185/4185) builds the Sveltia CMS dashboard, its config validator and the owner guide.

## 2026-10-07 — admin dashboard merged

- Both phase-2 agents were stopped overnight by the account's usage limit and resumed; no work was lost (both worktrees intact).
- admin handed in: Sveltia CMS 0.230.0 pinned with an integrity hash, token-only sign-in, `config.yml` (9 content kinds, 112 fields), `validate:cms` wired into the build, slug guard, side-by-side content preview, owner guide, tests. New items default to unpublished.
- Architect review: read `public/admin/index.html` and the three scripts (no network, storage or token access). Squash-merged the agent's branch.
- Architect regression after the merge: `tsc` exit 0; `validate:content` exit 0; `validate:cms` exit 0; `PW_PORT=5180 npx playwright test` → 714 passed, 28 skipped (26 dashboard-driving tests skipped on the mobile project by design and run on desktop; 2 design hover/touch counterparts), 0 failed; `PW_BUILD_PORT=4180 npx playwright test -c playwright.build.config.ts` → 218 passed.
- Proven without a token: every one of the 44 content files survives a save through the real dashboard (39 byte-identical, 5 lose only leading/trailing spaces in a description); new items are written complete and as drafts; bad values are refused by the form.
- Not verifiable without the owner's token: sign-in, a real commit on `master`, the deploy run, an uploaded image being served. Listed in `docs/admin-guide.md` section 16.
- Rulings on admin-01 … admin-05: see each issue file.

## 2026-10-07 — pages merged

- pages handed in: the real `TrackPage` (nav with phone menu, hero, project tabs and cards, media viewer with URL state and YouTube embedding, experience, row-style skills, education and certificates, accent footer and credit strip), small additive design-system changes, 9 page test files. Squash-merged with no conflicts on top of the admin commit.
- First two full dev-suite runs after the merge failed at random (1 failure, then 4 different ones) with Playwright's default of 10 workers; each failing test passed alone. With 4 workers the suite passed twice in a row. `playwright.config.ts` now sets `workers` to 4 (override with `PW_WORKERS`). This is a test-harness load problem, not a page defect.
- Architect regression after the merge: `tsc` exit 0; both validators exit 0; `PW_PORT=5180 npx playwright test` → 988 passed, 38 skipped, 0 failed (two consecutive runs); `PW_BUILD_PORT=4180 npx playwright test -c playwright.build.config.ts` → 218 passed.
- The 38 skips: 26 dashboard-driving tests on the mobile project (run on desktop), 2 design hover/touch counterparts, 10 page tests whose case does not exist in today's content (no featured project, no project without a screenshot, no remote job, hover/badge counterparts).
- Visual review by the architect from `docs/screenshots/`: game page dark desktop, software page light phone, viewer on a screenshot. Layout matches the approved sketches. Several hotlinked project images are dead or blocked and show the designed fallback, as expected.
- Rulings on pages-01 … pages-03: see each issue file.

## 2026-10-07 — Round 2: seven owner changes after review

The owner reviewed the local build and asked for seven changes. A before/after board ("Requested changes: now and after") was added to the design canvas and approved with three notes (avatar logo, slimmer toggle, hover overlay kept on the sliding images).

| # | Change | Decision |
|---|---|---|
| 1 | Nav "KK" text becomes a logo | The avatar from the old site's nav (`public/images/logo-cloud.png`) on a white disc, 40px. New `site.logo` / `site.logoAlt`; empty logo falls back to the monogram. |
| 2 | "Play" buttons highlighted | Project links of kind `play` use the accent button, like "Gameplay". |
| 3 | One icon on "View Code" | Links of kind `code` always use the GitLab glyph, whatever the host. |
| 4 | Smaller theme toggle; swap on phones | Pill 48×22 (was 80×36) in nav and footer, hit area stays 44px; under 768px the order is menu button, then toggle. |
| 5 | Footer "Connect" order | New `orderFooter` on links (email 10, itchio 20, linkedin 30, github 40, blog 50). `order` still drives the hero, which does not change. |
| 6 | Card images slide | 3s auto-advance for projects with 2+ screenshots, dots, pause on hover/focus, hover overlay kept, off under reduced motion. No project has 2+ screenshots today, so it is proven on a kit fixture. |
| 7 | Resume per tab | New `tabResumes` on each track and `getResume(track, tab)`. The game track ships an empty "unreal" entry for the owner to fill; empty falls back to the main resume. |

Three builders, each in its own git worktree from the start:

| Agent | Model | Scope | Ports |
|---|---|---|---|
| round2-content | Opus 5.5 | contract fields, schema, selectors, content values, dashboard config, owner guide (changes 1, 5, 7 data side) | 5186 / 4186 |
| round2-cards | Fable 5.1 | project card buttons, icon and image slider (changes 2, 3, 6) | 5187 / 4187 |
| round2-chrome | Opus 5.5 | part 1: toggle and phone nav order (change 4); part 2 after the content merge: nav logo, hero resume per tab, footer order tests (changes 1, 5, 7 UI side) | 5188 / 4188 |

## 2026-10-07 — Round 2 merged

- All three builders finished; each branch was squash-merged in order: cards (`6ba2fac`), content (`89c2656`), chrome (this commit). No merge conflicts. The architect added `tabResumes: []` to two hand-built page test fixtures at the content merge (round2-content-01).
- Architect regression on the merged tree: `npx tsc --noEmit` exit 0; `validate:content` and `validate:cms` exit 0 (123 dashboard fields, was 112); `PW_PORT=5180 npx playwright test` → 1294 passed, 60 skipped, 0 failed; `PW_BUILD_PORT=4180 npx playwright test -c playwright.build.config.ts` → 244 passed.
- Visual review from `docs/screenshots/r2-*.png`: logo on its white disc in the nav (desktop and phone), slim toggle, phone order menu then toggle, accent Play buttons, one View Code icon, footer order on the game page. Matches the approved board.
- Accepted builder decisions: toggle hit area 48×44 with the focus ring on the pill; logo artwork drawn at 28px inside the 40px disc so the round crop does not cut it; the links field label "Position" renamed "Position next to your name"; slide duration 450ms; slider dots move to the bottom-left on touch screens to stay clear of the badge.
- Rulings: round2-content-01 … 04 and round2-chrome-01 closed (see each file). round2-cards-01 (visible pause control for the slider, WCAG 2.2.2) is an open owner decision; nothing moves on the site today because no project has a second screenshot.
- Not provable with today's content: the slider on a real project (fixture only), and a tab's own resume in the built site (the Unreal row is empty until the owner pastes a link; proven on a fixture and with an intercepted content module in dev).
- A resume-to-site content document was produced for the owner by a separate read-only agent in the git-ignored `private/` folder. It is not part of the repo.

## 2026-10-07 — Go-live

- On the owner's instruction ("merge to master and go live"): the owner's local dashboard test edit to `content/experience/astro-game-studio.json` was discarded, and `master` on GitHub was fast-forwarded from `2a4b901` to `856fd93` (`git push origin redesign/v2:master`, no force).
- The Deploy workflow ran for the first time (run 37655330456): build job and deploy job both succeeded, every step green. The repository's Pages source was evidently already able to take a workflow deployment, so the new site went live with this run; the earlier note that a settings switch was still needed turned out not to apply.
- Checked on `https://patel24kishan.github.io/My-Portfolio/` after the run: `/`, `/gamedev`, `/gamedev/unreal`, `/softdev`, `/softdev/webapps`, `/admin/` and the logo return 200; `/gamedev/typo` and an unknown address return 404; the prerendered HTML carries the right title and open tab per route. In Chromium at desktop and Pixel 7 sizes: pages hydrate, a tab click moves to `/gamedev/unreal`, no sideways scroll, the admin page offers only "Sign In Using Access Token". Four console errors on desktop are the known blocked hotlinked project images.
- Still unverified, and only the owner can do it: token sign-in, a real dashboard save, and the deploy that follows it (docs/admin-guide.md, section 16).
- From now on every push to `master` publishes. Work continues on `redesign/v2`; nothing goes to `master` without the owner's word.

## 2026-10-07 — New address live

- The owner renamed the repository to `kishan-kahodariya`; the site is now served at `https://patel24kishan.github.io/kishan-kahodariya/`. The old address returns 404.
- Between the earlier push and this one, `master` received a dashboard commit (`9ce92fe`, "Content: update Files \"site\" +1": the owner's own transparent logo uploaded to `public/uploads/logo-cloud.webp` and `site.logo` pointed at it). That is the first proof that token sign-in, a real dashboard save and a commit on `master` work. The push to master was rejected as a non-fast-forward; the commit was merged into `redesign/v2` (`4695e9b`), not overwritten, then both branches pushed.
- Deploy run 37659305710 on `master`: success. `/`, `/gamedev/unreal`, `/softdev`, `/admin/` and the uploaded logo return 200 at the new address.
- Local remote URL updated to the renamed repository.

## 2026-10-08 — Motion redesign started (branch `redesign/motion-v1`)

- The owner supplied a prompt for an agency hero page (fullscreen looping video, big display type, full-screen phone menu, staggered fade-up) and asked for the site to be re-imagined from it with his own content. Three mockups were approved on the design canvas ("4. Motion redesign"); copies are in `docs/sketches/motion/`. The contract is `docs/motion/MOTION.md`.
- Architect decisions: the stack stays (CSS Modules, no Tailwind); Inter for all type, because the prompt's display font is a demo with an unconfirmed licence; `lucide-react` added for the new glyphs; hero numbers are counted from the content at build time, never invented; the video is the prompt's link, editable in the dashboard, with a poster, a pause control and no autoplay under reduced motion or data saver; the profile photo leaves the hero.
- Three builders in worktrees: motion-content (Opus 5.5; contract fields, `getHeroStats`, poster, dashboard), motion-sections (Fable 5.1; reveal on scroll, Projects, Experience timeline, Skills marquee, Education, Get in touch), motion-chrome (Opus 5.5; part 1 nav and full-screen phone menu, part 2 the hero after the content merge).
- The harness created the three worktrees from `e02d513` (the last pushed commit), not from the local spec commit `d3dbca8`. Each agent was messaged to fast-forward to `redesign/motion-v1` before starting.
