# Motion redesign — build spec (branch `redesign/motion-v1`)

Owned by the architect. The owner supplied a prompt for an agency hero page ("VANGUARD") and
asked for the site to be re-imagined from it **using his own content**. He approved three
mockups, saved in `docs/sketches/motion/` (`MotionHero`, `MotionMobile`, `MotionSections`,
plain HTML with inline styles: read them for exact sizes, spacing and copy placement).

`ARCHITECTURE.md` still holds for routes, content model, base path, prerender, accessibility
and engineering rules. Where this file and `DESIGN.md` disagree on looks, this file wins.

## Non-negotiables

- **Content is the owner's.** Every word on the page comes from `/content` through `@/content`.
  Nothing from the prompt's agency copy ships ("Design. Disrupt. Conquer.", "250+ Brands", …).
  Never edit his wording, typos included. Never invent numbers.
- **Stack stays.** React, CSS Modules and design tokens. No Tailwind. Translate the prompt's
  utility classes into CSS. `lucide-react` is installed and is the icon source for the new
  glyphs (`ArrowUpRight`, `Award`, `Crown`, `X`, `Pause`, `Play`); the existing `Icon` set stays
  for link and brand icons.
- **Font is Inter** (self-hosted, already in the project) for everything, weight 800 uppercase
  for display type. The prompt's "PODIUM" demo font is not used (licence unconfirmed).
- **Themes.** Light and dark stay, with the toggle in the nav. The hero is always dark because it
  sits on a video: mark it as an on-dark region. The sections below follow the theme tokens.
  One accent per page as today (`#faff69` game, `#7cb2ff` software).
- **Motion rules.** Animate `transform` and `opacity` only. Everything is off under
  `prefers-reduced-motion: reduce` (content fully visible, nothing hidden). Reveal-on-scroll
  must not hide content from no-JS visitors, crawlers or the prerendered HTML: the hidden
  starting state may only be applied once JavaScript has run. No layout shift. No hydration
  mismatch. Anything that moves by itself for more than 5 seconds has a visible pause control
  (WCAG 2.2.2) and pauses when off screen or when the tab is hidden.
- Everything keeps working at 320px wide with no sideways scroll; touch targets ≥ 44px;
  visible focus rings; WCAG AA contrast, including text over the video (use a scrim).

## The page, top to bottom

### Nav (transparent over the hero, solid canvas once scrolled past it)
- Padding: 20px 24px phone, 20px 40px from 640px, 28px 64px from 1024px.
- Left: the logo (48px, as today) and, from 640px, the site name in 700 uppercase,
  letter-spacing 0.1em, 20px (24px phone / 30px in the prompt was for its display font; use 20px).
- Centre, from 768px: the section links from `PAGE_SECTIONS`, 13–14px, uppercase,
  letter-spacing 0.2em, 80% opacity, full opacity on hover.
- Right, from 768px: theme toggle, then "Get in touch" (`site.contactLabel`) with an
  `ArrowUpRight`, bordered (1px, 30% white → 60% on hover), padding 12px 24px, 12px uppercase,
  letter-spacing 0.2em, square corners. It links to `mailto:` + `site.email`.
- Below 768px: menu button (three bars 24/24/16px wide, 2px tall, 6px apart, in a 44px target),
  then the theme toggle.

### Phone menu (below 768px)
- Fixed, full screen, above everything, canvas at 95–96% black with a slight backdrop blur.
  Fades in over 500ms; closed it is not focusable and not announced.
- Header row like the nav: logo left, `X` right.
- Links stacked, 800 uppercase, 36px (40px from 640px); each fades and rises 20px into place
  with a delay of `index × 80ms + 100ms`. "Get in touch" bordered button below, same stagger.
- A real modal: focus moves in and is trapped, Escape closes and returns focus to the menu
  button, a link closes it, the page behind does not scroll.

### Hero (`#about`, exactly one viewport tall, min 560px, content left, vertically centred)
- Background: `<video autoplay muted loop playsinline>` covering the section
  (`object-fit: cover`), from `track.heroVideo`, with `track.heroPoster` as poster. Decorative
  (`aria-hidden`, not focusable). A scrim over it (about 78% black at the left fading to 10% at
  the right; an even ~58% on phones). No video element at all when `heroVideo` is empty.
  It does not autoplay under reduced motion or `navigator.connection.saveData`; the poster shows.
