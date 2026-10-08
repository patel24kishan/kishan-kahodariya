# Kishan Kahodariya — Portfolio

The portfolio site of Kishan Kahodariya: two public pages that share one layout, a game
development page and a software page. It is a static site (Vite, React, TypeScript) hosted for
free on GitHub Pages.

**Live site: https://patel24kishan.github.io/kishan-kahodariya/**

Dashboard: https://patel24kishan.github.io/kishan-kahodariya/admin/

- `/` and `/gamedev` — the game page
- `/softdev` — the software page
- `/gamedev/<tab>`, `/softdev/<tab>` — the same pages with a project tab open
- `/admin/` — the content dashboard (owner only)

`ARCHITECTURE.md` is the full build contract; `DESIGN.md` is the visual system.

## How it works

![Animated diagram. Publishing: a save in the admin dashboard becomes a commit in the GitHub repo, which starts the GitHub Actions deploy workflow (validate content, validate dashboard config, type-check, build, prerender every page, publish) and ends on GitHub Pages. Visiting: a visitor opens a link, GitHub Pages sends the ready-made page file, and React takes over in the browser.](docs/workflow.svg)

**Publishing a change**

1. The owner edits content in the dashboard at `/admin/` and saves.
2. The save is a commit to the production branch. GitHub accepts it only with the owner's
   access token; the dashboard page itself holds no secret.
3. The commit starts the deploy workflow (`.github/workflows/deploy.yml`).
4. The workflow validates every content file, validates the dashboard config, type-checks,
   builds the site, writes one HTML file per address and publishes the result to GitHub Pages.
5. The change is live a minute or two after the save. If any check fails, nothing is published
   and the live site stays as it was.

**Visiting the site**

1. A visitor opens any address, for example `/gamedev/unreal`.
2. GitHub Pages returns that page as a finished HTML file. No server code runs.
3. React attaches to the page in the browser, and the tabs, the theme toggle and the media
   viewer become interactive.

There is no database and no server to pay for or maintain.

## Tech stack

The site has no server of its own. "Backend" below means the hosted GitHub services and the
content files that do the job a server and database would otherwise do.

| Technology | Layer | Function | Where it is used |
|---|---|---|---|
| React 19 | Frontend | Renders the pages as components | `src/pages/`, `src/components/` |
| TypeScript 7 | Frontend and build | Strict types for all code and for the content shapes | everything under `src/`, `scripts/`, `tests/` |
| React Router 7 | Frontend | Maps `/`, `/gamedev/<tab>` and `/softdev/<tab>` to the page and keeps the open tab in the address | `src/routes.tsx`, `src/App.tsx` |
| CSS Modules and design tokens | Frontend | Styling without a UI library; light and dark themes, one accent colour per page | `src/styles/`, `*.module.css` next to each component |
| Inter Variable (`@fontsource-variable/inter`) | Frontend | The typeface, self-hosted so no third-party font request is made | `src/styles/index.css` |
| Sveltia CMS 0.230.0 | Frontend (admin) | The content dashboard: forms, image uploads, side-by-side preview. Pinned with an integrity hash | `public/admin/` |
| JSON content files | Backend (data) | Stand in for a database: one file per project, job, link and so on | `content/` |
| GitHub repository and API | Backend (storage and sign-in) | Stores the content, and accepts a save only with the owner's access token | the dashboard commits to the production branch |
| GitHub Actions | Backend (build and deploy) | Validates, builds and publishes the site after every commit | `.github/workflows/deploy.yml`, `ci.yml` |
| GitHub Pages | Backend (hosting) | Serves the finished HTML, CSS, JavaScript and images | the published `dist/` folder |
| zod 4 | Build | Checks every content file against the schema; a bad file stops the deploy | `src/content/schema.ts`, `scripts/validate-content.ts` |
| Vite 8 | Build | Dev server and production bundle; a plugin feeds the content files to the app | `vite.config.ts`, `scripts/lib/content-plugin.ts` |
| Prerender script (React server renderer) | Build | Writes one HTML file per address so refresh and pasted links work | `scripts/prerender.ts`, `src/entry-server.tsx` |
| tsx, yaml | Build | Run the TypeScript scripts; read the dashboard config for validation | `scripts/` |
| Playwright 1.63 | Tests | Feature and production-build tests on desktop and phone sizes | `tests/` |
| `@axe-core/playwright` | Tests | Automated accessibility checks | `tests/design/`, `tests/pages/` |

## Folder structure

