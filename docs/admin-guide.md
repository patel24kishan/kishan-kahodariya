# Editing the site from the dashboard

This is the guide for the site owner. No code is needed for anything in it.

## 1. What the dashboard is

- The dashboard is a page of the site: **`https://patel24kishan.github.io/kishan-kahodariya/admin/`**
- It shows every piece of content — projects, jobs, skills, links, education, certificates,
  the two pages and the site settings — as forms.
- When you press **Save**, the change is stored in the GitHub repository
  `patel24kishan/kishan-kahodariya`. GitHub then rebuilds the site by itself. A minute or two later
  the change is live.
- There is no password for the dashboard. Anyone can open the page, but only someone holding
  an **access token** for the repository can save. You create that token once, in your own
  GitHub account (next section).

The dashboard is an open-source program called Sveltia CMS. It costs nothing and there is no
account to create for it.

## 2. Create your access token (once)

1. Sign in to GitHub in your browser.
2. Open the dashboard address above and click **Sign In Using Access Token**. In the box that
   opens, click the link **GitHub user settings page**. It takes you to GitHub's "New
   fine-grained personal access token" page with the right permission already chosen.
   (Without the link: GitHub → your photo → Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token.)
3. Fill in the page like this:
   - **Token name:** `Portfolio admin` (any name works).
   - **Expiration:** 90 days. A token that expires is safer than one that lasts forever. Put a
     reminder in your calendar; making a new one takes two minutes.
   - **Repository access:** choose **Only select repositories**, then pick **kishan-kahodariya**.
     Do not choose "All repositories".
   - **Permissions → Repository permissions → Contents:** **Read and write**.
     "Metadata: Read-only" is added by GitHub on its own. Leave everything else at "No access".
4. Click **Generate token** and copy the token. GitHub shows it only once.
5. Keep it in a password manager. Not in a note, not in an email, not in a chat.

**To take a token away** (lost laptop, token pasted somewhere by mistake, or you are simply
done): GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
→ the token → **Delete**. It stops working at once. Then make a new one.

## 3. Sign in

1. Open `https://patel24kishan.github.io/kishan-kahodariya/admin/`.
2. Click **Sign In Using Access Token**, paste the token, click **Sign In**.

Good to know:

- The box shows the token as plain text while you paste it. Do not do this while sharing your
  screen.
- The browser remembers the token until you sign out (your name, top right → **Sign Out**).
  On a computer that is not yours, always sign out.
- When the token has expired, signing in fails. Make a new token (section 2) and sign in again.

## 4. How saving works

- **Save** publishes. There is no separate "publish" button: a save goes to GitHub and the
  site rebuilds.
- Every item has a **Published** switch. Off means *draft*: the item is saved but is not on
  the site. **New items start with Published off**, so nothing half-finished appears by
  accident. Switch it on and save when the item is ready. In the lists, drafts are marked
  `DRAFT`.
- If you leave a form without saving, the dashboard keeps your typing in this browser and
  offers to bring it back next time.

## 5. Add a project

1. Click **Projects** on the left, then **New**.
2. **Short name (file name):** a short name in lower-case letters, numbers and hyphens, for
   example `my-new-game`. It names the file and is never shown on the site. You choose it
   once; it cannot be changed later.
3. **Title**, **Short description** (the text on the card), **Date** (written the way you
   want it shown).
4. **Tags:** one per row. Press Enter for the next row. Drag the handle on the left to reorder.
5. **Tab:** the project tab the card sits under (Unreal, Unity3D, Web Apps…).
6. **Page:** Game page, Software page or Both pages. Every tab is on both pages, so the card
   can be seen on both. This choice decides which page treats the project as its own: on the
   "All" tab, a page lists its own projects first.
7. **Position on the game page / on the software page:** lower numbers come first. Leave gaps
   (10, 20, 30…) so a new project fits in between.
8. **Card hover text:** the words shown over the card image when a visitor points at it.
   At most 4 words. Leave it empty to use the default of the tab.
