# The icon files in public/ are the Create React App logo, and favicon.ico is a PNG

- Raised by: infra
- Date: 2026-10-06
- Area / owner affected: owner decision, architect (nobody owns the image files in `public/`)
- Severity: note
- Status: open

## What happened
While rewriting `public/manifest.json` I looked at the icons it referenced:

- `public/logo192.png` and `public/logo512.png` are the default React atom logo that Create React
  App ships. They were the manifest icons and would have been the home-screen icon.
- `public/favicon.ico` is the owner's own logo (a "K" on a pink-to-purple disc), but the file is a
  512 × 512 **PNG** with an `.ico` name (first bytes `89 50 4E 47`), 176 KB. Browsers sniff the
  content, so it displays, but it is a large download for a tab icon.

What I did, inside my files only:
- `public/manifest.json` now lists one icon, `favicon.ico`, declared truthfully as
  `image/png`, `512x512`. The React logos are no longer referenced anywhere.
- `index.html` has `<link rel="icon" href="…/favicon.ico">` and no `apple-touch-icon`, because
  there is no suitable file to point it at.

## What I need / suggest
An owner/architect decision; low priority, nothing is broken:
- Export the owner's logo properly: `favicon.ico` (real ICO, 32px) or `favicon.svg`, plus
  `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` (180px).
- Delete `public/logo192.png` and `public/logo512.png` (they are still copied into `dist/`).
- Then I (or whoever owns `index.html` / `manifest.json` at that point) add the three links back.

## Resolution (architect)

Decided, 2026-10-06. public/favicon.ico is not a React logo: it is the owner's own "K24" mark saved as a 512px PNG with an .ico name. Keep it as the site icon. The architect converts it into correctly named and sized PNG icons at integration (favicon 64px, 192px, 512px), points index.html and the manifest at them, and removes the two Create React App logo files. Status: architect, at phase-1 integration.
