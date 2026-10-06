# Migration report

This file is written by the migration script (`npm run migrate`). The script reads the old
site's content from `legacy/constants.js` and writes the new content files under `content/`.
Those files are what the admin edits from now on.

Your text was not rewritten: titles, descriptions, dates and links are stored exactly as they
were in the old file, including spelling. Every value that was changed, left out or could not
work as it was is listed below with what was done.

## Counts

| What | Old site | New content | Note |
|---|---|---|---|
| Projects shown on the old site | 21 | 21 published |  |
| Projects switched off in the old site (inside a comment) | 1 | 1 unpublished | Unity Tools |
| Experience entries | 5 | 5 |  |
| Skill groups | 4 | 4 |  |
| Skills (all groups together) | 22 | 22 | names only; icons dropped |
| Education entries | 2 | 2 |  |
| Certificates | 3 | 3 | descriptions emptied |
| Profile links that had a value | 5 | 5 link files | empty and skipped: twitter, discord, facebook |
| Resume links | 2 | 2 | one per page |
| Page profiles (game, software) | — | 2 | new; text taken from the old bio |
| Site settings | — | 1 | new |

Content files written: 44.

## Things to review in the admin

Nothing here stops the site from working. Each item says what was found and what was done.

1. **Code link that is not a web address.** It was saved with an empty address, so the "View Code" button stays hidden until a real link is added.
    - Crypto Tracker: the old value was `GH`
2. **Buttons with a label but no link.** The old site had a button text and an empty address for these. The label was kept and the address is empty, so the button stays hidden until a link is added: 3D Platformer ("Gameplay"), My Runner ("Play"), Staycation ("More"), Crypto Tracker ("More"), My Digital Locker ("More"), Hospital Management System ("More").
3. **Projects with no code link in the old site.** A "View Code" link with an empty address was created for each, so there is a place to add one; it stays hidden while empty: Scarfall, Dating Square, Ship Simulator, Paint it 3D, My Portfolio.
4. **Video link that is not a standard YouTube address.** It was kept exactly as written in the video field. A normal address looks like `https://www.youtube.com/watch?v=…` or `https://youtu.be/…`.
    - Target Shooter: `https://www.youtube.com/Gameplay?v=Lp46QFgKyKM`
5. **Button label that does not match its link.**
    - Dating Square: the button says "Watch" but points to `https://helpusdefend.com/?page_id=7341`, which is not a YouTube address. It was kept as a normal link button with the same label, not as a video.
    - Paint it 3D: the button says "Gameplay" but points to `https://apps.apple.com/us/app/kolor-it/id1477042251`, which is not a YouTube address. It was kept as a normal link button with the same label, not as a video.
6. **Button label written in capitals.** Kept as written; the other labels use normal capitalisation: My Portfolio ("WEBSITE").
7. **Video buttons.** 4 projects have a YouTube link, now stored in the video field: Tank it, Quest Raider, Third Person Shooter, Target Shooter. The new page shows one fixed "Gameplay" button for a video, so the old button texts ("Gameplay", "GamePlay") are not stored.
8. **Empty social links skipped.** These were empty in the old content, so no link was created: twitter, discord, facebook. Add them in the admin if you have them.
9. **YouTube channel link.** The approved page sketches show a "YouTube" link in the footer. The old content has no YouTube channel address, so none was created.
10. **Duplicate ids in the old file.** The old ids are kept only as a reference (`legacyId`); the new site identifies each project by its file name, so nothing clashes.
    - id -4: 3D Platformer, Tank it
    - id 2: Dating Square, Fruit-Punch
11. **Certificates sharing one link.** The same address is used by more than one certificate; it was kept on each.
    - Unity Junior Programmer and AWS Developer - Associate: `https://www.credly.com/badges/508d3f6b-cadd-40d1-91aa-7f782c8beebe/public_url`
