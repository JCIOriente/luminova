# Brand outside the repo

Status: approved 2026-10-29 (R28). Replaces the profile discovery of
`docs/specs/2026-10-25-profile-discovery.md`, the `deploy` section of
`docs/specs/2026-10-25-repo-contained-config.md`, and the `selectAssetsDir` choice of
`docs/specs/2026-10-28-brand-simple-commands.md` C3.

## Goal

One codebase, many deploys. `JCIOriente/luminova` is public and holds the code plus one
neutral profile, `brand/example/`, whose default Spanish texts are good enough to ship. A
real chapter's brand (JCI Oriente, a future JCI Andina) never lives in git:

- The chapter keeps a short, git-ignored `brand/local/brand.toml` and its images next to it.
  `pnpm brand:push` uploads them to the chapter's own Firebase Storage bucket.
- The chapter deploys from its GitHub fork. The fork's repository variables name the Firebase
  project, and CD pulls the brand from the bucket before it builds.
- A chapter that fixes a bug opens a code-only PR from its fork. Its brand cannot come along
  (it is not in git), and a fork PR gets no secrets and no OIDC token, so it cannot deploy.
- Updates reach a chapter through GitHub's **Sync fork**; the push to the fork's `main` runs
  its CI, then its CD redeploys.

JCI Oriente deploys the same way, from `JCIOriente/luminova` itself.

## The brand file

`brand.toml` replaces `brand.json` and `site-content.json`. A chapter writes only what makes
it different; everything else comes from the example.

### Layers

1. **Base:** `brand/example/brand.toml`, the full file. Every optional key has a value there,
   and the texts are templates over the identity fields.
2. **Chapter:** `brand/local/brand.toml`. Tables merge key by key; an array (`[[timeline]]`,
   `[[reasons]]`, `[[contact.links]]`, ...) replaces the example's array whole.
3. **Templates** are expanded after the merge, on the merged value, so a chapter can override
   a sentence or keep the template. Placeholders: `{name}`, `{shortName}`, `{city}`,
   `{cityFormal}`, `{region}`, `{regionShort}`, `{country}`, `{movementName}`. An unknown
   placeholder is an error naming its section and key.

### Required: identity only

```toml
#:schema ../brand.schema.json
name = "JCI Andina"
city = "Cochabamba"
country = "Bolivia"
project = "jci-andina"

[colors]
spotlight = "#0097D7"
```

- `name`, `city`, `country`: the chapter's identity; every default text is built from them.
- `project`: the Firebase project id. A `demo-` id runs only in the emulators (try it locally).
- `[colors] spotlight`: the public site's theme color (browser bar, icons). `[colors]
  backstage` is optional and defaults to a neutral dark.
- `[firebase.spotlight]` and `[firebase.backstage]` (`apiKey`, `appId`): the web apps' public
  config. `brand:init` fetches them with `firebase apps:sdkconfig` and writes them; nobody
  copies them by hand. A `demo-` project needs none.

### Derived from `project` (each can be overridden)

| Key | Default |
| --- | --- |
| `[firebase] storageBucket` | `<project>.firebasestorage.app` |
| `[firebase] authDomain` | `<project>.firebaseapp.com` |
| `[firebase] messagingSenderId` | the number inside the spotlight `appId` |
| `[firebase.sites] spotlight` / `backstage` | `<project>` / `<project>-backstage` |
| `[urls] spotlight` / `backstage` | `https://<site>.web.app` |
| `qrPrefix` | `<project>` without hyphens (never change it once credentials are printed) |
| the brand bucket | `<project>-brand-assets` |

`slug`, `$schema` and `deploy` are gone: the folder is fixed, the schema line is a TOML
comment, and CD's sign-in lives in repository variables.

### Optional, with templated defaults

Top level: `shortName`, `legalName`, `movementName`, `description`, `foundedYear`,
`broadcastChannelName`, `locale`, `ogLocale`. Tables: `[locality]` (`cityFormal`, `region`,
`regionShort`), `[parentOrganization]`, `[seo]`, `[backstage]` (`title`, `emailPlaceholder`,
`contactEmail`, which defaults to `[contact] email`; no email at all hides the link),
`[og]`, `[firebase.*]` (`appCheckSiteKey`, `vapidKey`: blank keeps App Check and push off).

