# Build logs

Working notes from the build. Nothing here ships to the site.

- `progress/<agent>.md` — one file per agent. Dated lines: started, milestones, finished.
- `issues/<agent>-<nn>-<short-slug>.md` — one file per issue. The architect reviews every file,
  decides, and records the outcome in the same file.
- `architect.md` — the architect's decisions, conflict resolutions and review results.

## Issue template

```markdown
# <short title>

- Raised by: <agent>
- Date: <YYYY-MM-DD>
- Area / owner affected: <content | design | infra | pages | admin | qa | architect | owner decision>
- Severity: <blocker | bug | guideline | question | note>
- Status: open

## What happened
<facts: file, line, command, output>

## What I need / suggest
<the change or decision>

## Resolution (architect)
<left empty by the reporter>
```