9. **Screenshots:** click **Add Screenshot**, then **Browse** and **Upload** to pick a picture
   from your computer. Write a **Description of the image** for each one (one short sentence
   for people who cannot see the picture). The first screenshot is the card image; drag to
   reorder.
10. **Gameplay / demo video (YouTube):** paste the YouTube address. The card then gets a
    Demo button and the video plays inside the site.
11. **Buttons:** click **Add Button** for each link under the card (View Code, Play, Live
    Demo…): the button text, the address, the kind of link. A button with an empty address is
    not shown.
12. Look at the preview on the right (section 11).
13. Switch **Published** on and press **Save**.

**Featured** puts the card first and gives it the coloured border.

## 6. Add a job, with different bullet points on each page

1. Click **Experience**, then **New**.
2. Fill in the short name, **Company**, **Job title**, **Date as shown**, and if you like
   the location, the start and end (written `YYYY-MM`, for example `2024-06`) and the logo.
3. **Bullet points:** one sentence per row. These are used on both pages.
4. To show something different on one page, add rows under **Bullet points for the software
   page only** (or **…for the game page only**). That page then shows those rows *instead of*
   the general ones. The other page keeps the general ones. Leave the list empty to use the
   general ones.
5. **Page:** every published job is on both pages; this decides which page lists it first.
6. Check the preview: it shows the two pages side by side with the bullet points each will get.
7. Switch **Published** on and press **Save**.

## 7. Add a link (for example YouTube)

1. Click **Links**, then **New**.
2. **Short name:** `youtube`. **Link text:** `YouTube`.
3. **Address:** the full address, for example `https://www.youtube.com/@yourchannel`.
   For email write `mailto:you@example.com`.
4. **Icon:** YouTube.
5. **Page:** the page(s) the link is shown on.
6. **Show next to your name (top of the page)** and **Show in the footer:** switch on the
   places you want. With both off, the link is not shown anywhere.
7. **Position next to your name** and **Footer order:** the link has one number for each of
   its two places. Lower numbers come first.
8. Switch **Published** on and press **Save**.

### Change the order of the links in the footer

The footer has its own order. It does not follow the order of the buttons next to your name.

1. Click **Links** and open a link.
2. Change **Footer order**. Lower numbers come first; leave gaps (10, 20, 30…) so a link fits
   in between later. Today: Email 10, itch.io 20, LinkedIn 30, GitHub 40, Blog 50.
3. Press **Save**. Do the same for every link you want to move.

**Position next to your name** is the other number. It only moves the buttons at the top of
the page. Changing one number never moves the link in the other place.

A link that is set to one page only (itch.io is on the game page only) is simply left out on
the other page; the rest keep their order.

## 8. Change a page: headline, summary, resume

1. Click **Pages**, then **Game page** or **Software page**.
2. Change the **Headline**, the **Summary**, the **Resume link** (for example a Google Drive
   share link — leave it empty to hide the button) and the **Resume button text**.
3. **Project tab that opens first** is the tab a visitor sees when the page opens.
4. **Profile photo**, **Browser tab and search title**, **Search result description** are
   here too, and so are the background video and the badge (the buttons and the numbers are
   under **Site settings**; see "Change the top section" below).
5. Press **Save**.

Your name, the logo, the footer credit lines and the project tabs are under
**Site settings**.

### Give a project tab its own summary

The summary is the paragraph under the headline. Each page has one main summary (the
**Summary** field above). A project tab can have a summary of its own: while a visitor has
that tab open, the page shows that text instead of the main one.

**The software page.** Its summary is its own **Summary** field: click **Pages**, then
**Software page**, write the text in **Summary** and press **Save**. It is separate from the
game page's summary.

**The Unity tab and the Unreal tab of the game page.** Each has a row of its own:

1. Click **Pages**, then **Game page**.
2. Under **Resume and summary for a specific tab**, open the row of the tab. The game page
   already has an empty row for **Unreal** and one for **Unity3D**; **Tab this row is for**
   shows which tab a row belongs to.
3. Write the text in **Summary on this tab**. Leave an empty line between two paragraphs.
4. Press **Save**. Do the same in the other row for the other tab.

