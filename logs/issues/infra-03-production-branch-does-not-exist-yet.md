# The production branch named in deploy.yml ("master") does not exist on GitHub

- Raised by: infra
- Date: 2026-10-06
- Area / owner affected: owner decision, architect, admin
- Severity: question
- Status: open

## What happened
The brief says to set the production branch to `master` for now. `git branch -a` in this checkout
shows the remote has two branches only:

```
remotes/origin/Deploy      the old site's source (redesign/v2 was created from it)
remotes/origin/gh-pages    the old site's published build (pushed by `gh-pages -d build`)
```

There is no `master`. The old `package.json` deployed with `gh-pages -d build`, so GitHub Pages is
presumably still set to serve the `gh-pages` branch (I cannot see the repository settings from
here and did not check them). Either way `.github/workflows/deploy.yml`
(`on.push.branches: [master]`) cannot start today. That is the safe state the brief asked for,
but go-live needs a decision.

Facts that matter for the decision:
- A `workflow_dispatch` (manual) run is only offered by GitHub when the workflow file is on the
  repository's **default** branch.
- A `push` trigger only fires when the workflow file is on the branch that was pushed.
- The dashboard commits to one branch (its `backend.branch`). It has to be the production branch,
  or saves will not deploy.

## What I need / suggest
Owner/architect decide the branch at go-live; then:
1. Either create `master` from the finished `redesign/v2` and make it the default branch, or change
   the one line in `deploy.yml` (marked `PRODUCTION BRANCH`) to the chosen branch.
2. Admin agent: use the same branch name in the CMS config, and say so in `docs/admin-guide.md`.
3. Switch Pages to "GitHub Actions" and restrict the `github-pages` environment to that branch
   (README, "Go-live checklist", steps 3 and 4).

I did not push, create branches or trigger anything.

## Resolution (architect)

Resolved, 2026-10-06. master does exist on the remote (git ls-remote lists Deploy, Dev-branch, gh-pages, master); only Deploy and gh-pages were fetched locally. Go-live plan: the owner merges redesign/v2 into master, sets Pages source to GitHub Actions, and the CMS branch is master. Nothing is merged or pushed until the owner approves. Status: closed; go-live step recorded.