- Pause / play button, 44px, bottom right of the hero, always visible, `aria-pressed`.
- Content, each block fading up 30px over 0.8s ease-out, 0.2s apart:
  1. Tagline: `Crown` 16px + `track.headline`, 12–14px uppercase, letter-spacing 0.3em, 70% white.
  2. The h1: `site.name`, one word per line, 800 uppercase, line-height 0.92,
     letter-spacing -0.03em, `clamp(2.8rem, 8vw, 7.4rem)`.
  3. `track.summary`, 14–16px, 72% white, max-width 520px.
  4. Buttons: black "See my work" (`site.workLabel`) + `ArrowUpRight` (scrolls to `#projects`;
     the arrow nudges up-right on hover); bordered resume button (`getResume(track, tab)`, as
     today); the hero links from `getLinks(track, 'hero')` may follow as bordered icon buttons.
     From 640px: `Award` 32px + `track.badgeLine1` / `track.badgeLine2` (hidden when both empty).
  5. Stats: `getHeroStats(track)`, value 28px phone / 36px / 48px in 700, label 9–12px uppercase
     letter-spacing 0.18em 55% white. Wraps.
- The profile photo is no longer in the hero (the owner approved the mockup without it). The
  `photo` field stays in the content model and the dashboard, unused for now.

### Sections (see `MotionSections` mockup)
- Section titles: 800 uppercase, letter-spacing -0.03em, line-height 0.95,
  `clamp(2.5rem, 6vw, 5.5rem)`; 96–120px between sections on desktop.
- **Projects:** title left, tabs right (square, the open tab filled with the accent). Cards:
  square corners, `#141414`-like raised surface with a hairline border, rise in on scroll with a
  small stagger. Screenshot slider, hover overlay, viewer, buttons: behaviour unchanged.
- **Experience:** title in the left column; right, a timeline: a 2px accent line that draws
  itself downward, a dot per job (accent for a current job), date in a narrow column, company
  26px/700, role, bullets, tag chips. All bullets stay visible.
- **Skills:** each group is one row that drifts sideways (marquee), alternate rows in opposite
  directions, the emphasised groups in the accent. Hover or focus within pauses; a visible
  pause control for the section; under reduced motion and without JavaScript the rows are an
  ordinary wrapping list. The group title must remain readable and every skill must be
  reachable by assistive technology exactly once (duplicate marquee copies are `aria-hidden`).
- **Education / Certificates:** two columns, cards rise in. Order still follows
  `certificatesFirst`.
- **Get in touch** (`#contact`, new, after Education): title `site.contactLabel`, then
  `site.email` as a large accent `mailto:` link with `ArrowUpRight`, then the footer links
  (`getLinks(track, 'footer')` without the email one) as bordered buttons.
- **Footer:** unchanged.

## Contract additions (content agent implements; UI agents consume exactly these)

```ts
// SiteSettings
workLabel: string;      // "See my work"
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
heroPoster: string;  // image shown before the video plays and when it does not
badgeLine1: string;  // "" on both lines hides the badge
badgeLine2: string;

// @/content
export function getHeroStats(track: TrackId): { value: string; label: string }[];
```

`getHeroStats` resolves each stat for one page: `projects` = number of published projects on
that page's All tab; `companies` = number of experience entries on that page; `years` = whole
years from the earliest `startDate` among them to the build date, written "7+";
`certificates` = number of certificates; `custom` = the stored value. A stat that resolves to
0 or "" is dropped. The values are computed at build time (in the content plugin), never in
the browser, so the prerendered HTML and hydration agree.

Initial content: `workLabel` "See my work"; `contactLabel` "Get in touch"; `stats`
projects / "Projects built", companies / "Companies", years / "Years building"; both tracks:
`heroVideo` the prompt's video URL (below), `heroPoster` "/images/hero-poster.webp" (a still
taken from that video), `badgeLine1` "AWS Certified", `badgeLine2` "Solution Architect".

Video: `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_154941_df1a96e1-a06f-450c-bd02-d863414cc1a0.mp4`
(13 MB, hosted by a third party; the owner can replace it in the dashboard).

Any hand-built `SiteSettings` or `TrackProfile` in a test fixture needs these fields.
