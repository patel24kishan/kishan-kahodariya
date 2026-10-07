# The first save of five projects removes spaces around their short description

- Raised by: admin
- Date: 2026-10-07
- Area / owner affected: content, architect
- Severity: note
- Status: open

## What happened
Sveltia CMS trims leading and trailing whitespace of every text value when an entry is saved
(docs: `/en/docs/data-output`, "Text Processing"; confirmed in the browser). Five migrated
project files have a `shortDescription` that starts or ends with a space (kept verbatim from
`legacy/constants.js`):

```
content/projects/3d-platformer.json   trailing space
content/projects/dating-square.json   trailing space
content/projects/my-portfolio.json    leading and trailing space
content/projects/staycation.json      leading space
content/projects/tank-it.json         trailing space
```

The first time the owner saves any of these five in the dashboard, that one line also loses
its surrounding spaces. Nothing else changes; the words are untouched. The other 39 files
come back byte-identical from a save.

`tests/admin/roundtrip.spec.ts` prints this list on every run and fails if a save would
change anything other than surrounding spaces. `tests/admin/dashboard.spec.ts` saves all 44
files through the real CMS and confirms it.

## What I need / suggest
Nothing has to be done. If the architect prefers a clean first diff, the content agent can
trim these five values (the contract says text is never rewritten, so I did not touch them
and they are not mine to edit). The visible page does not change either way: HTML collapses
those spaces.

## Resolution (architect)

Ruled, 2026-10-07. Accept as is. The dashboard trims leading and trailing spaces of five descriptions on their first save; the visible text does not change. The architect does not edit the owner's text to pre-empt it. Status: closed.
