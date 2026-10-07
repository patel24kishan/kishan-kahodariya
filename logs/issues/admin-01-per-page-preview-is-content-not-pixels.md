# The per-page preview shows exact content, not the exact look

- Raised by: admin
- Date: 2026-10-07
- Area / owner affected: owner decision, architect, pages
- Severity: question
- Status: open

## What happened
The owner asked to see how an item looks on the game page and on the software page before
publishing. What Sveltia CMS 0.230.0 can do (docs: `/en/docs/ui/content-editor#preview-pane`,
`/en/docs/api/preview-templates`, `/en/docs/api/preview-styles`; each checked in the browser):

- **Built-in preview:** a plain list of the fields and their values. Not page-like.
- **Custom preview template:** a React component per collection or file, registered with
  `CMS.registerPreviewTemplate()`, drawn in an iframe with CSS registered through
  `CMS.registerPreviewStyle()`. It receives the unsaved form values and re-renders while the
  owner types. It can read other entries (`getCollection`) and uploaded files (`getAsset`).
- **Not available:** rendering the real site with unsaved data. The Sveltia docs say this is
  not planned ("we don't plan to support live site previews that fetch data from the actual
  website"). There are also no per-branch preview deploys on GitHub Pages.

A custom template cannot import the site's components: the dashboard is a static page in
`public/admin`, the components are TypeScript with hashed CSS-module class names, and
`pages` was still building them. A template that redraws the site by hand would look close
and drift silently — that is the fake the brief forbids.

## What I built (inside my files)
`public/admin/preview.js` + `preview-logic.js` + `preview.css`: a **content preview**. For
each item it shows the game page and the software page side by side with

- the same words in the same places, in each page's accent colour;
- the resolved hover text (own, or the tab's default, depending on the video);
- the bullet set each page will use for a job;
- which buttons are shown and which are hidden for lack of an address;
- where a link appears (next to the name / footer / not on this page, with the reason);
- which page lists the item among its own, its position, and a draft notice.

It is labelled at the top of every preview: "Content preview. The words, the order and what
is shown or hidden are exactly what each page will get. Fonts, spacing and image cropping
are simplified — the live site is the final look." The guide says the same (section 11).

The rules are a second copy of `src/content/selectors.ts`. `tests/admin/preview.spec.ts`
runs the copy against the real selectors for every item under `/content` and fails on any
difference, so the content part cannot drift unnoticed. The look can: it is not tested
against the site and is not meant to match it.

## What I need / suggest
A decision on whether a content preview is enough. Options:

1. **Keep this** (recommended for go-live): exact content, approximate look, no extra cost.
2. **Faithful preview, built in the site (architect / pages):** a route such as
   `/My-Portfolio/__preview` that renders the real `TrackPage` (or one card / one job) from
   data it receives with `postMessage`. The preview template then only embeds that route in
   an iframe and posts the draft to it. This gives the real components, CSS and responsive
   layout. It needs: the route (prerender-excluded, `noindex`), a small message contract, a
   way to merge one draft item into the published content, and a decision on shipping that
   route in production. About a day of work, outside the admin files.
3. **Preview deploy:** a second workflow that builds a `preview` branch into a sub-folder.
   Possible, but every preview would be a public commit and a second build, and the dashboard
   would have to save to another branch first. I do not recommend it.

## Resolution (architect)

Ruled, 2026-10-07. Accepted for go-live: the dashboard shows a side-by-side content preview (exact words, hover text, bullet set, buttons and position per page; approximate look), and says so. A pixel-true preview needs a preview route in the site itself; that is offered to the owner as a later option, not built now. Status: owner decision pending; not blocking.
