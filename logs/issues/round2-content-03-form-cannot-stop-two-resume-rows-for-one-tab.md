# The form cannot stop two resume rows for the same tab; the content check does

- Raised by: round2-content
- Date: 2026-10-07
- Area / owner affected: architect, owner (for information)
- Severity: note
- Status: open

## What happened
The contract makes a duplicate `tab` inside one page's `tabResumes` an error. Sveltia CMS
0.230.0 has no rule for "this value must be unique among the rows of a list", so the form
lets the owner add a second row for a tab that already has one and save it.

Reproduced in the real dashboard
(`tests/admin/dashboard.spec.ts` › "the form cannot stop two rows for one tab — the content
check does, and names the row"): the save goes through, and `npm run validate:content` then
exits 1 with

```
content/tracks/game.json
  field:   tabResumes[1].tab
  problem: "unreal" has more than one row (a tab can have only one resume)
```

So the next deploy is refused and the live site stays as it was — the same safety net as for
"a tab deleted while projects still use it". It is not a silent failure, but it is a save
that the form accepts and the build rejects.

What is in place to make it unlikely and easy to fix:
- the hint of the list ("One row per tab.") and of the tab choice ("Use each tab in one row
  only — two rows for the same tab stop the next update of the site.");
- the preview pane marks the second row while the owner is still in the form: "This tab
  already has a row above — remove one of the two, or the next update of the site is
  stopped." (tested);
- `docs/admin-guide.md` section 8 ("Use each tab in one row only") and section 13.

## What I need / suggest
Nothing has to change. If the architect would rather never block a deploy over this, the
alternative is to tidy instead of reject: keep the first row for a tab, drop later ones with
a NOTE. That is a change of the contract ("duplicate tab values within one track are an
error"), so I did not do it.

## Resolution (architect)
Accepted as a known limit of the dashboard. A duplicate row is caught by validate:content, the deploy stops and the old site stays up; the hint, preview and guide warn about it.
Status: closed (note for the owner)