```
.
├── content/                 the site's content, one JSON file per item
│   ├── site.json            name, nav logo, credit lines, project tabs
│   ├── tracks/              the two pages: game.json, softdev.json (resume links, also per tab)
│   ├── projects/            one file per project
│   ├── experience/  skills/  links/  education/  certificates/
├── public/                  files served as they are
│   ├── admin/               the dashboard: index.html, config.yml, slug guard, preview
│   ├── images/              profile photo and the nav logo
│   └── uploads/             images uploaded through the dashboard (created on first upload)
├── src/
│   ├── pages/               TrackPage: the one public page, used for both pages
│   ├── components/
│   │   ├── layout/          nav and footer
│   │   ├── sections/        hero, projects, experience, skills, education
│   │   ├── viewer/          the media viewer
│   │   └── ui/              buttons, chips, tabs, icons and other building blocks
│   ├── content/             content types, schema and the content API (`@/content`)
│   ├── styles/              design tokens, reset, base styles
│   ├── theme/               light/dark theme provider and the sun/moon toggle
│   ├── lib/                 base-path helpers, document head, scroll rules
│   ├── dev/                 component showcase, dev server only (`/__kit`)
│   ├── routes.tsx  App.tsx  route table and app shell
│   └── main.tsx  entry-server.tsx   browser entry and build-time render entry
├── scripts/                 prerender, GitHub Pages-like preview server, validators, migration
├── tests/                   Playwright specs, one folder per area
│   ├── content/  design/  infra/  pages/  admin/
│   └── build/               run against the production build
├── docs/
│   ├── admin-guide.md       how the owner uses the dashboard
│   ├── migration-report.md  what was imported from the old site, and what to review
│   ├── workflow.svg         the animated diagram above
│   └── sketches/            the approved page wireframes
├── legacy/constants.js      the old site's content, kept as the migration source
├── logs/                    notes from the build: progress, issues and decisions
├── private/                 owner-only working documents; git-ignored, never in the repository
├── .github/workflows/       deploy.yml (publish) and ci.yml (checks on pull requests)
├── ARCHITECTURE.md          the build contract: routes, content model, design rules
├── DESIGN.md                the visual system
└── index.html, vite.config.ts, tsconfig.json, playwright*.config.ts, package.json
```

## Run it

Node 24 and npm are required.

```bash
npm ci                # install exactly what the lockfile says
npm run dev           # dev server → http://localhost:5173/kishan-kahodariya/
npm run build         # validate content and dashboard config → type-check → build → prerender into dist/
npm run preview       # serve dist/ the way GitHub Pages does → http://localhost:4173/kishan-kahodariya/
```

Other commands:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, no output files |
| `npm run validate:content` | checks every file under `content/` against the schema |
| `npm run validate:cms` | checks the dashboard config against the content schema |
| `npm run migrate` | one-off import of the old site's data (`legacy/constants.js`) |
| `npm test` | Playwright tests against the dev server |
| `npm run test:build` | builds, then Playwright tests against `dist/` |

`npm run preview` reads the port from `PORT`. The tests read `PW_PORT` (dev server) and
`PW_BUILD_PORT` (preview server), so several runs can share one machine:

```bash
PW_PORT=5183 npm test
PW_BUILD_PORT=4183 npm run test:build
PW_BUILD_PORT=4183 PW_SKIP_BUILD=1 npm run test:build   # reuse the dist/ that is already built
```

## Content and the dashboard

All text, links and project data live in the repository as JSON, one file per item:

```
content/site.json            name, nav logo, credit lines, project categories (the tabs)
content/tracks/*.json        the two pages: headline, summary, resume (and a resume and a summary per tab), default tab, page title
content/projects/*.json      one project each: text, tags, screenshots, video, buttons
content/links/*.json         social links, with one order for the hero and one for the footer
content/experience/*.json    content/skills/*.json
content/education/*.json     content/certificates/*.json
public/uploads/              images uploaded through the dashboard
```

The owner does not edit these files by hand. `/admin/` is a dashboard (Sveltia CMS) that signs
in to GitHub with a personal access token and saves each change as a commit. A commit on the
production branch starts the deploy workflow, and the change is live a minute or two later.
There is no database and no server. The step-by-step guide for the dashboard is
`docs/admin-guide.md`.

To try the dashboard without a token, run `npm run dev`, open
`http://localhost:5173/kishan-kahodariya/admin/` in Chrome or Edge, click **Work with Local
Repository** and pick the repository folder. Saves then write the files on your disk, the dev
server reloads the page with the change, and nothing goes to GitHub. The button only exists on
a local address.

Every build validates the content first. A file that breaks the schema fails the build, the
deploy stops, and the live site stays as it was.

Rules worth knowing when touching content by hand:

- Image and file paths are either full `https://` URLs or start with `/` (`/images/profile.jpg`,
  `/uploads/shot.webp`). Never write `/kishan-kahodariya` in content; the site adds it.
- `"published": false` keeps an item out of the site and out of the JavaScript bundle.

## How the site is built

`npm run build` runs five steps and stops at the first failure:

1. `validate:content` — the content files match the schema.
2. `validate:cms` — the dashboard config covers every field of the schema.
3. `typecheck`.
4. `vite build` — the browser bundle and `dist/index.html`, which is the HTML template.
5. `scripts/prerender.ts` — renders **every route to its own HTML file**, so a pasted link or
   a refresh returns the finished page with HTTP 200, with the right `<title>`, description
   and canonical link already in the HTML. The browser then hydrates that markup.

