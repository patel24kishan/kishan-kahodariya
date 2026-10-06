# Schema rules that go slightly beyond the listed ones (affects the admin config)

- Raised by: content
- Date: 2026-10-06
- Area / owner affected: architect, admin, pages
- Severity: note
- Status: open

## What happened
`src/content/schema.ts` implements every rule in the brief (slug = file name, category must be a
`site.categories[].id`, 4-word limits, `defaultTab` is a category id or `all`, `YYYY-MM` dates,
URL formats). While mirroring `types.ts` I also made these choices. Each one can block a deploy
through `npm run validate:content`, so the admin agent's CMS config has to agree with them:

1. **Unknown keys are rejected** (`z.strictObject`). A field the CMS writes that is not in
   `types.ts` fails validation with "is not a field of this kind of content".
2. **Every key must be present** (as the contract says). A CMS widget that omits an empty field
   instead of writing `""` / `[]` / `false` / `0` fails with "is missing".
3. **Blank list entries are rejected** in `tags`, `skills`, `bullets*`, `roles`, `credit`
   (an empty string would render as an empty chip or bullet).
4. **Identity fields cannot be empty**: `slug`, project `title`, experience `company`, skill group
   `title`, link `label`, education `school`, certificate `title`, `site.name`, `site.allTabLabel`,
   category `id` and `label`, track `route` and `label`, project `category`, track `defaultTab`.
5. **Narrower URL rules per field kind**: link fields accept `""`, `http(s)://`, `mailto:` or `/path`;
   image fields (`photo`, `logo`, `screenshots[].src`, certificate `image`) do not accept `mailto:`;
   `videoUrl` accepts only `""` or `http(s)://` (it is not checked to be a YouTube host, so the
   legacy malformed link `https://www.youtube.com/Gameplay?v=Lp46QFgKyKM` is valid and kept).
   A path starting with `//` is rejected (it would point at another host).
6. `site.email` must be `""` or look like an email address.
7. Category ids and track routes must be lower-case kebab; a category id cannot be `all`; category
   ids are unique; the two tracks cannot share a route; a track file's `id` must equal its file name;
   only `tracks/game.json` and `tracks/softdev.json` may exist; JSON files in unknown folders or in
   sub-folders are reported.
8. Not enforced: `present: true` together with a non-empty `endDate`, start after end, uniqueness of
   `legacyId`, or that a published social link has a non-empty `url`.

For the pages agent: `getLinks()` follows its doc comment exactly, so a published link saved with
`url: ""` is returned; the renderer has to skip it (the "renderers skip empty values" convention in
`types.ts`). The migrated content has no such link.

## What I need / suggest
A yes/no on items 1–7. If any is too strict I will relax it in `schema.ts` (and the matching test in
`tests/content/validator.spec.ts`). Otherwise the admin agent should configure every field as
"always written" and mark the identity fields as required.

## Resolution (architect)
Decided, 2026-10-06. Principle: a validation failure blocks a deploy, so anything the admin form cannot make impossible at entry time must be normalised, not rejected.
- Items 1, 4, 5, 6, 7: keep. The admin agent must mark identity fields required, give URL fields matching patterns, and its config check must prove the CMS can only write fields that exist in the schema.
- Item 2: relax. A missing or null value in a non-identity field is filled with its default ("", [], false, 0) when content is read, so a CMS that omits an empty optional field cannot block a deploy. Identity fields stay required.
- Item 3: relax. Blank entries in tags, skills, bullets, roles and credit are dropped when content is read instead of failing validation. Non-blank text is never altered.
- getLinks(): filter out links whose url is empty, so no renderer can show a dead button. Project links keep their empty entries in the data (the owner fills them in the admin); renderers skip them.
- Empty "View Code" entries for the five projects without a repo: keep as migrated.
Content agent resumed to apply the two relaxations and the getLinks filter. Status: in progress.

## Follow-up
Applied by the content agent, 2026-10-06.

What changed
- `src/content/schema.ts` — the split between "reject" and "tidy" is described at the top of the file.
  - Kept as errors: unknown keys; identity fields missing, null or empty (slug, title / company /
    school / label, `site.name`, `site.allTabLabel`, category `id` and `label`, track `id`, `route`,
    `label`, `defaultTab`, project `category`); the per-field URL rules; the email rule; the
    id / route / track-file rules; wrong types.
  - Tidied while reading: any other field that is missing or `null` gets its default (`""`, `[]`,
    `false`, `0`; a missing `legacyId` becomes `null`). `published` missing or null means not
    published; `featured` false; order fields 0.
  - Blank entries (empty, only spaces, or null) are dropped from `tags`, `skills`, `bullets`,
    `bulletsGame`, `bulletsSoftdev`, `roles`, `credit`. Non-blank text is not trimmed or changed.
  - `screenshots` rows with an empty `src` and `links` rows whose `label` and `url` are both empty
    are dropped. A link with a label and an empty url is kept.
  - The parsed output still matches `types.ts`; the type-level drift check in the file passes.
- `getLinks()` no longer returns links whose `url` is empty (`src/content/selectors.ts`; doc comment
  updated in `src/content/index.ts`). Project links keep their empty-url entries.
- `npm run validate:content` prints a NOTE (stdout, grouped by file, with the field and what was
  done) when it had to fill a default or drop a blank entry. Exit code is unaffected. In GitHub
  Actions each note is also a `::notice` annotation. A missing `published` is called out as
  "this item is NOT shown on the site".
- The migration now refuses to write if its own output would need tidying.
- `content/` and `docs/migration-report.md` were not regenerated; a checksum over all 45 files is
  identical before and after, and a fresh migration into a temp folder is still byte-identical.

One decision the instruction did not spell out
- Choice fields have no `""` / `[]` / `false` / `0` default, so a missing or null one is read as
  its neutral option: `audience` → `"both"`, `emphasis` → `"none"`, project link `kind` → `"other"`,
  social link `icon` → `"link"`. An unknown option is still an error. Say if these four should be
  required instead; it is a one-line change each.

Not changed
- Whitespace-only values in single text fields (for example `hoverText: "  "`) are left as written.
- The Vite plugin does not print the notes; only the validator script does.

Verified
- `npx tsc --noEmit` — exit 0.
- `npm run validate:content` — exit 0, "Content OK", no NOTE (the migrated content is complete).
- `PW_PORT=5181 npx playwright test tests/content` — 186 passed (93 tests × desktop and mobile;
  was 79 × 2).
- `PW_PORT=5181 npx playwright test` — 446 tests: 444 passed, 2 skipped (design's own conditional
  skips), 0 failed.
- Build suite not run, as instructed.
