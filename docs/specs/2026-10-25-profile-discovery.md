# Profile discovery

Status: approved design (owner, 2026-10-25)
Amends: `docs/specs/2026-10-25-repo-contained-config.md` decisions C1 and C7

## 1. Problem

C1 made a committed `luminova.json` at the repo root name the chapter a checkout builds.
Upstream's says `jci-oriente`; every chapter's fork (`jci-urkupina`, `jci-andina`,
`jci-santa-cruz`, ...) must change it. That breaks the rule D1 of the brand spec set out:
a fork only adds its own `brand/<slug>/` and never edits a tracked shared file. The
edited file then rides along in every pull request a fork sends upstream, and the day
upstream changes it, every fork's `git pull upstream main` conflicts.

Everything else a chapter owns is already isolated in `brand/<slug>/`. A selection file
inside that folder cannot work: a command would need the slug to find it. So the
selection itself has to come from what is in `brand/`.

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| P1 | Selecting the profile | **Discovered from `brand/`**: the chapter profiles are the folders with a `brand.json`, except the example (`jci-oriente`) and the neutral `fixture`. One chapter profile: it is selected. None: the example is. Two or more: every command stops, lists them, and says to keep one per repository or pass `--profile` | A fork adds one folder and is done; upstream, with no chapter profile, builds the example. No shared file to edit, so nothing to conflict or to leak into an upstream PR |
| P2 | Which profile is the example | The existing `EXAMPLE_PROFILE` constant (`jci-oriente`), not a flag in `brand.json` | The repository already names it in code (`brand:init` copies its site content); a second marker could disagree with it |
| P3 | `luminova.json` | **Removed**, with `brand/luminova.schema.json`. A leftover file is ignored; `brand:doctor` warns and says to delete it | One way to select, so no file can silently disagree with the discovery |
| P4 | Overrides | Unchanged (C2, C5): `--profile` for one command, `BRAND_PROFILE` as a tooling override that release mode refuses | Same guarantees as before |
| P5 | Shippable sources | A discovered chapter, the example, or `--profile`. Never `BRAND_PROFILE` | Upstream deploys the example; a fork deploys its chapter |
| P6 | Turbo (replaces C7) | `brand/**` already is a build, test and ci input, and adding or removing a profile folder changes it | A switch of profiles still rebuilds, never replays another profile's cache |
| P7 | CD | `.github/scripts/deploy-ready.sh` applies P1 in bash, from the working tree or a git ref (`git ls-tree`). Deploy's surface filter drops `luminova.json`: a change of profile is a change of project, which the first-deploy check already turns into a deploy of every surface | Twin rules, as before; Deploy's filter runs before any install |
| P8 | One chapter per repository | `brand:init` refuses to create a second chapter profile and names the existing one | Two would leave every command without a selection; Luminova is one deployment per chapter |

## 3. Messages

Every command names the profile and why it was chosen:

- `brand/jci-valle/ (the chapter profile in brand/)`
- `brand/jci-oriente/ (the example: no chapter profile in brand/ yet)`
- two or more: `brand/ holds 2 chapter profiles (jci-andina, jci-valle); a repository builds one.` To fix: delete the folder you do not build, or pass `--profile <slug>` for one command.

## 4. Migration

A fork that already edited `luminova.json` gets a modify/delete conflict once, on the
pull that removes the file: resolve it by deleting the file (`git rm luminova.json`).
Its chapter folder is then discovered. A leftover file is never read.
