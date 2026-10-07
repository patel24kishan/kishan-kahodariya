# React 19 hoists a preload <link> into #root, ahead of the page root — the theme probe reads it as the app

- Raised by: pages
- Date: 2026-10-07
- Area / owner affected: infra (tests/infra/support/theme-probe.ts) · pages (src/components/sections/Hero.tsx)
- Severity: bug (in the probe) / note (in the page)
- Status: open

## What happened

The hero photo is the LCP image and the contract asks for `fetchpriority="high"` on it. With
`<img fetchPriority="high">` in the tree, React 19's `renderToString` emits a hoisted
`<link rel="preload" as="image" href="…/images/profile.jpg" fetchPriority="high" …/>`. The
rendered tree has no `<head>`, so the link is written at the very start of the output — it
becomes the first child of `#root` in every prerendered page:

    <div id="root"><link rel="preload" as="image" …/><div id="top" data-testid="track-page" …>

`tests/infra/support/theme-probe.ts` takes `document.querySelector('#root > *')` as "the app"
and waits for a React fiber on it; a `<link>` never gets one, so all 24 "theme on a
prerendered page" build tests time out (`readThemeProbe`). The other hydration tests pass:
they look for `[data-testid="track-page"]`, the hook ARCHITECTURE.md §11 defines.

## What I did

React preloads every non-lazy `<img>` it renders on the server (with or without
`fetchPriority`), except images inside a `<picture>`. The hero photo is now rendered as
`<picture><img … fetchpriority="high"></picture>` (`ContentImage`'s `picture` prop), which
keeps the priority hint in the HTML and emits no hoisted link. The build suite is green again.

## What I need / suggest

infra: make the probe look for the page hook (`[data-testid="track-page"]`, or `#root [data-testid]`)
instead of `#root > *`, as `waitForReact()` already does — a future above-the-fold image
rendered outside a `<picture>` would trip it again, and the hoisted preload link itself is
harmless (browsers honour `<link rel="preload">` in the body).

## Resolution (architect)


Accepted, 2026-10-07. The <picture> workaround in the hero stays. The test helper tests/infra/support/theme-probe.ts will be changed in phase 3 to look for [data-testid=track-page] instead of the first child of #root. Status: open, assigned to phase 3.