A route such as `/gamedev/unity` is written twice, as `gamedev/unity.html` and as
`gamedev/unity/index.html`: GitHub Pages answers `/gamedev/unity` from the first and
`/gamedev/unity/` from the second, both directly with 200. The step also writes a redirect page
for the old `/game` address, `404.html` (which also sends an unknown tab such as
`/gamedev/typo` back to `/gamedev`), `.nojekyll`, and `robots.txt`.

Where things are:

| Path | Purpose |
|---|---|
| `src/routes.tsx`, `src/App.tsx` | route table and app shell (document head, scroll rules, address repair) |
| `src/main.tsx`, `src/entry-server.tsx` | browser entry (hydrates) and build-time render entry |
| `src/lib/paths.ts` | `assetUrl()` and the link helpers; the only code that applies the base path |
| `src/lib/site-config.ts` | the base path and the site origin, in one place |
| `src/content/` | content types and the content API (`@/content`) |
| `src/pages/`, `src/components/` | the page and its sections |
| `src/styles/`, `src/theme/` | design tokens, global styles, light/dark theme |
| `scripts/` | prerender, the Pages-like preview server, content validation, migration |
| `tests/` | Playwright specs, one folder per area; `tests/build/` needs a production build |

## Tests

Playwright is the test tool; every spec runs in a desktop and a phone-sized project.

- `npm test` starts the Vite dev server and runs everything under `tests/` except `tests/build/`.
- `npm run test:build` runs `npm run build`, serves `dist/` with `scripts/serve-pages.ts` (same
  rules as GitHub Pages: `.html` fallback, folder redirect, case-sensitive paths, `404.html`
  with status 404) and runs `tests/build/`: every route answers 200 with and without a
  trailing slash, the page is in the HTML before any script runs, hydration is clean, deep
  links survive a reload, unknown addresses get the 404 page, every asset is under the base
  path, and nothing private is in the output.

Playwright needs its browser once per machine: `npx playwright install chromium`.

## Deploy

Two workflows live in `.github/workflows/`:

- **`deploy.yml`** — on a push to the production branch, or a manual run: install, build
  (which validates the content), upload `dist/`, publish to GitHub Pages. Deployments never
  overlap; if several saves arrive while one is publishing, the newest waits and wins.
- **`ci.yml`** — on pull requests only: type-check, content validation, build, both test
  suites. It never deploys.

`master` is the production branch. A push to it, which includes every dashboard save,
publishes the site. Pushes to any other branch, `redesign/v2` included, do not.

## Live setup (and how to recreate it)

The site is live at `https://patel24kishan.github.io/kishan-kahodariya/`. These are the
settings it depends on. If the site ever shows the wrong thing, check them in this order.

1. **Production branch.** `deploy.yml` names it in exactly one place (`on.push.branches`,
   marked `PRODUCTION BRANCH`). It is `master`, the repository's default branch, and the
   dashboard commits to the same branch (`public/admin/config.yml`, `backend.branch`).
2. **GitHub → Settings → Pages → Build and deployment → Source: "GitHub Actions".** This is the
   switch that lets `deploy.yml` publish. **If it is set back to "Deploy from a branch", GitHub
   serves the old `gh-pages` build instead** and the site shows a blank page with 404s.
   Deleting or restoring the `gh-pages` branch can do this. Do not use that branch.
3. **GitHub → Settings → Environments → `github-pages` → Deployment branches:** only the
   production branch, so a manual run from another branch cannot publish.
4. **GitHub → Settings → Actions → General:** Actions allowed. The default read-only workflow
   permission is enough; the workflow asks for what it needs.
5. **Deploy by hand:** Actions → Deploy → Run workflow, on `master`.
6. **Check the site:** the home page, a deep link such as `/softdev/webapps` (refresh it), and
   a wrong address (the 404 page).
7. **Dashboard:** create a fine-grained access token for this repository only (Contents: read
   and write) and sign in at `/admin/` as described in `docs/admin-guide.md`. A save appears
   on the site a few minutes later; the Actions tab shows the run, and a red run means the
   save broke a content rule and the previous site stays up.
8. The `gh-pages` branch holds the old Create React App build. Nothing uses it.

Things that would need a code change:

- **Renaming the repository or adding a custom domain** changes the path the site is served
  under (the repository is `kishan-kahodariya`, so the path is `/kishan-kahodariya/`). Update
  `BASE_PATH` (and `DEFAULT_SITE_ORIGIN`) in `src/lib/site-config.ts`, the repository and site
  address in `public/admin/config.yml`, then rename on GitHub and push to `master` straight
  away. A link to the old address stops working. The
  deploy build compares its base path with the one GitHub reports and fails with a clear
  message if they differ, rather than publishing a site with broken links.
- **`robots.txt`.** Crawlers only read `robots.txt` at the root of a host
  (`https://patel24kishan.github.io/robots.txt`), which belongs to a different repository.
  The file this site publishes under `/kishan-kahodariya/robots.txt` is therefore informational;
  what actually keeps `/admin/` out of search results is the `noindex` tag on that page.