Site texts, in their own clearly titled part of the same file: `[hero]`, `[stats]` and
`[stats.standoutOrg]` (`[stats]` also holds `nationalOrganizations`, today in
`brand.json`: one table), `[[timeline]]`, `[mvv]`, `[[reasons]]`, `[contact]`,
`[contact.socials]`, `[[contact.links]]`, `[linktree]`. Keys keep their Firestore names
(`mvv.mision`, `mvv.vision`, `mvv.valores`), because the seeds write them as they are.
`foundedYear` is optional in a chapter's file, like every key outside the identity, but the
example's year is no chapter's: `brand:init` asks for the year the chapter was founded and
writes it. Until a chapter sets it, `brand:check` warns that the sites state the example's
value, and does the same for `[contact] email`, `[backstage] emailPlaceholder` and
`[contact] mapUrl`; it never fails on them.

### Errors

Every message names the file, the TOML table and the key, the way the member wrote it:
`brand/local/brand.toml [contact] email: not an email address`,
`brand/local/brand.toml [[timeline]] 3, year: required`. A syntax error gives the line and
column. Unknown keys are errors (a typo must not fall back to a default silently).

### Editor support

`brand/brand.schema.json` is still generated from the zod schema (input shape, so optional
keys are optional) and drift still fails `schema.test.ts`. `brand:init` writes the
`#:schema ../brand.schema.json` first line, which Taplo / Even Better TOML read for hover
help and completion; `brand:check` warns when the line is missing.

## Folders

| Path | In git | Holds |
| --- | --- | --- |
| `brand/example/` | yes | the full base `brand.toml` and the 16 neutral images |
| `brand/local/` | no | the chapter's `brand.toml`, its images, `.pull-manifest.json` |
| `brand/brand.schema.json`, `brand/bucket-lifecycle.json` | yes | shared |

`.gitignore` ignores `brand/*` and re-includes `brand/example/` and the two shared files. A
CI check (`assert-brand-example-only`) fails any change that adds or edits a file under
`brand/` outside those paths, in upstream and in every fork, so a chapter cannot publish its
brand by accident. Deleting a file passes.

`brand/local/` is the only local brand folder. On install (`prepare`), a missing folder is
seeded from the example: a minimal `brand.toml` with the example's identity and copies of
the example's images, recorded in the manifest with source `example`. Every command reads
this folder: dev, `brand:check`, `brand:icons`, `brand:push`, and the build. The
`brand-assets/` folder, `selectAssetsDir`, `BRAND_ASSETS_DIR` and the "other folder" warning
are removed. `BRAND_PROFILE` survives only as a test seam.

## The bucket

`gs://<project>-brand-assets/` mirrors `brand/local/`, except the manifest:

```
brand.toml
logo-main.png  logo-on-dark.png  logo-on-primary.png  og-image.png
spotlight/  apple-touch-icon-180x180.png favicon-16.png favicon-32.png
            maskable-icon-512x512.png pwa-192x192.png pwa-512x512.png
backstage/  (the same six icons)
```

These 17 paths are the **contract**. Anything else in the folder (an icon master, notes) is
the member's and neither command touches it. The bucket keeps object versioning and the
lifecycle in `brand/bucket-lifecycle.json`.

### `brand:push`

Checks the folder with the same rules as `brand:check` (and refuses with the same sections),
then uploads the 17 contract files. Each upload is conditional on the generation the
manifest recorded (`--if-generation-match`), so a member never overwrites a newer upload by
another member without noticing; on a conflict it says to run `brand:pull` first. Then it
rewrites the manifest. **Next:** `gh workflow run deploy.yml -f surface=hosting` in the
chapter's fork (`--repo <owner>/<repo>`).

### `brand:pull`

1. Lists the bucket and downloads the contract files into a staging folder; validates them.
2. For each contract file, compares the local file's sha256 with the manifest's hash from the
   last pull or push (or the seed). A file changed since then is listed, and the member is
   asked once: `Replace these N files with the bucket's copy? (y/N)`. No is the default.
   Without a terminal (CI, a script) the command refuses and lists them.
