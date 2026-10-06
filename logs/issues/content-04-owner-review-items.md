# Content items only the owner can settle

- Raised by: content
- Date: 2026-10-06
- Area / owner affected: owner decision
- Severity: question
- Status: open

## What happened
The migration kept every doubtful value as written (or stored `url: ""`) and listed each one in
`docs/migration-report.md` (37 numbered items). None of them breaks the site. The ones that need
the owner's own input, because no correct value exists in the old content:

1. **Software page summary and both headlines.** Both pages start with the single old bio text,
   which is about gameplay systems and gaming. Headlines "Game Developer" / "Software Engineer"
   are derived, not the owner's wording.
2. **Missing or unusable links.** Crypto Tracker's code link was `GH`; six projects have a button
   label with no address (3D Platformer, My Runner, Staycation, Crypto Tracker, My Digital Locker,
   Hospital Management System); five projects have no code link. All are stored with `url: ""`.
3. **Target Shooter video link** `https://www.youtube.com/Gameplay?v=Lp46QFgKyKM` is not a standard
   YouTube address. Kept as written in `videoUrl`; the viewer may not be able to embed it.
4. **Paint it 3D** has a "Gameplay" button that points to an App Store page; **Dating Square** has a
   "Watch" button that points to a web page. Both kept as normal link buttons.
5. **Certificates**: Unity Junior Programmer and AWS Developer – Associate share one Credly address;
   all three descriptions are now empty (the old placeholder text was dropped as instructed).
6. **Dates**: Astro Game Studio and HelpUpDefend overlap; Dating Square (project) and HelpUpDefend
   (experience) give different end months for the same work; "May - August 2022" has no start year.
7. **"HelpUpDefend"** is spelled that way while its links are on `helpusdefend.com`.
8. **Images**: all 22 project covers, all 5 company logos and the 3 certificate badges are hotlinked
   from other websites; the Achievers logo address carries an expiry date of 2024-05-30.
9. **YouTube channel link**: the sketches show one in the footer; the old content has no address,
   so no link file was created.
10. **"Unity Tools"** was commented out in the old site; it is migrated as unpublished.

## What I need / suggest
Nothing blocks the build. The owner can work through `docs/migration-report.md` in the admin once
phase 2 is done. For item 3 the pages agent should decide how the viewer treats a YouTube address
it cannot parse (suggest: fall back to opening the link in a new tab).

## Resolution (architect)
Noted, 2026-10-06. These go to the owner with the migration report at the phase-1 checkpoint. Item 3 (video address the viewer cannot parse): the pages agent must read the video id from the v parameter, youtu.be and /embed/ forms, and fall back to opening the address in a new tab when no id is found. Status: open until the owner has reviewed the report.
