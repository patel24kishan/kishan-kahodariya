# `tsc` and `npm run build` fail until a pages test fixture gains `tabResumes`

- Raised by: round2-content
- Date: 2026-10-07
- Area / owner affected: pages (owner of `tests/pages/**`), architect (merge)
- Severity: blocker
- Status: open

## What happened
The approved contract change makes `tabResumes: TabResume[]` a required field of
`TrackProfile` (`src/content/types.ts`). One file outside my area builds a `TrackProfile` by
hand and therefore no longer type-checks:

```
tests/pages/support/viewer-fixture.tsx(66,7): error TS2741: Property 'tabResumes' is missing in type
'{ id: "game"; route: string; label: string; headline: string; summary: string; resumeUrl: string;
resumeLabel: string; defaultTab: string; photo: string; photoAlt: string; certificatesFirst: false;
metaTitle: string; metaDescription: string; }' but required in type 'TrackProfile'.
```

It is the only error `npx tsc --noEmit` reports on this branch. Because `npm run build` runs
`typecheck` before `vite build`, the build stops there too, and so does the build suite when
it is started the normal way (`Process from config.webServer was not able to start. Exit
code: 1`).

Nothing at run time is affected: the dev suite (which loads that fixture through Vite, without
a type check) passes, and the build suite passes against a `dist/` built with the same steps
minus the type check (`npx vite build` + `npx tsx scripts/prerender.ts`, then
`PW_SKIP_BUILD=1`).

I did not edit the file: `tests/pages/**` is not mine.

## What I need / suggest
One line in `tests/pages/support/viewer-fixture.tsx`, in `FIXTURE_TRACK`, after `resumeLabel`:

```ts
  tabResumes: [],
```

Until that line is in, a merge of this branch fails `npm run build` (and therefore a deploy).
The same applies to any other hand-made `TrackProfile`, `SiteSettings` (`logo`, `logoAlt`) or
`SocialLink` (`orderFooter`) that the two UI agents add in their own tests this round.

## Resolution (architect)
Fixed by the architect at the merge: `tabResumes: []` added to the hand-built track in tests/pages/support/viewer-fixture.tsx and in the cards agent's new tests/pages/support/card-fixture.tsx. tsc exit 0 on the merged tree.
Status: closed