12. **Projects sharing one cover image.**
    - Crypto Tracker and Hospital Management System: `https://i.pinimg.com/originals/6e/12/6a/6e126a9ace040280e45f8144cf0cb2c8.jpg`
13. **Experience entries with identical text.**
    - IBM Canada and Achievers: "Working on the frontend of the web application using ReactJS, Redux, and Material UI."
14. **Experience dates.** The date text is kept exactly as written and is what the page shows. A start month and an end month were also read from it and stored in separate fields; check them:
    - Astro Game Studio: "June 2024 - Present" → start 2024-06, end (none, marked as present)
    - HelpUpDefend: "Dec 2024 - Feb 2025" → start 2024-12, end 2025-02
    - IBM Canada: "December 2023 - February 2024" → start 2023-12, end 2024-02
    - Achievers: "May - August 2022" → start 2022-05, end 2022-08 — the start has no year in the old text; 2022 was assumed from the end date
    - Xsquad Studios by Escrow Infotech: "June 2019 - September 2020" → start 2019-06, end 2020-09
15. **Experience dates that overlap.** Kept as written.
    - Astro Game Studio ("June 2024 - Present") and HelpUpDefend ("Dec 2024 - Feb 2025")
16. **Two different dates for the same work.** The project Dating Square says "Dec 2024 - Mar 2025"; the experience entry HelpUpDefend, which also describes work on 65Square, says "Dec 2024 - Feb 2025". Both were kept as written.
17. **Date range with the same start and end.** Kept as written: My Runner ("July 2023 - July 2023").
18. **Certificate validity periods differ in length.** Kept as written.
    - AWS Solution Architect - Associate: "16 Feb 2023 - 16 Feb 2027" (4 years)
    - AWS Developer - Associate: "14 Dec 2023 - 14 Dec 2026" (3 years)
19. **"HelpUpDefend" spelling.** The company name is written "HelpUpDefend", while its logo and the Dating Square links are on `helpusdefend.com` ("Help Us Defend"). The name was kept as written.
20. **Name.** The old content has the name "Kishan" (the hero said "Hello, I am Kishan"). The new site name is "Kishan Kahodariya", the name shown in the old navigation bar and footer.
21. **Headlines are derived, not yours.** The old site rotated these roles: "a Game Developer", "a Software Engineer", "Cloud Engineer", "Freelancer". They are kept unchanged in the site settings. The page headlines were set to "Game Developer" (game page) and "Software Engineer" (software page); change them in the admin if you want other wording.
22. **Both pages share one summary.** The old site had a single bio text, so the game page and the software page both start with it, unchanged. It talks about gameplay systems and gaming; the software page needs your own text.
23. **Certificate descriptions were emptied.** On all 3 certificates the old description was the same placeholder text about an unrelated web application, and it included test login details. It was not copied into the new content or into this report. The certificate descriptions are now empty; write your own in the admin if you want one.
24. **Possible typing slips, kept exactly as written.** Nothing was corrected. You may want to look at:
    - Dating Square: "Developd"
    - OuiChef: "palyer"
    - Crypto Tracker: "currenccies"
    - Crypto Tracker: "userful"
    - Crypto Tracker: "visulize"
    - Crypto Tracker: "time perio using"
    - Xsquad Studios by Escrow Infotech: "developDeveloped"
25. **Descriptions that start or end with a space.** Kept as written (a browser does not show the extra space): 3D Platformer, Tank it, Dating Square, Staycation, My Portfolio.
26. **"My Portfolio" describes the old site.** Its text says the site was built with React and material-UI, and its link points to `https://patel24kishan.github.io/My-Portfolio/`, which is this site. The rebuilt site no longer uses material-UI. Text and link were kept as written.
27. **Empty tags removed.** An empty tag would show as a blank chip: Tank it (1 empty tag).
28. **Repeated experience tags removed.** The second copy was dropped.
    - Xsquad Studios by Escrow Infotech: "Unity" was listed twice
