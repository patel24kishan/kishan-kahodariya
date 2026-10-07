# The hero photo is a 647 KB, 2329 × 2329 JPEG — the LCP image on every route

- Raised by: pages
- Date: 2026-10-06
- Area / owner affected: owner decision (the asset) · infra (public/images)
- Severity: note
- Status: open

## What happened

`public/images/profile.jpg` (the only local content image, referenced by both tracks as
`/images/profile.jpg`) is 647,254 bytes at 2329 × 2329 pixels. The hero renders it in a circle
of at most 280 px (desktop) / 120 px (phones), so a visitor downloads roughly 30× more image
than the layout can show. It is the Largest Contentful Paint element of every page, eager and
`fetchpriority="high"` as the contract asks, so its weight sets the LCP time directly, most
visibly on mobile connections.

The pages agent cannot change assets (`public/**` is infra's; the photo itself is the owner's).

## What I need / suggest

- Owner: upload a smaller copy (for example 640 × 640, WebP or a quality-80 JPEG, well under
  60 KB) through the admin, or replace the file in `public/images/`.
- Optionally, infra: serve a `srcset` (320 / 640 / 1280) once the smaller renditions exist. The
  hero already sets explicit `width`/`height`, so no layout work is needed either way.

## Resolution (architect)


Resolved, 2026-10-07. Already handled by the architect before the merge: public/images/profile-640.webp (37 KB) exists and both pages point at it. Status: closed.
