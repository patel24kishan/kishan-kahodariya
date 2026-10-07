# Pinned Sveltia version, the three small scripts on the admin page, and Sveltia facts worth knowing

- Raised by: admin
- Date: 2026-10-07
- Area / owner affected: architect, owner decision
- Severity: note
- Status: open

## What happened

### 1. The version is pinned exactly; Sveltia advises against that
`public/admin/index.html` loads `https://unpkg.com/@sveltia/cms@0.230.0/dist/sveltia-cms.js`
with `integrity="sha384-…"` and `crossorigin="anonymous"`, as the brief asks. The hash was
computed from the file served by unpkg and is identical for the copy on jsDelivr
(2,242,132 bytes). The browser enforces it (tested: a wrong hash stops the script).

Sveltia's own docs (`/en/docs/releases`) recommend the unpinned URL and call exact pinning a
security risk, because fixes then arrive only when someone bumps the version. Both views are
right about different risks: unpinned means whoever controls the package or the CDN can run
code on a page where the owner's token is in memory; pinned + integrity means nobody can,
and updates are a deliberate act. I kept the pin. The cost is a chore: someone has to
upgrade now and then (steps and a helper command in `docs/admin-guide.md`, "For
developers"; `validate:cms` checks the three places agree; the tests save every content file
through the new version before it ships). Sveltia is pre-1.0 and releases several times a
week; 0.230.0 was a few hours old when pinned (it is the release the docs I read describe).

**CDN or a copy in the repo?** A vendored copy would remove unpkg from the picture for the
main script, at the price of a 2.2 MB file in the repo for every upgrade. It would not make
the page self-contained: the script itself loads its fonts from cdn.jsdelivr.net and its
locale file, update check and a few optional parts from unpkg.com, and asks
www.githubstatus.com for GitHub's status (observed; the docs say the same also applies to a
copied script). With the integrity hash the CDN copy cannot be altered either, so vendoring
buys availability only. I chose the CDN.

### 2. Three small scripts of ours run on the admin page
They are self-hosted in `public/admin`, have no dependencies and make no network requests.

- `slug-guard.js` (classic script, ~40 lines of code). A Sveltia `preSave` hook. Before a
  save it sets the item's `slug` field to the real file name. Needed because the content
  check requires `slug` = file name and Sveltia breaks that in two cases, both reproduced:
  the owner edits "Short name" on an existing item (the file is not renamed), and a new item
  reuses a taken short name (Sveltia saves it as `<name>-1`). Without the guard both stop
  the next deploy (the site itself stays safe); with it neither can happen. It only ever
  changes that one field, only for entries stored as `<slug>.json`, and never throws.
- `preview-logic.js` (ES module, pure functions) and `preview.js` (ES module, React
  components through Sveltia's own `CMS.React` and `html`): the content preview of issue
  admin-01. They only read the form's values and draw; they never write.
- If either file fails to load, the dashboard still works: without the guard the content
  check is the safety net; without the preview Sveltia shows its built-in field list.

None of them touches the token. They do run in the same page as Sveltia, so they are part of
what must be reviewed when they change.

### 3. Sveltia behaviour found while testing (0.230.0)
- The sign-in button is labelled **"Sign In Using Access Token"** (the docs say "Sign In with
  Token"). The token box is a plain text input: the token is visible while pasting.
- The link in the token dialog opens
  `github.com/settings/personal-access-tokens/new?name=Sveltia+CMS&contents=write`: the
  permission is pre-selected, the repository is not. The owner must choose "Only select
  repositories → My-Portfolio" by hand (the guide says so).
- `config.yml` is fetched as `config.yml?_=<time>`, so a changed config is picked up on reload.
- The image field's "Enter URL" box accepts any text. The image fields therefore carry a
  pattern. Sveltia tests that pattern against the **bare file name** of a just-uploaded
  picture, so the pattern has to allow `my-shot.webp` as well; a hand-typed `example.com`
  (no slash) is the one bad value that still gets through, and the content check stops it.
- Changing the address by hand from one Pages file straight to the other
  (`#/collections/pages/entries/game` → `…/softdev`) shows an empty editor. Going through the
  list, as a person does, is fine. Upstream quirk; nothing in our files causes it.
- Long forms draw their fields as they scroll into view.
- "Work with Local Repository" is offered on localhost only, so it is never shown on the
  live site.
- A new item cannot be duplicated (`duplicate: false`): a copy would carry "Published: on".

## What I need / suggest
1. Architect: confirm the pin + integrity choice and who owns the upgrade chore.
2. Architect: confirm the three scripts may ship on the admin page.
3. Nothing else; the rest is for the record.

## Resolution (architect)

Ruled, 2026-10-07. Keep the exact version pin with the integrity hash: the admin page holds the owner's token in memory, so the script that runs there must not change without a deliberate upgrade. Upgrades follow the steps in docs/admin-guide.md. The three self-hosted scripts were read by the architect: no network calls, no storage access, no token access; slug-guard changes one field only. Accepted. tests/build/admin.spec.ts stays where it is. Status: closed.
