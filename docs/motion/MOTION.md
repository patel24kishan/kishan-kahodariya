# Motion redesign — build spec (branch `redesign/motion-v1`)

> **Status: approved for build.** The owner locked the designs on 2026-10-09 and said go ahead.
> Owned by the architect. Builder agents read this file and never edit it.

The five locked boards are in `docs/sketches/motion/` (plain HTML with inline styles):

| Board | Shows |
|---|---|
| `MotionHero.dc.html` | hero and header on desktop (1440 × 900) |
| `MotionMobile.dc.html` | hero on a phone, and the full-screen menu |
| `MotionNav.dc.html` | header states: over the video, scrolled, light theme, phone |
| `MotionSections.dc.html` | Projects, Experience, Skills, Education / Certificates, footer on desktop |
| `MotionSectionsMobile.dc.html` | every section on a phone |

**The boards win on looks**: sizes, spacing, weights, order, what is and is not there. Read the
ones for your area before writing code. This file says what the boards cannot: behaviour,
content sources, the contract and who owns which file. The text in the boards is sample text;
the page shows what is in `/content`.

`ARCHITECTURE.md` still holds for routes, content model, base path, prerender, accessibility,
engineering rules, logs and reports. Where it or `DESIGN.md` disagrees with this file on looks,
this file wins. Colours, type and spacing still go through tokens (`src/styles/tokens.css`);
turn the boards' raw values into tokens or module-level custom properties.

## Non-negotiables

- **Content is the owner's.** Every word comes from `/content` through `@/content`. Never edit
  his wording, typos included. Never invent a number. Nothing from the agency prompt ships.
- **Stack stays.** React, CSS Modules, tokens. No Tailwind. **No new dependencies** (no
  `lucide-react`: new glyphs are added to the existing `Icon` component as inline SVG).
- **Font is Inter** for everything; display type is weight 800, uppercase.
- **Themes.** Light and dark both work. The hero is always dark because it sits on a video:
  it is an on-dark region in both themes (white text, its own local colours). The sections
  below follow the theme tokens. One accent per page as today.
- **Motion.** Animate `transform` and `opacity` only (a test enforces it). Under
  `prefers-reduced-motion: reduce` nothing moves and everything is visible. Reveal-on-scroll
  must not hide content in the prerendered HTML, for visitors without JavaScript or for
  crawlers: the hidden starting state may only be applied once JavaScript has run, and never to
  something already in view in a way that flashes. Each thing animates in **once**. No layout
  shift. No hydration mismatch (the dev hydration test renders every route in both themes).
- Anything that moves by itself for more than 5 seconds has a visible pause control
  (WCAG 2.2.2) and stops when off screen or when the tab is hidden.
- Works at 320px wide with no sideways scroll; touch targets ≥ 44px; visible focus rings;
  WCAG AA contrast, including text over the video (keep the scrim).

## Behaviour by area

### Header (`MotionNav`, `MotionHero`)
- Sticky at every width. See-through over the hero; a solid bar (canvas colour, hairline below,
  the shorter padding from the board) once the page has scrolled past the top. Over the hero
  its text is white in both themes; once solid it follows the theme.
- Left: the logo (48px, as today, monogram fallback kept) and the site name from `site.name`
  (hidden on phones, as in the board).
- Centre, from 768px: the links from `PAGE_SECTIONS`. Once scrolled, the link of the section in
  view is highlighted (`aria-current="true"` on it).
- Right, from 768px: the "Get in touch" button (`site.contactLabel`, a `mailto:` link to
  `site.email`; not rendered when either is empty), then the theme toggle at the far right.
- Below 768px: logo and menu button only. **No theme toggle in the phone bar.**
- The scrolled state is set from JavaScript after mount (the server renders the top-of-page
  state). It must not cause a layout shift: the bar is out of the flow over the hero.

