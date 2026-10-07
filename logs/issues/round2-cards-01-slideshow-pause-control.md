# The card slideshow has no visible pause control (WCAG 2.2.2)

- Raised by: round2-cards
- Date: 2026-10-07
- Area / owner affected: owner decision (design, pages)
- Severity: guideline
- Status: open

## What happened

`src/components/ui/MediaOverlayButton.tsx` (the `slides` branch) auto-advances a project's
screenshots every 3 s. As asked, it pauses on pointer hover and on keyboard focus, runs only
while the card is on screen and the document is visible, and is off entirely under
`prefers-reduced-motion: reduce`. There is no visible pause / stop control.

WCAG 2.2.2 (Pause, Stop, Hide, level A) applies to auto-updating content that starts
automatically, lasts more than five seconds and is shown in parallel with other content. The
slideshow is all three. The criterion asks for "a mechanism for the user to pause, stop or
hide it". Hover and focus are mechanisms, but:

- a touch-screen visitor has neither hover nor (in practice) keyboard focus, so has no way to
  stop the movement except the system-wide reduced-motion setting, which 2.2.2 does not treat
  as a substitute;
- the hover / focus pause is not announced or discoverable; conformance reviewers generally
  expect a visible control for carousels (see the W3C carousel tutorial, which pairs
  auto-advance with a pause button).

Today no real project has two or more screenshots, so nothing on the live site moves yet; the
question becomes real the day the owner adds a second screenshot to a project.

## What I need / suggest

My judgement: for strict 2.2.2 conformance a visible pause control is required. I did not add
one, as instructed. Options for the owner:

1. Add a small pause / play toggle on the media (a 44 px `IconButton` outside the media
   `<button>`, since a button cannot nest in a button — for example bottom-right next to the
   dots, or in the card's action row). I can build it on request.
2. Accept the hover / focus / reduced-motion behaviour as-is and record the deviation.
3. Make auto-advance opt-in per project (a content flag), so a project without the flag shows
   the first screenshot statically.

## Resolution (architect)
Accepted as raised; the decision is the owner's. Shipped as built for now (pause on hover and on
keyboard focus, off under reduced motion, on-screen and visible-tab only). Nothing on the site
moves today because no project has a second screenshot. Put to the owner on 2026-10-07 with the
architect's recommendation: option 1, a small pause/play button on the image, before the first
project gets a second screenshot. Status: open (owner decision).