3. Replaces only the contract files, never the folder; everything else stays.
4. Writes `.pull-manifest.json`:
   `{ "version": 1, "project", "bucket", "objects": { "<path>": { "source": "bucket", "generation", "sha256" } | { "source": "example", "sha256" } } }`.
   Each file is replaced whole (a temp copy, then a rename), never through a symlink; if a
   copy fails part way, the manifest still records exactly the files replaced.
   A seeded file (source `example`) has no `generation`; `brand:push` uploads it
   create-only (`--if-generation-match=0`), which also defines the first push onto a
   bucket that already holds files.

### Release builds

A release build (`BRAND_RELEASE=1`, which CD sets) reads only what was pulled: it requires
`.pull-manifest.json`, source `bucket` for every contract file, and a matching sha256 for
each. A file edited after the pull, or a seeded example file, fails the build with the file
named. A `demo-` project is refused, as today.

## CD from a fork

Repository variables (Settings, Secrets and variables, Actions, **Variables**; none is a
secret):

| Variable | Required | Example |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | yes | `jci-andina` |
| `GCP_PROJECT_NUMBER` | yes | `123456789012` |
| `GCP_REGION` | no | the Cloud Run region of the deployed callables; defaults to `us-central1`, the gen2 default, because beacon sets none |
| `WIF_PROVIDER` | no | overrides `projects/<number>/locations/global/workloadIdentityPools/github-actions/providers/github-oidc` |
| `DEPLOY_SA` | no | overrides `firebase-deployer@<project>.iam.gserviceaccount.com` |

`brand:provision` creates the pool, provider and service account under those fixed names and
prints the `gh variable set` commands. The provider's attribute condition pins the fork's own
repository, `refs/heads/main` and the fork's `deploy.yml`
(`assertion.workflow_ref == '<owner>/<repo>/.github/workflows/deploy.yml@refs/heads/main'`).
`brand:provision` and `brand:check` name the fork with `--repo` on every `gh` call, read
from the clone's `origin` remote: gh's own default is the `upstream` remote in a clone made
with `gh repo fork --clone`. An `origin` that is JCIOriente/luminova, for any project but
`jci-oriente`, is refused with a warning.

Flow per deploy job: checkout, install, `deploy-ready.sh` (ready = both
`FIREBASE_PROJECT_ID` and `GCP_PROJECT_NUMBER` set and the project not `demo-`; otherwise
every job skips with a notice), Workload Identity sign-in, `brand:pull` (CI never seeds
`brand/local/`, so CD's pull creates it: `brand.toml` and the 16 images, each recorded with
source `bucket`, which the release build requires), `brand:ci-config`, `brand:apply`
(`.firebaserc`), release build, deploy. `brand:pull` and `brand:ci-config` run in CD mode
only when `BRAND_CD_PROJECT` is set, which only CD's setup does, to the validated
`FIREBASE_PROJECT_ID`; a member's shell that exports `FIREBASE_PROJECT_ID` keeps the
member's pull. Upstream's two variables are JCI Oriente's (runbook step 4); a fork that has
not set them skips. GitHub disables Actions in a new fork until its owner enables them.

A run's title records what it could deploy, and the next run diffs from the commit the
newest successful full run names: `Deploy to <project> at <sha>` only for a dispatch of
surface `all` on `main` or a run after a green CI of a push to `main`; a partial dispatch,
a skipped run and an unset repository get titles that never match, so their undeployed
surfaces stay in the next diff. A dispatch from another ref deploys nothing.

A brand change does not move git, so it does not start CD: the member runs the hosting
deploy after `brand:push` (above). A code change arrives by Sync fork and deploys the
surfaces its diff touches, as today.

## Migration of JCI Oriente

The PRs land in this order; JCI Oriente keeps deploying through each:

1. **Example profile** (`brand/example/`): `brand/fixture/` and the example role of
   `brand/jci-oriente/` merge into one neutral example. The example constant (and
   `deploy-ready.sh`'s `example`) becomes `example`, so `brand/jci-oriente/` is the one
   chapter profile discovery selects, for CD too. It stays tracked, re-included in
   `.gitignore`. The upstream "holds no chapter profile" CI step is replaced by
   `assert-brand-example-only`, and `brand:guard`'s neutral build moves from `fixture` to
   `example`. `deploy-ready.sh` keeps excluding `fixture`, so the base tree of the first
   deploy after merge does not look like two chapters.
2. **`brand.toml`**: the loader, schema, Vite plugin, `brand:init`, `brand:check` and the
   example move to TOML. JCI Oriente's committed profile is converted in the same PR (the
   example-only check allows this one transition).