29. **Project images are loaded from other websites.** 22 project cover images are not stored with this site: each one is a link to a picture on another website. If that website removes or blocks the picture, the card shows a broken image. Each project currently has this one image only. Upload your own screenshots in the admin to replace them.
    - `assetstorev1-prd-cdn.unity3d.com`: 3D Platformer
    - `gamesbeat.com`: Tank it
    - `miro.medium.com`: Quest Raider
    - `gameassetsfree.com`: Third Person Shooter
    - `img.freepik.com`: Target Shooter, My Digital Locker
    - `static.wixstatic.com`: Scarfall
    - `helpusdefend.com`: Dating Square
    - `files.ably.io`: OuiChef
    - `www.freevector.com`: Fruit-Punch
    - `static.vecteezy.com`: Ship Simulator
    - `gameforge.com`: Paint it 3D
    - `img.itch.zone`: Unity Tools, My Runner, Galaxy Shooter, Infinite Racing, Tile Breaker
    - `hd.wallpaperswide.com`: Tic Tac Toe
    - `cdn.vectorstock.com`: Staycation
    - `cdni.iconscout.com`: My Portfolio
    - `i.pinimg.com`: Crypto Tracker, Hospital Management System
30. **Company logos are loaded from other websites.** All 5 experience logos are links to pictures on other sites (`images.squarespace-cdn.com`, `helpusdefend.com`, `www.svgrepo.com`, `media.licdn.com`, `media.glassdoor.com`). Upload your own copies in the admin.
    - Achievers: the address includes an expiry date (2024-05-30), so it may no longer load
31. **Certificate badges are loaded from another website.** 3 badge images are links to `images.credly.com`. They were kept as they are.
32. **Skill icons were dropped.** The new design shows skills as text chips, and most of the old icon addresses pointed at the wrong logo (for example the Android Studio logo for Netcode, Photon, Unity Cloud and Git). The skill names are unchanged. 20 icon addresses were not migrated (they are still in `legacy/constants.js`):
    - Game Dev / AR/VR: `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSBMw6_RdwKQ9bDFfnKDX1iwMl4bVJEvd9PP53XuIw&s`
    - Game Dev / Netcode: `https://developer.android.com/static/studio/images/new-studio-logo-1_1920.png`
    - Game Dev / Photon: `https://developer.android.com/static/studio/images/new-studio-logo-1_1920.png`
    - Game Dev / Unity Cloud: `https://developer.android.com/static/studio/images/new-studio-logo-1_1920.png`
    - Game Dev / Git: `https://developer.android.com/static/studio/images/new-studio-logo-1_1920.png`
    - Programming / C#: `https://raw.githubusercontent.com/devicons/devicon/master/icons/mysql/mysql-original-wordmark.svg`
    - Programming / C++: `https://www.postgresql.org/media/img/about/press/elephant.png`
    - Programming / .NET: `https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg`
    - Programming / Python: `https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg`
    - Programming / Java: `https://cdn.worldvectorlogo.com/logos/java.svg`
    - Backend / MySQL: `https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg`
    - Backend / MongoDB: `https://raw.githubusercontent.com/devicons/devicon/master/icons/mysql/mysql-original-wordmark.svg`
    - Backend / Firebase: `https://raw.githubusercontent.com/devicons/devicon/master/icons/mysql/mysql-original-wordmark.svg`
    - Backend / WebGL: `https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CSS3_logo_and_wordmark.svg/1452px-CSS3_logo_and_wordmark.svg.png`
    - Backend / Javascript: `https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CSS3_logo_and_wordmark.svg/1452px-CSS3_logo_and_wordmark.svg.png`
    - Backend / React Js: an image embedded in the file (data: address)
    - Backend / HTML: `https://www.w3.org/html/logo/badge/html5-badge-h-solo.png`
    - Backend / CSS: `https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CSS3_logo_and_wordmark.svg/1452px-CSS3_logo_and_wordmark.svg.png`
    - Cloud / AWS (Amazon Web Services): `https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg`
    - Cloud / AZURE: `https://raw.githubusercontent.com/devicons/devicon/master/icons/mysql/mysql-original-wordmark.svg`
