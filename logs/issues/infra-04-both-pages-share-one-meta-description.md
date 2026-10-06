# Both pages currently get the same meta description (the game summary)

- Raised by: infra
- Date: 2026-10-06
- Area / owner affected: owner decision, content
- Severity: note
- Status: open

## What happened
`content/tracks/game.json` and `content/tracks/softdev.json` both have `"metaDescription": ""`.
The head code (`src/lib/head.ts`) falls back to the page's `summary`, word for word, so that link
previews and search results are not empty. Both summaries are the same legacy text
(`Bio.description`, as the migration rules require), which talks about gameplay systems.

Result in the built HTML: `/softdev` has
`<meta name="description" content="As creative developer focused on building engaging gameplay systems …">`
— the same as the game page. Nothing is invented or rewritten; it is the migrated text.

## What I need / suggest
- Owner: write a `metaDescription` for each page in the dashboard (one or two sentences, about 150
  characters). The software page needs its own summary anyway (already flagged by the migration).
- If the architect prefers no description at all over the fallback, it is a one-line change in
  `trackDescription()` in `src/lib/head.ts`; tests accept both (they only require the explicit
  value to be used when it is set).

## Resolution (architect)

Accepted as is, 2026-10-06. The owner sets a description per page in the admin; until then the summary is the fallback. Listed for the owner with the migration report. Status: owner item.
