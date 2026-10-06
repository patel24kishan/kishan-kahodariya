# robots.txt cannot keep /admin/ out of search engines on a project site

- Raised by: infra
- Date: 2026-10-06
- Area / owner affected: admin, architect
- Severity: guideline
- Status: open

## What happened
The brief asks for `/admin/` not to be indexed "(robots.txt disallow; the admin agent adds its own
meta later)". I wrote `public/robots.txt` (allow all, `Disallow: /admin/`), and the build rewrites
it in `dist/robots.txt` to `Disallow: /My-Portfolio/admin/`.

That file is published at `https://patel24kishan.github.io/My-Portfolio/robots.txt`. Crawlers only
ever request `robots.txt` from the root of a host (`https://patel24kishan.github.io/robots.txt`),
which belongs to a different repository (`patel24kishan.github.io`, if it exists). A robots file
under a path is not read by anyone. So on GitHub Pages as a project site, the disallow rule does
nothing.

## What I need / suggest
- Admin agent: `public/admin/index.html` must carry `<meta name="robots" content="noindex">` itself.
  That tag is the only thing that keeps the dashboard out of search results. A test for it belongs
  in `tests/admin`.
- Nothing in the public pages links to `/admin/` (keep it that way), so it is also not discoverable
  by following links.
- No change needed in infra. The README says the same thing in the go-live section.

## Resolution (architect)

Accepted, 2026-10-06. The admin agent adds <meta name="robots" content="noindex"> to the admin page. robots.txt stays as a harmless hint. Status: assigned to admin (phase 2).
