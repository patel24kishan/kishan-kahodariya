# A very short hero text column is centred against the photo, so the name can move on a tab change

- Raised by: tab-summary
- Date: 2026-10-08
- Area / owner affected: pages (design decision)
- Severity: note
- Status: open

## What happened
`src/components/sections/Hero.module.css` lays the hero out as a row with
`align-items: center` from 768px up (`.inner`). The text column is normally taller than the
photo (at most 280px), so the name sits at the top and only the content below the summary
moves when the summary changes length.

If a tab's summary is so short (or empty on a page with no main summary) that the whole text
column becomes shorter than the photo, the column is centred against the photo instead. A tab
change between such a tab and one with a longer summary then moves the name and the headline
by half the height difference. Read from the CSS, not measured: the real content cannot
produce it today (every summary is three lines or more), and the hero fixture has no photo
tall enough to show it. Phones (column layout) are not affected.

The accepted behaviour for this task is "the page below the summary moves"; this is the one
case where something above it would move too.

## What I need / suggest
Nothing now. If it ever shows, `align-items: flex-start` on `.inner` (or `align-self: start`
on `.text`) keeps the name fixed; that changes how a short hero looks next to the photo, so it
is a design call.

## Resolution (architect)
Accepted as a note. Today's content cannot produce it, and the motion redesign replaces this hero layout. No change now.
Status: closed (note)