For any other tab, click **Add Resume and summary for one tab**, choose the tab in **Tab this
row is for** and write its summary.

Good to know:

- A row whose **Summary on this tab** is empty changes nothing: that tab shows the main
  summary. To go back to the main summary, empty the box and save.
- The summary and the resume of a row are independent. You can fill in only the summary, only
  the resume link, or both.
- A tab's summary can be longer or shorter than the main one. The rest of the page simply
  moves down or up when a visitor changes tab.
- Tabs without a row (and the "All" tab) show the main summary.
- The summary belongs to the page: a row on the game page does not change the software page.

### Add a resume for one project tab

A page has one main resume (the **Resume link** above). A project tab can have a resume of
its own: while a visitor has that tab open, the resume button opens that one instead.

1. Click **Pages**, then the page (for example **Game page**).
2. Under **Resume and summary for a specific tab**, open the row of the tab — the game page
   already has an empty row for **Unreal** and one for **Unity3D** — or click **Add Resume and
   summary for one tab** and choose the tab in **Tab this row is for**.
3. Paste the link in **Resume link for this tab**. It must be a full address starting with
   `https://`, for example a Google Drive share link.
4. **Button text for this tab** is optional, for example `Unreal Resume`. Left empty, the
   button keeps the **Resume button text** of the page.
5. Press **Save**.

Good to know:

- Leave the list empty to use the main resume and the main summary on every tab.
- A row without a link does not change the resume: that tab uses the main resume until you
  paste one. (Its summary still counts, if you wrote one.)
- Use each tab in one row only. Two rows for the same tab are refused (section 13).
- The "All" tab cannot be chosen here. It always uses the main resume and the main summary.
- To go back to the main resume, empty the link of the row and save. Delete the row only when
  the tab should use the main summary as well.

### Change the logo

The logo is the small picture in the top-left corner of both pages.

1. Click **Site settings**.
2. Under **Logo image**, click **Replace** (or **Browse** when there is no picture yet), then
   **Upload**, pick the picture and click **Insert**. A small square picture works best: it
   is shown about 40 pixels wide.
3. Write a few words in **Logo description**, for example your name. People who cannot see
   the picture hear these words.
4. Press **Save**.

To show the **Logo letters** (`KK`) instead of a picture, click **Remove** under **Logo
image** and save.

### Change the top section: video, badge, buttons and numbers

The top section of each page has a video playing silently behind your name, two buttons, a
small badge and a row of numbers. Leaving a field empty hides that part; nothing breaks.

On each page (**Pages**, then **Game page** or **Software page**):

- **Background video of the top section** — paste the address of a video file (it starts with
  `https://` and usually ends in `.mp4`). Do not upload video files here; keep them small, a
  big file makes the page slow to open. Empty means no video: the dark background is shown.
- **Picture shown before the video** — shown while the video loads, and for visitors whose
  device does not play it. Upload it like any other picture. Empty means no picture.
- **Badge, first line** and **Badge, second line** — for example *AWS Certified* and
  *Solution Architect*. Empty on both lines hides the badge.

Under **Site settings** (the same for both pages):

- **Text of the "See my work" button** — empty hides the button.
- **Text of the contact button** — also the title of the coloured band at the bottom. Empty
  shows "Get in touch".
- **Numbers in the top section** — one row per number, in the order shown (drag to
  reorder). For each row, choose **Where the number comes from**:
  - a counted number (projects, companies, years of experience, certificates) is worked out
    by the site and **updates by itself** when you add or remove items, or when a year goes
    by. You do not type it;
  - **A number I type myself** uses what you write in **Your number**, for example `12+`.

  Write the words under the number in **Words under the number**. A row with no words, or
  whose number comes out as 0 or empty, is not shown. Delete all the rows to hide the whole
  row of numbers.

The preview shows these as text and a simple layout. It does not play the video.

## 9. Add a new project tab

