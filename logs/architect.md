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