### Phone menu (`MotionMobile`)
- Full screen, above everything. Links large, 800, uppercase, each sliding up in turn; then the
  "Get in touch" button; then a "Theme" label with the theme toggle.
- A real modal dialog: focus moves in and is trapped, Escape closes and returns focus to the
  menu button, choosing a link closes it, the page behind does not scroll
  (`overscroll-behavior: contain`). Closed, it is not focusable and not announced.

### Hero (`#about`; `MotionHero`, `MotionMobile`)
- One viewport tall (min 560px), content on the left.
- Background: `<video autoplay muted loop playsinline>` covering the section, from
  `track.heroVideo`, poster `track.heroPoster`; decorative (`aria-hidden`, not focusable).
  Behind it a dark gradient like the board's placeholder, which is what shows when there is no
  video, no poster, or the video fails. A scrim over it as in the boards.
  No `<video>` element at all when `heroVideo` is empty. It does not autoplay under reduced
  motion or `navigator.connection.saveData`; it pauses when the hero is off screen or the tab
  is hidden.
- Pause / play button, 44px, bottom right of the hero, always visible when there is a video,
  `aria-pressed`, with an accessible name.
- Content, top to bottom, each block fading up in turn (CSS only, so it also runs without
  JavaScript):
  1. Tagline: crown icon + `track.headline`.
  2. The `h1`: `site.name`, one word per line.
  3. `getSummary(track, tab)` (keep `data-hero-summary`).
  4. Buttons: "See my work" (`site.workLabel`, scrolls to `#projects`; hidden when the label is
     empty); the resume button from `getResume(track, tab)` (keep `data-hero-resume`; hidden
     when the url is empty); from 640px the badge: award icon + `track.badgeLine1` /
     `track.badgeLine2` (hidden when both are empty).
  5. Stats from `getHeroStats(track)` (the row is not rendered when the list is empty).
- Not in the hero any more, as the locked boards show: the profile photo and the hero link
  buttons. The `photo` and `showInHero` fields stay in the content model and the dashboard.

### Sections (`MotionSections`, `MotionSectionsMobile`)
- Section titles are large, 800, uppercase, with the spacing in the boards (already reduced
  20%). They stay `h2`, labelled as today (`<id>-title`).
- **Projects:** title left, tabs right (square; the open tab filled with the accent). Cards
  rise in on scroll with a small stagger. Slider, hover overlay, viewer, buttons, featured
  border, empty state: behaviour unchanged. Tabs stay real links.
- **Experience:** title in the left column; on the right a timeline: an accent line that draws
  itself downward (a `transform: scaleY` on a pseudo-element or a child, never `height`), a dot
  per job (accent for a current job: `present`), the date, company, role, all bullets, tag chips.
- **Skills:** categorised numbered rows (01, 02, …): number, group name, square chips. A line
  draws across the row and the chips arrive once; hover / focus highlights the row. Emphasised
  groups still use the accent. No continuous scrolling, no marquee, no group / skill counter
  line. Every skill appears exactly once in the DOM.
- **Education / Certificates:** two columns on desktop, cards rise in. Order still follows
  `certificatesFirst`.
- **Footer:** only the "Get in touch" band on the accent, left-aligned, and the credit strip, as
  on the live site, with the spacing in the boards. The title text comes from
  `site.contactLabel` (falls back to "Get in touch" when empty).
- **Reveal-on-scroll** is one shared piece (`src/components/motion/`), built on
  `IntersectionObserver`, used by every section.

## Contract additions

```ts
// SiteSettings
workLabel: string;      // "See my work"; "" hides the button
contactLabel: string;   // "Get in touch"
stats: HeroStat[];      // shown in the hero, in this order

export type HeroStatSource = 'projects' | 'companies' | 'years' | 'certificates' | 'custom';
export interface HeroStat {
  source: HeroStatSource;
  /** Only used when source is "custom"; "" otherwise. */
  value: string;
  label: string;
}

// TrackProfile
heroVideo: string;   // URL or site path; "" = no video
heroPoster: string;  // image shown before the video plays and when it does not; "" = none
badgeLine1: string;  // "" on both lines hides the badge
badgeLine2: string;

// @/content
export interface ResolvedHeroStat { value: string; label: string }
export function getHeroStats(track: TrackId): ResolvedHeroStat[];
```

