# A link file without `orderFooter` keeps its place when read, but the dashboard saves it as 0

- Raised by: round2-content
- Date: 2026-10-07
- Area / owner affected: architect (for information)
- Severity: note
- Status: open

## What happened
The forgiving read asked for in the brief is in place: a link file without `orderFooter` (or
with `null`) is read as if `orderFooter` were its `order`, with a NOTE, so nothing moves in
the footer.

The dashboard does not know that rule. When it opens such a file it has no value for
"Footer order", shows the field's default (0) and writes `"orderFooter": 0` on the next save
of that link — which puts the link first in the footer. Confirmed in the real dashboard
(Sveltia 0.230.0): `tests/admin/dashboard.spec.ts` › "files written before the logo, the
footer order and the resume list existed".

**No real file is affected.** All five files under `content/links/` state their
`orderFooter` (email 10, itchio 20, linkedin 30, github 40, blog 50), and
`tests/admin/roundtrip.spec.ts` fails if a link file ever lacks it. A link created in the
dashboard gets both numbers written. The case can only come from a hand edit, or from a merge
that brings back an old copy of a link file.

The same first save writes `"logo": ""`, `"logoAlt": ""` and `"tabResumes": []` into an old
`site.json` / page file; those defaults are the ones the reader uses, so nothing changes there.

## What I need / suggest
Nothing. Recorded so that nobody is surprised if a hand-written link file jumps to the front
of the footer after its first save. If a merge conflict touches `content/links/*.json`, keep
the `orderFooter` lines.

## Resolution (architect)
Accepted. All five link files state orderFooter and a test fails if one ever lacks it.
Status: closed