3. **Bucket and one local folder**: push and pull carry `brand.toml`; `brand/local/` replaces
   discovery for every local command. CI never seeds `brand/local/`, so CD's setup (project,
   `.firebaserc`, hosting sites) reads the committed `brand/jci-oriente/`. While the bucket
   holds no `brand.toml`, the build reads that profile with the pulled images; once the
   bucket holds one (runbook step 3), CD's `brand:pull` writes it to `brand/local/brand.toml`
   and the build selects it. Its project must be the committed profile's: `brand:pull`
   refuses another, and so does the release build (`GCP_PROJECT_ID`).
4. **Fork CD**: `deploy.yml` reads the variables and pulls before building. Merge it only
   after the owner ran the runbook below; its first run is the proof that the bucket's
   `brand.toml` deploys JCI Oriente.
5. **Removal**: `brand/jci-oriente/` leaves the repo, with the `fixture` exclusion of
   `deploy-ready.sh` and the `.gitignore` re-include; `brand:guard` switches to the canary
   chapter (D8). Its merge is one full redeploy of every surface (the base tree's shape
   changes), on purpose.

### Owner runbook (after step 3 merges, before step 4 merges; Claude runs none of it)

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

## Decisions

Each was taken by the decision protocol of the run that wrote this spec (a Fable pass over
the options), and is recorded here as the fact.

- **D1. Parser: `smol-toml`**, subject to `secure-dep-vetting` in the `brand.toml` PR:
  chosen for TOML 1.0 support, active maintenance, line and column on errors, and a
  `stringify` for `brand:init`. Caret range: it is a build-time parser, not one of the exact-pin classes.
- **D2. The JSON Schema stays** for editor support, referenced by a `#:schema` comment.
- **D3. Defaults live in `brand/example/brand.toml`**, the base layer, not in TypeScript, so
  "what do I get if I leave this out" is answered by opening one file in the format members
  read.
- **D4. One fixed local folder, `brand/local/`.** Nothing is discovered any more, so the
  two-chapters error, its bash twin in `deploy-ready.sh` and the slug-equals-folder rule go.
- **D5. The manifest is `brand/local/.pull-manifest.json`**, next to the files it describes,
  so it survives reinstalls; push is conditional on its generations.
- **D6. `brand:init` writes the web apps' `apiKey` and `appId`** into `brand.toml` with
  `firebase apps:sdkconfig`. CD does not fetch them: that would widen the deploy service
  account's roles and match apps by an editable display name.
- **D7. CD's sign-in comes from two variables**, `FIREBASE_PROJECT_ID` and
  `GCP_PROJECT_NUMBER`. The provider and service account follow the fixed names
  `brand:provision` creates, with `WIF_PROVIDER` / `DEPLOY_SA` as overrides. The brand cannot
  hold them: it sits in the bucket CD can read only after signing in.
- **D8. `brand:guard` builds a synthetic canary chapter** (the example with sentinel values
  and sentinel images) in upstream CI, so the neutral build is still proven leak-free with
  no chapter in git. `CHAPTER_REGEX`, which names JCI Oriente, goes.
- **D9. Colors: `spotlight` required, `backstage` optional** (neutral dark default).
- **D10. Movement-wide strings are not needles.** `movementName`, `parentOrganization.*`,
  `locale`, `ogLocale` and `locality.country` are shared by every chapter of a movement or
  country; the example may say "Cámara Junior Internacional".
- **D11. `[backstage] contactEmail` defaults to `[contact] email`**; with neither, the login
  page hides the link.
- **D12. `deploy-ready.sh` keeps excluding `fixture` until the removal PR**, which deletes
  the exclusion and is the one intended full redeploy.
- **D13. This spec is its own docs PR**, first in the stack after landing R27.

## Later

- **Edit the texts from backstage.** An Admin form that edits the site texts of
  `brand.toml` and writes them back to the bucket (and redeploys hosting), so a chapter
  never edits the file for a wording change. Not in this run; it needs its own spec
  (permissions, the bucket write path, and how a form edit and a `brand:push` reconcile).
