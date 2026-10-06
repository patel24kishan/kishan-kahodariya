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
