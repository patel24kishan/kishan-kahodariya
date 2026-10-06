# Kishan Kahodariya — Portfolio

The portfolio site of Kishan Kahodariya: two public pages that share one layout, a game
development page and a software page. It is a static site (Vite, React, TypeScript) hosted for
free on GitHub Pages under `/My-Portfolio/`.

- `/` and `/gamedev` — the game page
- `/softdev` — the software page
- `/gamedev/<tab>`, `/softdev/<tab>` — the same pages with a project tab open
- `/admin/` — the content dashboard (owner only)

`ARCHITECTURE.md` is the full build contract; `DESIGN.md` is the visual system.

## Run it

Node 24 and npm are required.

```bash
npm ci                # install exactly what the lockfile says
npm run dev           # dev server → http://localhost:5173/My-Portfolio/
npm run build         # validate content → type-check → build → prerender into dist/
npm run preview       # serve dist/ the way GitHub Pages does → http://localhost:4173/My-Portfolio/
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
content/site.json            name, credit lines, project categories (the tabs)
content/tracks/*.json        the two pages: headline, summary, resume, default tab, page title
content/projects/*.json      one project each
content/experience/*.json    content/skills/*.json    content/links/*.json
content/education/*.json     content/certificates/*.json
public/uploads/              images uploaded through the dashboard
```

The owner does not edit these files by hand. `/admin/` is a dashboard (Sveltia CMS) that signs
in to GitHub with a personal access token and saves each change as a commit. A commit on the
production branch starts the deploy workflow, and the change is live a minute or two later.
There is no database and no server. The step-by-step guide for the dashboard is
`docs/admin-guide.md`.

Every build validates the content first. A file that breaks the schema fails the build, the
deploy stops, and the live site stays as it was.

Rules worth knowing when touching content by hand:

- Image and file paths are either full `https://` URLs or start with `/` (`/images/profile.jpg`,
  `/uploads/shot.webp`). Never write `/My-Portfolio` in content; the site adds it.
- `"published": false` keeps an item out of the site and out of the JavaScript bundle.

## How the site is built

`npm run build` runs four steps and stops at the first failure:

1. `validate:content` — the content files match the schema.
2. `typecheck`.
3. `vite build` — the browser bundle and `dist/index.html`, which is the HTML template.
4. `scripts/prerender.ts` — renders **every route to its own HTML file**, so a pasted link or
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

Neither workflow runs for plain pushes to `redesign/v2`. **Nothing is published until the
go-live checklist below is done.**

## Go-live checklist (owner)

The old site was built from the `Deploy` branch and published by pushing its build to the
`gh-pages` branch, so that is presumably what GitHub Pages serves today (check under
Settings → Pages). Switching over takes these steps, in this order.

1. **Choose the production branch.** `deploy.yml` names it in exactly one place
   (`on.push.branches`, marked `PRODUCTION BRANCH`). It is set to `master`, which does not
   exist on GitHub yet. Either create `master` from the finished `redesign/v2`, or change that
   one line to the branch you want. A manual run (step 6) is only offered when `deploy.yml`
   is on the repository's default branch, so the production branch should be the default one.
2. **Get the new site onto that branch** (merge or push `redesign/v2` into it). The dashboard
   must be configured to commit to the same branch.
3. **GitHub → Settings → Pages → Build and deployment → Source: "GitHub Actions".**
   This is the switch that stops GitHub serving the old `gh-pages` build and lets
   `deploy.yml` publish instead. Until it is set, GitHub keeps serving the old site.
4. **GitHub → Settings → Environments → `github-pages` → Deployment branches:** allow only the
   production branch, so a manual run from another branch cannot publish.
5. **GitHub → Settings → Actions → General:** Actions must be allowed for the repository. The
   default read-only workflow permission is enough; the workflow asks for what it needs.
6. **Deploy:** push to the production branch, or run Actions → Deploy → Run workflow.
7. **Check the live site:** `https://patel24kishan.github.io/My-Portfolio/`, a deep link such
   as `/My-Portfolio/softdev/webapps` (refresh it), and a wrong address (the 404 page).
8. **Dashboard:** create the access token and sign in at `/My-Portfolio/admin/` as described
   in `docs/admin-guide.md`. Save one small change and watch it go live.
9. Afterwards the `gh-pages` branch is no longer used and can be deleted.

Things that would need a code change:

- **Renaming the repository or adding a custom domain** changes the path the site is served
  under. Update `BASE_PATH` (and `DEFAULT_SITE_ORIGIN`) in `src/lib/site-config.ts`. The
  deploy build compares its base path with the one GitHub reports and fails with a clear
  message if they differ, rather than publishing a site with broken links.
- **`robots.txt`.** Crawlers only read `robots.txt` at the root of a host
  (`https://patel24kishan.github.io/robots.txt`), which belongs to a different repository.
  The file this site publishes under `/My-Portfolio/robots.txt` is therefore informational;
  what actually keeps `/admin/` out of search results is the `noindex` tag on that page.
