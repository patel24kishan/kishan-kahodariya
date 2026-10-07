# The "All" tab cannot be given a resume of its own from the dashboard

- Raised by: round2-content
- Date: 2026-10-07
- Area / owner affected: owner decision, architect
- Severity: question
- Status: open

## What happened
The contract allows `tabResumes[].tab` to be a category id or `"all"`, and the schema, the
content check and `getResume()` all accept `"all"` (tested in `tests/content`).

In the dashboard the tab of a row is chosen with the same kind of field as a project's tab
and a page's first tab: a Relation field that lists the project tabs of Site settings
(`collection: _singletons`, `file: site`, `value_field: categories.*.id`). That is what makes
a tab added in Site settings selectable without touching the config. It is also the
limitation already recorded in `admin-04`: "All" is not a category, so the list cannot offer
it. Seen in the real dashboard (Sveltia 0.230.0): the choices are Unreal, Unity3D, Web Apps.

So today a resume for the "All" tab can only be written by editing `content/tracks/*.json`
by hand. On the "All" tab the page uses the main resume, which is probably what is wanted.

## What I need / suggest
Owner: do you want a separate resume for the "All" tab? If not, nothing to do — I can then
also narrow the contract comment to "category id" if the architect prefers. If yes, the
clean way is the same as proposed in `admin-04`: an explicit field in the content model
(for example `allTabResumeUrl` / `allTabResumeLabel` on the page) rather than a fixed choice
list, which would need a config edit for every new tab.

`docs/admin-guide.md` says plainly that the "All" tab cannot be chosen and uses the main
resume.

## Resolution (architect)
Accepted. The All and Web Apps tabs on the game page are meant to open the page's main resume, which is what the fallback does. Same limit as admin-04; no change.
Status: closed
