# Drag-and-drop ordering of entries exists in Sveltia but is not enabled

- Raised by: admin
- Date: 2026-10-07
- Area / owner affected: architect, content, owner decision
- Severity: question
- Status: open

## What happened
Sveltia CMS has true manual ordering of entries: `reorder: true` (or `reorder: { key: … }`)
on an entry collection adds a **Reorder** button to the list, with drag and drop and
Move Up / Move Down buttons (docs: `/en/docs/collections/entries/operations#reordering-entries`).
I tried it in the real CMS (0.230.0) on a private copy of `/content`:

1. It supports **one order key per collection**. Links and Education have one (`order`).
   Projects, Experience, Skill groups and Certificates have two (`orderGame`,
   `orderSoftdev`), so only one page's order could be dragged.
2. Pressing **Done** rewrites **every** entry of the collection with 1, 2, 3… (one commit).
   The existing gaps (10, 20, 30) are gone afterwards.
3. With `reorder` set, Sveltia writes the order key as the **first key of the file** — on a
   reorder and on every normal save of that collection. Observed: `email.json` came back as
   `{ "order": 4, "slug": "email", "label": … }`. Values are untouched, and the content check
   does not care about key order, but every file of the collection gets a one-line move the
   first time it is saved, and the files no longer follow the order of `types.ts`.

Because of 3, enabling it would break the property the brief asks me to prove ("the set and
order of keys the CMS would write equals the file's keys"). So it is **off**, ordering is by
the position numbers (required, default 0, with a hint), and the lists are sorted by position
by default with Sort / Group / Filter menus. `validate:cms` refuses `reorder` with a pointer
to this file, so it cannot be switched on by accident.

## What I need / suggest
A decision. If drag ordering is wanted:

- **Links and Education** (one key): add `reorder: { key: order }` to the two collections,
  move `order` to the first key in `types.ts`, the schema and the 7 files (or accept the
  one-time line move), and relax the `reorder` rule in `scripts/validate-cms-config.ts`.
  Small change, clean fit.
- **Projects** (the list where it would help most, 22 items): only possible for one page's
  order. If both pages could share one project order, a single `order` key would make the
  whole list draggable. That is a content-model change for the architect.

## Resolution (architect)

Ruled, 2026-10-07. Keep drag-ordering off. It would move the order key to the top of every saved file and could only serve one of a project's two page orders. Ordering stays as position numbers per page. Status: closed.