`getHeroStats` resolves each stat for one page: `projects` = number of published projects on
that page's All tab; `companies` = number of published experience entries on that page;
`years` = whole years from the earliest non-empty `startDate` among them to the build date,
written like "7+"; `certificates` = number of published certificates on that page; `custom` =
the stored value, trimmed. A stat that resolves to `0`, `"0+"` or `""`, or whose label is
blank, is dropped. The build date is fixed **at build time** (the content plugin puts it in the
virtual module), never read in the browser, so the prerendered HTML and hydration agree.

Initial content: `workLabel` "See my work"; `contactLabel` "Get in touch"; `stats`
projects / "Projects built", companies / "Companies", years / "Years building". Both tracks:
`heroVideo` the address below, `heroPoster` "", `badgeLine1` "AWS Certified", `badgeLine2`
"Solution Architect".

Video: `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_154941_df1a96e1-a06f-450c-bd02-d863414cc1a0.mp4`
(13 MB, hosted by a third party; the owner can replace it in the dashboard). Tests must never
depend on this address loading: block or stub it.

Any hand-built `SiteSettings` or `TrackProfile` in a test fixture needs the new fields.

## Ownership for this build

Phase 1, alone: **content**. Phase 2, in parallel, each in its own worktree: **hero-nav**,
**sections**, **admin**. The architect merges, resolves conflicts and runs the full regression.

| Agent | Port (dev / build) | Files |
|---|---|---|
| `content` | 5181 / — | `content/**`, `src/content/**` except `types.ts`, `scripts/lib/**`, `scripts/validate-content.ts`, `tests/content/**`; and only to add the new fields to hand-built fixtures: `tests/pages/support/**` |
| `hero-nav` | 5186 / 4186 | `src/components/layout/SiteNav.*`, new files in `src/components/layout/` for the phone menu, `src/components/layout/sections.ts`, `src/components/sections/Hero.*` and new hero files beside it, `src/components/ui/Icon.tsx`, `src/pages/**`, `src/theme/**`, `src/lib/scroll.ts`, `tests/pages/hero*.spec.ts`, `tests/pages/support/hero-fixture*`, `tests/infra/**`, `tests/design/theme.spec.ts` |
| `sections` | 5187 / 4187 | `src/components/motion/**` (new), `src/components/ui/**` except `Icon.tsx`, `src/components/sections/**` except `Hero.*`, `src/components/layout/SiteFooter.*`, `src/styles/**`, `src/dev/**`, `tests/pages/{sections,projects,card-fixture}.spec.ts`, `tests/design/**` except `theme.spec.ts` |
| `admin` | 5188 / 4188 | `public/admin/**`, `scripts/validate-cms-config.ts`, `docs/admin-guide.md`, `tests/admin/**` |

Shared test files (`tests/pages/structure.spec.ts`, `tests/pages/a11y.spec.ts`,
`tests/build/**`): `hero-nav` and `sections` may each change **only the tests about their own
components**, with the smallest edit that works; the architect merges both.

One hand-over between the two UI agents: `SiteFooter` takes a new optional prop
`contactLabel?: string` (`sections` adds it), and `TrackPage` passes `site.contactLabel`
(`hero-nav` adds that line).

Each agent commits its own work on its worktree branch (no push), runs `npx tsc --noEmit` and
the **whole** dev suite on its own port before reporting, and lists failures that belong to
another agent's area instead of fixing them. Never weaken or delete a test to make it pass;
a test that asserts the old design is rewritten to assert the new one.
