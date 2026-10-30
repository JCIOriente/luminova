# Handoff: brand outside the repo (R28)

Spec: `docs/specs/2026-10-29-brand-outside-repo.md`. After the whole stack merges, no
chapter's brand is in git: `brand/` holds only `brand/example/` and the two shared files,
JCI Oriente's `brand.toml` and 16 images live in `gs://jci-oriente-brand-assets/`, and CD
pulls them from there before every build.

## Merge order

#277 is independent and can merge at any time. The rest is one stack, merged in this order;
each PR is retargeted to `main` once the one below it merges.

| Order | PR | Branch | Purpose | State |
| --- | --- | --- | --- | --- |
| any | #277 | `chore/review-route-deps` | The review router sends `secure-dep-vetting` on `pnpm-lock.yaml` and `pnpm-workspace.yaml` only, not on every `package.json`. | Open; CI green (independent of the stack). |
| 1 | #278 | `fix/brand-land-r27` | Lands R27 (brand commands without flags, one `brand:check`) on `main`, which #276 never reached. | Open; CI green. |
| 2 | #279 | `chore/brand-outside-repo-spec` | The spec (R28). | Open, stacked. GitHub runs CI only on PRs to `main`; `pnpm pr-tests` passed locally. |
| 3 | #280 | `feat/brand-example-profile` | Migration step 1: one neutral example profile, `brand/example/`, replaces `brand/fixture/`. | Open, stacked. GitHub runs CI only on PRs to `main`; `pnpm pr-tests` passed locally. |
| 4 | #281 | `feat/brand-toml` | Migration step 2: `brand.toml` layered on the example replaces `brand.json` and `site-content.json`. | Open, stacked. GitHub runs CI only on PRs to `main`; `pnpm pr-tests` passed locally. |
| 5 | #282 | `feat/brand-local` | Migration step 3: one git-ignored `brand/local/` folder; `brand:push` / `brand:pull` carry `brand.toml` to and from the bucket. | Open, stacked. GitHub runs CI only on PRs to `main`; `pnpm pr-tests` passed locally. |
| 6 | #283 | `feat/brand-fork-cd` | Migration step 4: CD signs in from the repository variables `FIREBASE_PROJECT_ID` and `GCP_PROJECT_NUMBER` and pulls the brand from the bucket before it builds. | Open, stacked. GitHub runs CI only on PRs to `main`; `pnpm pr-tests` passed locally. |
| 7 | this PR | `migration/brand-remove-jci-oriente` | Migration step 5: `brand/jci-oriente/` leaves the repo with every transitional path that served it; `brand:guard` checks a synthetic canary chapter (D8). | Open, stacked. |

## Owner runbook

When: after #282 merges and before #283 merges. Claude runs none of it. Copied from the
spec's "Owner runbook" section:

From a clone of `main` that includes step 3, with `gcloud` signed in as a project owner:

1. `pnpm install`, then copy JCI Oriente's committed profile into the local folder and
   delete its `[deploy]` table there (step 4's CD refuses a `brand.toml` that still has one,
   and no CD reads it from the bucket's copy, so it can go now):
   `cp brand/jci-oriente/brand.toml brand/local/brand.toml && sed -i.bak '/^\[deploy\]$/,/^$/d' brand/local/brand.toml && rm brand/local/brand.toml.bak`.
   `pnpm brand:check` then notes that the CD identity has no `[deploy]` table; that note is
   expected until step 4 merges. If the bucket already holds a `brand.toml` with `[deploy]`
   (pushed before this step said to delete it), delete the table from
   `brand/local/brand.toml` and run `pnpm brand:push` again before merging step 4.
2. Download the deployed images from today's bucket over the seeded ones: `pnpm brand:pull`.
   The bucket holds no `brand.toml` yet, so the pull replaces the 16 seeded images without
   asking (they are unchanged since the seed), keeps the `brand.toml` of step 1, and records
   each image's generation, which step 3's push is conditional on.
3. `pnpm brand:check`, then `pnpm brand:push`.
4. `gh variable set FIREBASE_PROJECT_ID --body jci-oriente --repo JCIOriente/luminova` and
   `gh variable set GCP_PROJECT_NUMBER --body 953870918238 --repo JCIOriente/luminova`.
5. Merge step 4. Its first Deploy run (or `gh workflow run deploy.yml -f surface=hosting
   --repo JCIOriente/luminova`) needs the usual approval; check both sites afterwards.
6. Optional, any time after step 5: pin the existing provider to `deploy.yml`, as
   `brand:provision` now creates it for a fork (`assertion.workflow_ref` reads the token's
   own claim, so the attribute mapping stays as it is):
   `gcloud iam workload-identity-pools providers update-oidc github-oidc --project=jci-oriente --location=global --workload-identity-pool=github-actions --attribute-condition="assertion.repository == 'JCIOriente/luminova' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'JCIOriente/luminova/.github/workflows/deploy.yml@refs/heads/main'"`.

The runbook needs #282's code: from this PR on, `brand:pull` refuses a bucket without
`brand.toml`, and `brand/jci-oriente/brand.toml` no longer exists to copy.

## After the first deploy of #283

- The run after the merge's green CI is titled **"Deploy to jci-oriente at <sha>"**, the
  merge commit's sha. A run titled "Deploy (not set up)" means a repository variable is
  missing (runbook step 4).
- Every surface deploys once: rules, functions, spotlight and backstage. No earlier run
  carries that title, so `.github/scripts/last-deploy.sh` finds no previous deploy and the
  filter ships everything.
- The "Pull the brand from the project's bucket" step lists `brand.toml` and the 16 images,
  each with a generation, and the job summary records them ("Record the brand that ships").
- Both sites serve JCI Oriente: https://jcioriente.org and https://admin.jcioriente.org
  (names, logos, share image, theme colour, the admin login).

## Open risks

- **The first deploy of #283 ships every surface**, rules and functions included, not
  only hosting (above).
- **The merge of this PR redeploys spotlight, backstage and functions, not rules.** Its
  diff since the commit the last successful "Deploy to jci-oriente at <sha>" run names
  touches `brand/` (the deleted `brand/jci-oriente/`) and `packages/`, which the filter maps to spotlight, backstage and
  functions. Rules deploy only on `firestore.rules`, `storage.rules`,
  `firestore.indexes.json` or `firebase.json`, which this PR does not change. The spec's
  "one full redeploy of every surface" for the removal PR describes the base-tree check
  that `deploy-ready.sh` no longer has since #283.
- **A bucket without `brand.toml` stops every deploy from #283 on**, and every member's
  `brand:pull` from this PR on. The runbook's step 3 puts it there.
- **Editing the texts from backstage is a later step** (spec, "Later"). Until then a
  wording change is `brand/local/brand.toml`, `pnpm brand:push`, then
  `gh workflow run deploy.yml -f surface=hosting`; a brand change moves no git, so no merge
  deploys it.
- **`brand:guard` writes into `brand/local/`.** Where `brand/` holds no chapter, it writes the
  canary chapter there for the example build and removes it afterwards. A `brand/local/`
  that is still the untouched seed is renamed aside to `brand/.local-canary-backup/` for the
  run, the member's own files in it included, and renamed back unchanged when the run ends,
  fails, or stops on SIGINT or SIGTERM. A run killed past those handlers (SIGKILL) leaves its
  canary with a `.canary` marker; the next command that loads a profile (or `pnpm install`)
  removes it and renames the set-aside folder back, with a one-line notice. It refuses a
  `brand/local/` that holds files but no `brand.toml`, rather than touch it.
