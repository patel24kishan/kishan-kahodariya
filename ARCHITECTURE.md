# Portfolio v2 — Architecture and Build Contract

Owner of this file: **the architect** (the main Claude session). Builder agents read it, follow it,
and never edit it. Disagreements and change requests go to `logs/issues/` (see section 9).

## 1. What we are building

A rebuild of Kishan Kahodariya's portfolio (old site: Create React App, one page, content in
`legacy/constants.js`). Decisions already made with the owner:

- **Two public pages, one layout.** The game page and the software page are the same component
  fed different content. `/` shows the game page.
- **Free hosting only.** GitHub Pages, deployed by GitHub Actions, served under `/My-Portfolio/`.
- **Content lives in the repo** as JSON files under `/content`. The owner edits it at `/admin`
  (Sveltia CMS, GitHub backend, token sign-in). A save is a commit; the commit triggers a
  rebuild; the change is live a minute or two later. No database, no server.
- **Nothing from the old site is lost.** Every item in `legacy/constants.js` is migrated.
  Text is never rewritten or invented; anything doubtful is migrated as-is and listed in
  `docs/migration-report.md`.
- The approved sketches are in `docs/sketches/*.dc.html` (open them as plain HTML/text for
  reference: `Main` = game page, `Softdev`, `Viewer`, `Mobile`, `Routes`, `Flows`,
  `SectionOrder`). `DESIGN.md` at the repo root is the visual system for dark mode.

## 2. Stack

Vite 8, React 19, TypeScript 7, React Router 7, zod 4, Playwright 1.63, self-hosted Inter
(`@fontsource-variable/inter`). Styling is **CSS Modules + global design tokens** — no CSS-in-JS,
no UI library, no Tailwind.

These versions are recent. **Check the installed package's types and docs in `node_modules`
before assuming an API from an older version.**

No new dependencies. If you believe one is needed, stop and say so in your report and in
`logs/issues/`; do not run `npm install`.

## 3. Routes

All paths below are relative to the base `/My-Portfolio/`.

| Path | Page | Project tab open |
|---|---|---|
| `/` | game | game default (`unity`) |
| `/gamedev` | game | game default |
| `/gamedev/<tab>` | game | `<tab>` |
| `/softdev` | software | software default (`webapps`) |
| `/softdev/<tab>` | software | `<tab>` |
| `/game` | redirect to `/gamedev` | — |
| `/admin/` | static admin (Sveltia CMS), not part of the React app | — |
| `/__kit` | component showcase, **dev only** | — |

- `<tab>` is a category id (`unreal`, `unity`, `webapps`, later whatever the owner adds) or `all`.
  The list comes from `getTabs()`. **All tabs appear on both pages**; only the default differs.
- An unknown tab falls back to the page's default tab (`resolveTab()`).
- Clicking a tab navigates to `/<track route>/<tab>` (from `/` too) **without scrolling to the top**.
  Tabs are real links (`<a>`), so the address always reflects the open tab.
- **Every route is prerendered to its own HTML file** at build time (`getAllRoutes()`), so a
  hard refresh or a pasted link returns the real page with HTTP 200 on GitHub Pages.
  `404.html` handles everything else.

## 4. Content model

- Types: `src/content/types.ts` (the contract). API: `src/content/index.ts` (`@/content`).
  **Pages, routing and prerender import content only through `@/content`.**
- Files (one JSON file per item, file name = slug):

  ```
  content/site.json
  content/tracks/game.json          content/tracks/softdev.json
  content/projects/<slug>.json
  content/experience/<slug>.json
  content/skills/<slug>.json
  content/links/<slug>.json
  content/education/<slug>.json
  content/certificates/<slug>.json
  ```
- Every field in the types is always present in every file (`""`, `[]`, `false`, `0` when unset),
  so the CMS and the loader never deal with missing keys.
- Asset paths: absolute `https://` URLs, or site-root-relative paths starting with `/`
  (`/images/profile.jpg`, `/uploads/x.webp`). Never store the `/My-Portfolio` base in content.
  Render through `assetUrl()` (`src/lib/paths.ts`).
- Uploaded media goes to `public/uploads/` (CMS `media_folder: public/uploads`,
  `public_folder: /uploads`).
- `hoverText` and the category hover defaults are limited to **4 words**.

### Migration rules (legacy/constants.js → content)