1. Click **Site settings**. Under **Project tabs** click **Add Project tab**.
2. **Tab ID:** lower-case letters, numbers and hyphens, for example `godot`. It becomes part
   of the page address (`/gamedev/godot`).
3. **Tab name:** what visitors read, for example `Godot`.
4. **Position:** lower numbers come first. The "All" tab is always last.
5. The two **hover text** boxes are the default words for cards of this tab (at most 4 words).
6. Press **Save**. The new tab can now be chosen in the **Tab** field of every project.

Two rules:

- **Never change the ID of a tab that already has projects.** The projects point at the ID.
  Changing the *name* is always fine.
- Do not delete a tab that still has projects. Move the projects to another tab first.
  If a page has a resume and summary row for that tab (section 8), delete that row too.

If you break either rule the site does not break — the update is refused (section 13).

## 10. Change the order of things

The order is set by the **Position** number of each item; lower numbers come first.
Projects, jobs, skill groups and certificates have two numbers, one for each page.
Links have two numbers as well, one for each place: next to your name and in the footer
(section 7).

In a list, **Sort** shows the items by position, and **Group** (projects) groups them by tab
or by page, which makes it easy to see what to change. To move an item, open it, change its
number and save.

There is no drag-and-drop for the order of items. (Rows *inside* an item — tags, bullet
points, screenshots, buttons — can be dragged.)

## 11. The preview

When you open an item, the right half of the screen shows a **content preview**: what the
**game page** and the **software page** will show for this item, side by side, updated while
you type.

What you can rely on:

- the words, and where each one goes;
- which hover text a card gets (its own, or the default of its tab);
- which bullet points each page shows for a job;
- which buttons are shown and which are hidden because they have no address;
- whether a link appears next to your name, in the footer, or not at all on a page, and its
  position in each place;
- which resume each project tab opens and which summary it shows (its own, or the main one);
- whether the top-left corner shows the logo picture or the logo letters;
- each page's colour, and a notice when the item is still a draft.

What it does **not** show: the exact look. Fonts, spacing, image cropping and the phone
layout are simplified. It is not the real page. The only place to see the final look is the
live site, after you save.

There is no way to look at an unpublished change on the real site: once a published item is
saved, the change is public. If you are unsure about a new item, keep it a draft, check the
preview, and switch **Published** on when you are happy with it.

## 12. How long until a change is live, and where to watch

Usually one to two minutes after **Save**.

To watch: open `https://github.com/patel24kishan/kishan-kahodariya/actions`. Each save appears
as a run named **Deploy**:

- yellow dot — building;
- green tick — the change is live (reload the site; your browser may show the old page for a
  moment);
- red cross — the update was refused (next section).

## 13. When a save is refused

Before the site is rebuilt, every content file is checked. If something is wrong, the build
stops. **The live site stays exactly as it was** — a refused update never breaks it.

The forms already stop most mistakes (a missing title, more than 4 hover words, an address
without `https://`). What can still slip through is something that involves two items, such
as deleting a tab that projects still use, or two rows of one list that clash, such as two
"resume and summary" rows for the same tab.

To find the reason:

1. Open the **Actions** page (section 12) and click the run with the red cross.
2. Click **build**, then the step **Build**. Near the end is a list like this:

   ```
   content/projects/my-new-game.json
     field:   category
     problem: "godot" is not a category id from site.json (known ids: "unreal", "unity", "webapps")
   ```

3. Go back to the dashboard, open that item, fix that field, save. The next run goes green
   and everything saved in between goes live with it.

## 14. Pictures and videos

- Uploaded pictures are stored in the repository, in `public/uploads`.
- The dashboard converts every photo and screenshot to WebP and shrinks it to at most
  1920 pixels wide or tall before it is stored, and gives the file a tidy name. You do not
  need to prepare pictures, but do not upload hundreds of them: the repository keeps every
  version of every file forever.
- Animated GIFs lose their animation when converted. For moving pictures use a video.
- **Videos stay on YouTube.** Paste the address in the project's video field. Never upload a
  video file.
- You can also paste the address of a picture that is already online instead of uploading.
  Uploading is safer: a picture on someone else's site can disappear.
