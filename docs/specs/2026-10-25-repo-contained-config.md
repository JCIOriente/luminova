# Repo-contained configuration

Status: approved design (owner, 2026-10-25)
Plan: `docs/plans/2026-10-25-repo-contained-config.md`
Amends: `docs/specs/2026-10-22-brand-config-design.md` decision D18

## 1. Problem

Running Luminova for a chapter needs values in eight places today: `BRAND_PROFILE` in the
shell (with an `export` line in `~/.zshrc`), a GitHub `production` variable with the same
value, three more GitHub variables for CD sign-in, `BRAND_RELEASE` and `BRAND_ASSETS_DIR`
in hints, and `apps/*/.env.local` files that copy `brand.json`.

The owner's rule: **everything lives in the repository's files**. A new contributor clones,
runs `pnpm install`, and every command already knows which chapter it is building, where
its images are, and where CD deploys. Nothing to export, nothing to copy into a shell
startup file, nothing to set in GitHub. The audience includes engineers with little
experience, so every value says what it is for, and every command says what to do next.

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| C1 | Selecting the profile | **Superseded 2026-10-25** by `docs/specs/2026-10-25-profile-discovery.md` P1, P3: `brand/` itself selects (its one chapter profile, else the example) and `luminova.json` is removed. Original: **`luminova.json`** at the repo root, committed: `{ "$schema", "profile": "<slug>" }`. Every brand command, the Vite plugin, the seed scripts and CD read it. Replaces D18 | One committed line is visible, reviewed and identical on every machine and in CD. D18 rejected a *gitignored* selection file because builds would change invisibly and turbo would not hash it; a committed file is in the diff, and it is added to turbo's build inputs (C7) |
| C2 | One-off selection | `--profile <slug>` on every `brand:*` command | Checking another profile must not mean editing the file |
| C3 | Where your images live | Unchanged (D3): the gitignored `brand-assets/` at the repo root. The committed example and fixture profiles keep theirs in `brand/<slug>/assets/`. `brand:pull` refreshes `brand-assets/` from the bucket | Already in the repo and already ignored; the change is that the CLI and docs now say so plainly |
| C4 | CD sign-in | `brand.json` gains optional `deploy: { workloadIdentityProvider, serviceAccount }`. Release mode requires it. CD reads it, and the project id from `firebase.projectId`, in a first setup step; the four GitHub variables `BRAND_PROFILE`, `GCP_PROJECT_ID`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` are no longer read | Both are resource names, not secrets. `brand:init` fills them with the names `docs/ci-cd.md` section 6 creates (the project number is the Firebase `messagingSenderId`) |
| C5 | Env vars that remain | **Amended** by `docs/specs/2026-10-25-profile-discovery.md` P4: the override is compared with what `brand/` selects, not with `luminova.json`. Original: `BRAND_PROFILE` and `BRAND_ASSETS_DIR` stay only as **tooling overrides** (`brand:guard` builds the neutral fixture in a child process; tests). No message or doc tells a person to set them. When `BRAND_PROFILE` is set and differs from `luminova.json`, every command prints one line naming the override, `brand:doctor` warns, and release mode refuses | An override that a person set months ago in `~/.zshrc` must never silently win, and must never reach a deploy |
| C6 | Release mode | `BRAND_RELEASE=1` stays internal: set by the `deploy:*` scripts and CD. Messages point at those scripts, never at the variable | It is a mode of a command, not configuration |
| C7 | Turbo | **Superseded** by `docs/specs/2026-10-25-profile-discovery.md` P6: `brand/**` alone is the input. Original: `luminova.json` joins the `build`, `test` and `ci` inputs | Switching profiles must rebuild, never replay another profile's cache |
| C8 | Self-explaining config | **Amended** by `docs/specs/2026-10-25-profile-discovery.md` P3: only `brand.json` remains to describe. Original: Every field of `luminova.json` and `brand.json` has a JSON Schema description (editor hover). `docs/adopting.md` opens with a "Where configuration lives" table: file, what it holds, who reads it | A value a newcomer cannot explain is a value they will get wrong |
| C9 | Outstanding CLI UX | Every failure: what is wrong, why it matters (one clause), the fix (file or command, and where). Every success: the next step. GCP setup (`brand:provision`) prints numbered steps, each with one line of why, the command, where to run it, and how to check it worked | Owner requirement; copy reviewed by a writing-focused (Fable) pass |
| C10 | Secrets | The optional `DEPLOY_WEBHOOK_URL` repository secret (deploy notifications) stays a GitHub secret. gcloud, gh and firebase keep their own logins | A secret committed to a public repo is leaked |
| C11 | `.env` files | Out of this PR. A follow-up removes `apps/*/.env.local(.example)` and `.env.production`: dev reads `firebase.web` from the profile, and the command decides whether the emulators are on | It changes `@luminova/firebase` and both apps' startup; it gets its own review |

## 3. `luminova.json`

```json
{
  "$schema": "./brand/luminova.schema.json",
  "profile": "jci-oriente"
}
```

- `profile`: the folder name under `brand/`. Lowercase letters, digits and hyphens
  (`jci-valle`). Read by every `brand:*` command, `pnpm dev`, the builds, the seed scripts
  and CD.
- Strict: an unknown key is an error, so a typo (`"profiel"`) cannot be ignored.
- Missing file: every command stops with the two ways to create it (`pnpm brand:init`, or
  the one-line file). There is no silent default.
- `brand:init` writes it after creating the profile, and prints the change it made.
- Generated JSON Schema `brand/luminova.schema.json`, kept in sync by `brand:schema --check`
  like `brand.schema.json`.

Selection order: `--profile` flag, else `BRAND_PROFILE` (tooling override, C5), else
`luminova.json`. The loaded profile records its source (`flag`, `override`, `file`).

## 4. CD

`.github/actions/firebase-setup` takes no inputs. After `pnpm install` it runs
`pnpm -s brand:ci-config`, which loads the profile from `luminova.json` in release mode,
fails on any release problem, and writes `profile`, `project_id`,
`workload_identity_provider` and `service_account` to `$GITHUB_OUTPUT`. The auth step
reads those outputs. `deploy.yml` stops reading `vars.*`; jobs that need the project id
(`brand:assert-dist`, the summary) read it from the action's outputs.

Trust model: unchanged in kind. `workflow_run` and `workflow_dispatch` already run the
workflow from `main`, so changing where CD deploys already required a merge to `main` and
the `production` environment's approval. Moving the values from GitHub variables into the
repo makes that change visible in a reviewed diff. The Workload Identity pool still only
honours this repository on `refs/heads/main`.

## 5. Doctor rows

`node`, `pnpm`, **`luminova.json`** (the selected profile and its source; warn on an env
override), `profile`, `schema`, `site content`, `assets`, `.firebaserc`, **`CD identity`**
(warn when `deploy` is missing), `gcloud account`, `bucket`.

## 6. Out of scope

- C11 (`.env` files): next PR.
- `brand:icons` (roadmap R21).
- Creating the Workload Identity pool from the CLI: `brand:provision` prints the section 6
  commands with values filled in; the owner runs them.
