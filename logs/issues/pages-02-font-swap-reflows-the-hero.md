# The Inter font swap reflows the hero by about 70 px on a first visit

- Raised by: pages
- Date: 2026-10-06
- Area / owner affected: design (font loading in src/styles/index.css) · infra (index.html head)
- Severity: note
- Status: open

## What happened

While writing the viewer's scroll-lock test I measured the first project card before and after
opening the viewer and saw it move 73 px — not because of the viewer, but because Inter
Variable arrived in between. Measured on the dev server at 1280 × 800: `#about` is 494 px tall
with the fallback font and 420 px once `Inter Variable` has loaded (the summary wraps onto
fewer lines, the display heading is narrower). `@fontsource-variable/inter` is loaded with
`font-display: swap` and nothing preloads it, so on a cold cache every page paints with the
system font first and then shifts (CLS) when the woff2 lands. `document.fonts.ready` resolves
before the request has even started on a fresh page, which is why my first measurement was
taken too early; the tests now wait for `document.fonts.load()`.

## What I need / suggest

- infra: add `<link rel="preload" as="font" type="font/woff2" crossorigin href="…">` for the
  latin `wght` subset to `index.html` (the hashed URL is known at build time: Vite can emit
  it from the CSS, or the file can be referenced through `@fontsource-variable/inter/files/…`).
- design: consider `font-display: optional` or a `size-adjust`ed fallback face so the swap
  does not move the layout. The Web Interface Guidelines ask for critical fonts to be
  preloaded with `font-display: swap`.

## Resolution (architect)


Deferred to phase 3, 2026-10-07. The QA pass measures layout shift with Lighthouse; if the hero shift shows up in the score, the Inter latin file is preloaded from index.html. Status: open, assigned to phase 3.
