# "All" cannot be chosen as the tab a page opens on

- Raised by: admin
- Date: 2026-10-07
- Area / owner affected: owner decision, architect
- Severity: question
- Status: open

## What happened
The project **Tab** field and the pages' **Project tab that opens first** field are Sveltia
Relation fields that list the tabs of Site settings (`collection: _singletons`, `file: site`,
`value_field: categories.*.id`). That is what makes "add a tab in Site settings, then choose
it for a project" work without touching the config (tested end to end in
`tests/admin/dashboard.spec.ts`).

The schema also allows `defaultTab: "all"`. A Relation field can only offer what is in the
list, and "all" is not a category, so the dashboard cannot offer it. Checked in the browser:
a file that already has `"defaultTab": "all"` opens with no option selected, saves fine and
keeps `"all"`; but once the owner picks a real tab there is no way back to "All" from the
dashboard.

Today both pages open on a real tab (`unity`, `webapps`), so nothing is lost.

## What I need / suggest
Owner: is opening a page on "All" something you want to be able to choose? If yes, the
cleanest fix is in the content model (architect), for example a switch
`openOnAllTab: boolean` next to `defaultTab`. A fixed choice list would bring back the
problem that a new tab needs a config edit, which is worse.

## Resolution (architect)

Noted, 2026-10-07. Neither page opens on the All tab today (game: unity, software: webapps), so nothing is lost. If the owner wants a page to open on All, the content model gets an explicit choice for it. Status: owner question, not blocking.