| Legacy | New |
|---|---|
| `Bio.name`, nav/footer name | `site.name = "Kishan Kahodariya"`, `monogram = "KK"` |
| `Bio.roles` | `site.roles` verbatim; track headlines derived: game = "Game Developer", softdev = "Software Engineer" (flag in report) |
| `Bio.description` | `summary` of **both** tracks, verbatim (flag: software summary needs the owner's own text) |
| `Bio.resume_gamedeveloper` / `resume_softwaredeveloper` | `tracks/game.resumeUrl` / `tracks/softdev.resumeUrl` |
| `Bio.github`, `linkedin`, `itchio`, `blog`, `email` | one `links/*.json` each (`email` as `mailto:`); empty ones (`twitter`, `discord`, `facebook`) are skipped and listed |
| `skills[]` | one `skills/*.json` per group, names verbatim; icon URLs dropped (most were wrong) and listed. Emphasis: Game Dev + Programming → `game`; Backend + Cloud → `softdev`. Order game: Game Dev, Programming, Backend, Cloud. Order softdev: Backend, Cloud, Programming, Game Dev |
| `experiences[]` | `desc` → `bullets: [desc]`; `date` → `dateDisplay` verbatim plus best-effort `startDate`/`endDate`/`present`; `img` → `logo`; `skills` → `tags` (exact duplicates removed, listed). Audience: Astro, HelpUpDefend, Xsquad → `game`; IBM, Achievers → `softdev` |
| `projects[]` | `description` → `shortDescription` (`longDescription = ""`); `date` → `dateDisplay`; `image` → `screenshots[0]` with alt `"<title> cover image"` (flag: owner should replace hotlinked stock images); `tags` verbatim minus empty strings; `category` `unreal`/`unity` as-is, `webapp` → `webapps`; audience `unreal`/`unity` → `game`, `webapp` → `softdev`; `github` → link `{label: "View Code", kind: "code"}`; `action` that is a YouTube URL → `videoUrl`; any other `action` → link with the legacy `actionBtn` text as label; orders = legacy position × 10; `featured: false`; `published: true`; `legacyId` kept |
| commented-out "Unity Tools" project | migrated with `published: false` |
| `education[]` | as-is; `img` dropped (stock illustration) and listed |
| `certificate[]` | title, date, image, URL as-is; **`description = ""`** — the legacy text is an unrelated placeholder that contains test login credentials: do not copy it anywhere, not even into the report; just record that it was dropped |

Invalid or empty values (for example `github: "GH"`, a button label with no URL, the malformed
YouTube link, duplicate legacy ids, the duplicated Credly URL, the "HelpUpDefend" spelling,
conflicting dates) are migrated with the value kept or `url: ""`, **never fixed silently and
never dropped**, and each one is listed in `docs/migration-report.md` for the owner.

## 5. Design contract

Follow `DESIGN.md` for dark mode. Additions agreed with the owner:

- **Themes.** `data-theme="dark" | "light"` on `<html>`. First visit follows the system setting;
  the choice is stored in `localStorage["kk-theme"]`. An inline script in `index.html` sets the
  attribute before first paint. `color-scheme` and `<meta name="theme-color">` follow the theme.
- **Accent per page.** `data-track="game" | "softdev"` on the page root.
  Game = `#faff69` (yellow), software = `#7cb2ff` (blue). Text on an accent fill is `#0a0a0a`.
- **Light mode is derived:** off-white canvas, near-black ink. **Yellow is never used as text
  or as a thin border on a light background** (it fails contrast): use it as a fill behind dark
  text. All text meets WCAG AA (4.5:1; 3:1 for 24px+ and for UI borders that carry meaning).
- **Token names (CSS custom properties, defined in `src/styles/tokens.css`):**
  `--color-canvas`, `--color-surface`, `--color-surface-raised`, `--color-hairline`,
  `--color-hairline-strong`, `--color-ink`, `--color-body`, `--color-muted`,
  `--color-accent` (fill), `--color-on-accent`, `--color-accent-ink` (accent-coloured text that
  is legible on the canvas in the current theme), `--color-accent-border`,
  `--color-backdrop` (viewer backdrop, black at 70%),
  `--radius-sm` (8px), `--radius-md` (12px), `--radius-pill`,
  `--space-1…` (4px scale), `--section-gap` (96 / 64 / 48px desktop / tablet / phone),
  `--container-max` (1200px), `--gutter` (40 / 24 / 16px),
  `--font-sans` (Inter Variable), `--font-mono` (system mono stack),
  type scale tokens for display / title / body / caption following `DESIGN.md`, fluid with `clamp()`.
- **Breakpoints:** phone `< 768px`, tablet `768–1023px`, desktop `≥ 1024px`.
  Project cards: 1 / 2 / 3 per row. Touch targets ≥ 44px. No horizontal page scroll at 320px.
- **No shadows.** Radii 8px and 12px. Inter 700 with negative tracking for display text.
- **Motion:** only `opacity` and `transform`, never `transition: all`. A short staggered reveal
  in the hero, the card overlay fade, the viewer fade, the theme-toggle knob slide. Everything is
  disabled under `prefers-reduced-motion: reduce`.

### Page sections, top to bottom

1. **Nav** (sticky, canvas background, hairline below): monogram `KK` linking to the page top,
   section links *About, Projects, Experience, Skills, Education* (anchors), **theme toggle on the
   right**. Under 768px the links collapse behind a menu button.
2. **Hero** (`#about`): name (`h1`), headline in the accent, summary, primary button = resume
   (accent fill, opens in a new tab), then the hero links as outline buttons, profile photo in a
   circle on the right (on top on phones).
3. **Projects** (`#projects`): centred `h2`, a segmented tab control (links), the card grid.
   **Card:** media area is a real `<button>` showing the first screenshot; on hover **and on
   keyboard focus** a semi-transparent dark overlay fades in with a play icon and the hover text
   (`getHoverText()`, max 4 words); on touch devices the text sits as a permanent badge on the
   image. Below: tag chips, title (`h3`), date, short description, then the project's links as
   buttons, plus a filled "Gameplay" button when `videoUrl` is set. `featured` cards get the
   accent border. A tab with no projects shows an empty state.
4. **Media viewer** (opens from the card image or the Gameplay button): a modal dialog over the
   page with a **black 70% backdrop**; close button, project title and "Screenshot 2 of 4";
   the project's links (open in a new tab); the media on a solid dark panel; previous / next
   buttons; a thumbnail strip with the video first. Esc closes, arrow keys move, focus is trapped
   and returns to the opener, the page behind does not scroll, swipe works on touch with the
   buttons as the alternative. YouTube plays inside the viewer (`youtube-nocookie.com` embed,
   created only when shown).
5. **Experience** (`#experience`): one block per job — company, role, date, location / remote,
   bullets (`resolvedBullets`), tag chips.
6. **Skills** (`#skills`): **rows, not cards** — group name on the left, its skills as chips on
   the right, hairline between rows; emphasised groups use the accent for the name and the chip
   borders. On phones the name sits above the chips.
7. **Education and Certificates** (`#education`): two columns on desktop; certificates come
   first when `track.certificatesFirst`.
8. **Footer:** a full-width band **in the accent colour** with near-black text, two columns —
   *Navigate* (the nav links) and *Connect* (footer links as near-black buttons with accent
   text, icon + label) — the theme toggle in the **bottom right**, then a black credit strip
   with accent-coloured text (`site.credit`, one line each).

**Theme toggle:** a pill switch drawn as a small scene — night: navy sky, stars, moon knob on the
right; day: blue sky, clouds, sun knob on the left. It is a real `<button role="switch">` with
an accessible name.

## 6. Engineering rules (all agents)

- **Stay inside your files** (section 7). Never edit another owner's files, `package.json`,
  the lockfile, `ARCHITECTURE.md`, `DESIGN.md` or `src/content/types.ts`.
- **No git commands that change state** (commit, add, stash, checkout, reset, push…).
  The architect commits. Never push, never deploy.
- **SSR-safe code.** Every component is rendered to a string at build time: no `window`,
  `document` or `localStorage` during render or at module top level; use effects.
  Server and first client render must match (no hydration warnings in the console).
- **Base path.** Never hard-code `/My-Portfolio`. Use `import.meta.env.BASE_URL`, the router,
  and the helpers in `src/lib/paths.ts`.
- **TypeScript strict**, no `any`, no `@ts-ignore`. `npx tsc --noEmit` must pass for your files.
- **CSS Modules** next to the component (`Thing.module.css`); colours, radii, spacing and type
  only through tokens.
- **Secrets:** none in the repo, none in the bundle.
- **Web Interface Guidelines** (https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
  — fetch and apply). The ones that matter most here:
  semantic HTML first (`<button>` for actions, `<a>` for navigation, never a clickable `div`);
  `aria-label` on icon-only buttons and `aria-hidden` on decorative icons; visible
  `:focus-visible` styles and no bare `outline: none`; hierarchical headings and a skip link;
  `scroll-margin-top` on anchored sections; images with `alt`, explicit `width`/`height`,
  `loading="lazy"` below the fold; honour `prefers-reduced-motion`; animate only
  `transform`/`opacity`; `…` not `...`; long text must wrap or clamp, flex children need
  `min-width: 0`; empty states for empty lists; URL reflects UI state; `overscroll-behavior:
  contain` in the modal; `touch-action: manipulation`; `color-scheme` and `theme-color` follow
  the theme; no `user-scalable=no`; Title Case button labels.

## 7. Ownership

| Area | Owner | Files |
|---|---|---|
| Contract | architect | `ARCHITECTURE.md`, `src/content/types.ts`, API signatures in `src/content/index.ts`, `package.json` dependencies, `tests/architect/**`, `logs/README.md` |
| Content (phase 1) | `content` | `content/**`, `src/content/**` except `types.ts`, `scripts/migrate-legacy.ts`, `scripts/validate-content.ts`, `scripts/lib/**`, `docs/migration-report.md`, `tests/content/**` |
| Design system (phase 1) | `design` | `src/styles/**`, `src/theme/**`, `src/components/ui/**`, `src/dev/**`, `tests/design/**` |
| Infrastructure (phase 1) | `infra` | `index.html`, `vite.config.ts`, `src/main.tsx` and any `src/entry-*.tsx`, `src/App.tsx`, `src/routes.tsx`, `src/lib/**`, `scripts/prerender.ts`, `scripts/serve-pages.ts`, `playwright.config.ts`, `playwright.build.config.ts`, the `"scripts"` block of `package.json` (only that block), `.github/workflows/**`, `public/404.html`, `public/robots.txt`, `public/manifest.json`, `README.md`, `tests/infra/**`, `tests/build/**` |
| Pages (phase 2) | `pages` | `src/pages/**`, `src/components/layout/**`, `src/components/sections/**`, `src/components/viewer/**`, `tests/pages/**` |
| Admin (phase 2) | `admin` | `public/admin/**`, `scripts/validate-cms-config.ts`, `docs/admin-guide.md`, `tests/admin/**` |
| QA (phase 3) | `qa` | `tests/regression/**`; read-only everywhere else |

Cross-area contracts that already exist as placeholders (keep the exports, props and paths):

| File | Contract | Implemented by |
|---|---|---|
| `src/content/index.ts` | the content API; currently returns a small seed | `content` |
| `scripts/lib/content-plugin.ts` | `contentPlugin()` — Vite plugin providing the virtual module `virtual:content` (content read from disk, validated, unpublished items removed). Already registered in `vite.config.ts`; `infra` must keep it registered | `content` |
| `src/styles/index.css` | the one global stylesheet; the app entry imports it and no other global CSS | `design` |
| `src/theme/index.tsx` | `ThemeProvider`, `useTheme`, `ThemeToggle`; storage key `kk-theme`; the entry wraps the app in `ThemeProvider` | `design` |
| `src/dev/Kit.tsx` | dev-only showcase at `/__kit` (default export) | `design` |
| `src/pages/TrackPage.tsx` | the public page, props `{ track, tab }` (default export) | `pages` |
| `src/lib/paths.ts` | `assetUrl(path)` and route helpers that apply the base path | `infra` |

## 8. Testing

- **Playwright CLI is the test tool.** Every feature you build ships with Playwright specs in
  your `tests/<area>/` folder, covering the desktop and the mobile project.
- Run with your own port so parallel agents never collide:

  | Agent | `PW_PORT` (dev) | build-preview port |
  |---|---|---|
  | architect | 5180 | 4180 |
  | content | 5181 | — |
  | design | 5182 | — |
  | infra | 5183 | 4183 |
  | pages | 5184 | — |
  | admin | 5185 | 4185 |
  | qa | 5186 | 4186 |

  `PW_PORT=5181 npx playwright test tests/content` (bash) — the config starts Vite on that port.
- **Regression rule:** before you report, run the **whole** suite (`PW_PORT=<yours> npx playwright test`),
  not only your folder, plus `npx tsc --noEmit`. A failure in someone else's area is not yours
  to fix: file it in `logs/issues/` and mention it in your report.
- Tests that need a production build (prerender, deep links, 404) live in `tests/build/` and run
  with `playwright.build.config.ts`. Only `infra`, `qa` and the architect run them, because they
  rebuild `dist/`.
- Never weaken or delete a test to make it pass. Never mark something as verified unless you ran it.

## 9. Logs

- `logs/progress/<agent>.md` — your own file. Append a dated line when you start, at each
  milestone and when you finish.
- `logs/issues/<agent>-<nn>-<short-slug>.md` — **one file per issue** (never a shared file, so
  two agents never write the same file). Use it for blockers, bugs found in another area,
  contract change requests, guideline violations you could not fix, and anything the owner must
  decide. Template in `logs/README.md`.

## 10. What to send back

End with a short report: what you built (files), what you verified and how (commands and
results, with pass/fail counts), what is not done or not verified, the issues you filed, and
anything the architect must decide. Be exact; do not round failures up to success.

## 11. Phase 1 results that phase 2 builds on

Verified by the architect on 2026-10-06: `tsc` clean, content valid, dev suite 444 passed / 2
skipped, build suite 194 passed.

**Content (`@/content`)**
- 44 files under `/content`: 22 projects (21 published, "Unity Tools" unpublished), 5 experience,
  4 skill groups, 5 links, 2 education, 3 certificates, 2 tracks, 1 site file.
- Reading content is forgiving, validating it is strict only where it must be: unknown keys,
  missing/empty identity fields, bad URLs and bad ids fail (`npm run validate:content`, which
  blocks a deploy); a missing or `null` optional field gets its default and blank list rows are
  dropped. `getLinks()` never returns a link with an empty `url`. **Project links can have
  `url: ""` — renderers must skip those.**
- One project (`target-shooter`) has a non-standard YouTube address
  (`https://www.youtube.com/Gameplay?v=…`). The viewer must read the video id from the `v`
  parameter, `youtu.be/<id>` and `/embed/<id>` forms, and fall back to opening the address in a
  new tab when no id can be read.
- Most images are hotlinked from other sites and some will be dead. Every content image needs
  a graceful fallback when it fails to load, and `referrerpolicy="no-referrer"`.
- In Node (tests, scripts) read content with `scripts/lib/load-content.ts` and
  `createContentApi()` from `src/content/selectors.ts`; `@/content` itself only works inside Vite.

**Design system (`@/components/ui`, `@/theme`, `src/styles`)**
- On the canvas: accent-coloured text uses `--color-accent-ink`, accent borders use
  `--color-accent-border`; `--color-accent` is a fill and text on it is `--color-on-accent`.
  On near-black fills (footer buttons, credit strip) use the raw `--color-accent`.
- Put `data-on-accent` on any accent-filled band (the footer): text tokens and the focus ring
  turn near-black inside it.
- Muted text never sits on `--color-surface-raised` (4.4:1).
- `data-track="game|softdev"` on the page root selects the accent.
- Primitives: `Button`, `LinkButton`, `buttonClassName()`, `IconButton`, `Chip`,
  `SegmentedTabs` (links, `renderLink` for the router), `Icon`, `Container`, `Section`,
  `SkipLink`, `VisuallyHidden`, `MediaOverlayButton`, `cx()`. Read their doc comments.
  The kit at `/__kit` (dev) shows every one in every state.

**App shell (`src/App.tsx`, `src/routes.tsx`, `src/lib`)**
- Keep `data-testid="track-page"`, `data-track` and `data-tab` on ONE root element of
  `TrackPage`; every routing and prerender test reads only that.
- Tabs and page links: `<Link to={trackPath(track, tabId)}>` from `@/lib/paths`; no scroll props
  needed (same-page tab changes keep the scroll position, the shell handles it).
  `TrackPage` stays mounted across tab changes and remounts when the page changes.
- Content assets: `assetUrl()` once per value; `isExternalUrl()` decides `target="_blank"`.
- Do not render `<title>` or `<meta>`; `src/lib/head.ts` owns the head.
- No `lazy()` / `<Suspense>` in anything rendered on first load (the prerender fails the build).
- Never read the theme, `window`, `document` or `localStorage` during render — the dev
  hydration test renders every route as a dark and as a light visitor and fails on a mismatch.
- `public/admin/**` is copied to `dist/admin/` and served at `/My-Portfolio/admin/`.
  `scripts/serve-pages.ts` (the GitHub Pages emulator used by the build suite) serves `.yml`.
- Canonical URLs: `/` for the game default view, `/softdev` for the software default view.
- Production branch: `master` (named once, in `.github/workflows/deploy.yml`). The CMS branch
  must be the same.

**Testing**
- Playwright output folders are per port (`test-results/dev-<port>`, `test-results/build-<port>`).
- Build suite: `PW_BUILD_PORT=<port> npx playwright test -c playwright.build.config.ts`
  (it runs `npm run build` first; `PW_SKIP_BUILD=1` reuses an existing `dist/`).
- Git Bash rewrites env values that start with `/`; use `MSYS_NO_PATHCONV=1` when passing paths
  such as `PAGES_BASE_PATH=/My-Portfolio`.

**Phase 2 isolation:** the `pages` and `admin` agents each work in their own git worktree, so
one agent's edits cannot reload another's dev server. Inside its worktree an agent runs
`npm ci` first, may run the build suite, and commits its own work on its worktree branch
(no push). The architect merges the branches.