- Always write the description of a picture.

## 15. Things never to do

- Never share your token, and never paste it anywhere except the sign-in box of the
  dashboard address above. Check the address bar first.
- Never put the token in a file of the repository, in a project description, or in any
  field of the dashboard. Everything in the repository and on the site is public.
- Do not stay signed in on a computer that is not yours.
- Do not create a token for "All repositories" or with more permissions than section 2 says.

If a token may have leaked: delete it on GitHub (section 2) and make a new one.

## 16. First sign-in checklist

These are the things that could not be tested without your token. Please go through them
once, the first time you sign in on the live site.

1. The dashboard opens at `https://patel24kishan.github.io/kishan-kahodariya/admin/` and shows
   **Sign In Using Access Token**.
2. The link in the sign-in box opens GitHub's new-token page, and **Contents: Read and
   write** is already chosen there.
3. With the token from section 2 (one repository, Contents: Read and write) you can sign in,
   and the left side shows Pages 2, Projects 22, Experience 5, Skill groups 4, Links 5,
   Education 2, Certificates 3 (the numbers on the day this guide was written) and
   Site settings.
4. Open the project **Scarfall**, switch **Featured** on, press **Save**. On GitHub, the
   repository shows a new commit "Content: update Project "scarfall"" on the branch `master`,
   and that commit changes one line.
5. The **Actions** page shows a **Deploy** run for that commit, and it goes green.
6. A minute or two later the Scarfall card on the live site has the coloured border.
7. Switch **Featured** off again and save. The commit changes that one line back.
8. Upload one screenshot to a draft project and save. The commit adds one `.webp` file under
   `public/uploads/`, and after the deploy the picture shows on the site.
9. Sign out, and check that the dashboard asks for the token again.

If step 3 fails with an error about permissions, the token is missing **Contents: Read and
write** or was not limited to **kishan-kahodariya** correctly: delete it and make it again.

## For developers

- **Files:** `public/admin/index.html` (loads Sveltia CMS), `public/admin/config.yml` (the
  forms), `public/admin/slug-guard.js` (keeps an item's `slug` equal to its file name on
  save), `public/admin/preview.js`, `preview-logic.js`, `preview.css` (the content preview).
  They are copied to `dist/admin/` as they are.
- **`npm run validate:cms`** (part of `npm run build`) checks `config.yml` against
  `src/content/schema.ts`: every field covered, in the schema's order; required and optional
  fields; choices; address, hover-text, slug, date and email patterns on a table of sample
  values; repository and branch (the branch must equal the one in
  `.github/workflows/deploy.yml`); media folders; JSON output; the pinned script. If you add
  a field to `src/content/types.ts`, the build tells you what to add to `config.yml`.
- **The production branch** is named once in `config.yml` (`backend.branch`) and once in
  `deploy.yml`. Change both together.
- **Try the dashboard without a token:** `npm run dev`, open
  `http://localhost:5173/kishan-kahodariya/admin/` in Chrome or Edge, click **Work with Local
  Repository** and pick the repository folder. Saves then write the files on your disk and
  nothing goes to GitHub. (The button only exists on a local address.)
- **Upgrade Sveltia CMS** (it is pinned to one exact version on purpose):
  1. `npx tsx scripts/validate-cms-config.ts --integrity 0.231.0` (the version you want). It
     downloads that release from two CDNs, checks that they serve the same file and prints
     the `integrity` hash.
  2. Put the version and the hash in the `<script>` tag of `public/admin/index.html`, and the
     version in the first line of `public/admin/config.yml`.
  3. `npm run validate:cms`, then `npx playwright test tests/admin` — the tests drive the real
     dashboard and save every content file through it, so a release that writes files
     differently is caught before it is deployed.
  4. Read the Sveltia release notes for breaking changes: it is still before version 1.0.
- **Tests:** `tests/admin/` (dev server) and `tests/build/admin.spec.ts` (production build).
  The tests that need the dashboard itself are skipped, with a message, when `unpkg.com`
  cannot be reached.
