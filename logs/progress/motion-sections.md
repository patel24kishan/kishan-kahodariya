# motion-sections (builder: sections)

- 2026-10-09 sections: started on 6530d11 (fast-forwarded the worktree branch), npm ci done.
- 2026-10-09 sections: tokens (display type --text-section / --text-section-sm, --section-pad, --radius-square, --color-card, --container-max 1312px, --ease-out, --reveal-distance), reveal CSS in base.css.
- 2026-10-09 sections: src/components/motion (useReveal, Reveal): hidden state set by script after mount only, only below the fold, off under reduced motion, once, marks removed after the entrance.
- 2026-10-09 sections: Section (display titles, actions slot, split layout, hidden h2), SegmentedTabs square, Chip square, MediaOverlayButton square; Projects, Experience (timeline), Skills (numbered rows), Education (two columns), SiteFooter (contactLabel).
- 2026-10-09 sections: projects.spec "exactly as stored" failure: the component was right (a card slides only through screenshots that load, and a hot-linked first screenshot of quest-raider was blocked by the test harness, leaving one live slide and no dots); the test now serves every hot-linked screenshot so its expectation comes from the content.
- 2026-10-09 sections: done. tsc clean (2 known validate-cms errors). Dev suite 1446 passed, 59 skipped, 37 failed (33 admin, 4 content/validator, none ours). Build suite (dist built by hand: vite build + prerender, PW_SKIP_BUILD=1) 254 passed.