33. **Education pictures were dropped.** They were stock illustrations of buildings, not the schools' own images.
    - Dalhousie University: `https://static.vecteezy.com/system/resources/previews/002/920/996/non_2x/college-building-academic-building-university-in-traditional-english-style-with-trees-and-a-green-lawn-and-playground-illustration-on-white-background-free-vector.jpg`
    - G H Patel College of Tech & Engg.: `https://static.vecteezy.com/system/resources/previews/033/088/620/non_2x/house-building-illustration-building-and-landmark-object-icon-concept-beautiful-minimalist-home-front-view-with-roof-design-modern-white-flat-commercial-home-design-vector.jpg`
34. **Unused old fields.** The experience entries had a "doc" field that was empty everywhere, and experience, education and certificate entries had numeric ids; none of these are needed in the new content and they were not migrated.
35. **Switched-off project.** "Unity Tools" was inside a comment in the old file, so the old site did not show it. It was migrated as unpublished: it is in the admin, but it is not on the site and is not included in the files sent to visitors. Its details are copied by hand into the migration script, because a script cannot read a comment as data. Publish it in the admin if you want it back.
36. **New fields that start empty.** The old content has nothing for these, so they are empty or switched off until you fill them in: project long description; project hover text (the category's default text is used); "featured" on projects (off); extra screenshots (each project has only its old cover image); experience location and "remote" (off for all 5, although the text of HelpUpDefend mentions remote work); separate experience bullet points per page; education description; the two pages' search-engine descriptions.
37. **Values chosen during migration.** These did not exist in the old content and were set to match the approved design; all can be changed in the admin:
    - Tabs: "Unreal" (unreal), "Unity3D" (unity), "Web Apps" (webapps), plus "All". The old category "webapp" is now "webapps". Default hover texts: "View Gameplay & Screenshots", "View Screenshots", "View Demo & Screenshots".
    - Which page a project belongs to: Unreal and Unity projects → game page, web apps → software page. Every project still appears under its tab on both pages.
    - Experience: Astro Game Studio, HelpUpDefend, Xsquad Studios by Escrow Infotech → game page first; IBM Canada, Achievers → software page first.
    - Skill groups: Game Dev and Programming are highlighted on the game page, Backend and Cloud on the software page. Order on the game page: Game Dev, Programming, Backend, Cloud. Order on the software page: Backend, Cloud, Programming, Game Dev.
    - Order of projects, experience, education and certificates: the order they had in the old file.
    - Link buttons: labels "itch.io", "GitHub", "LinkedIn", "Blog", "Email". In the hero: itch.io (game page only), GitHub, LinkedIn. In the footer: all of them.
    - Page settings: tab opened first — Game Dev: unity, Software: webapps; resume button texts "Game Dev Resume", "Software Resume"; page titles "Kishan Kahodariya — Game Developer", "Kishan Kahodariya — Software Engineer"; profile photo `/images/profile.jpg` (the old site's photo) with the description "Kishan Kahodariya"; certificates are listed before education on the software page.
    - Footer credit: "Developed by Kishan Kahodariya.", "© All rights reserved." (the old footer's text). Monogram: "KK".
    - Image descriptions for screen readers: "<project title> cover image" and "<certificate title> badge".
    - Code links are labelled "View Code". Button types (used for the icon): Scarfall "Play" → play; Dating Square "Watch" → video; OuiChef "Play" → play; Fruit-Punch "Play" → play; Ship Simulator "Play Store" → store; Paint it 3D "Gameplay" → store; Tic Tac Toe "Play" → play; Galaxy Shooter "Play" → play; Infinite Racing "Play" → play; Tile Breaker "Play" → play; My Portfolio "WEBSITE" → demo.

## Not checked

The migration does not open any link, so it does not know whether the links, videos and
images above still work. It only checks that each one is written as a valid address.
