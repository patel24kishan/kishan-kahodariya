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
