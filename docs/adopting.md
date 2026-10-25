# Adopting Luminova for your chapter

Luminova is not multi-tenant: one deployment serves one chapter. You run it for yours by
forking the repository and adding a **brand profile**, `brand/<slug>/`, that holds every
value that makes a deployment yours: names, places, origins, the Firebase project, theme
colours and share text. JCI Oriente's profile, `brand/jci-oriente/`, is the committed example.
Your images never enter git. Deployments read them from a private bucket in your own Google
Cloud project.

Every step below names its command and who runs it. "You" means a chapter member with
owner access to the Firebase project and admin access to the fork. No step needs a
Luminova maintainer. If you get stuck,
[open an adoption issue](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml).

## Where configuration lives

Everything is in the repository's files. You never export an environment variable or edit
your shell's startup file, and CD needs no GitHub variables.

| What | File | In git? | Who reads it |
|---|---|---|---|
| Which chapter this repository builds | `luminova.json`, field `profile` | yes | every `pnpm brand:*` command, `pnpm dev`, the builds, the seed scripts, CD |
| The chapter: names, texts, site addresses, Firebase project and web apps, CD's sign-in | `brand/<slug>/brand.json` | yes; every value is public | the builds, CD |
| The site's texts, seeded into the database once | `brand/<slug>/site-content.json` | yes | `pnpm seed:production`, `pnpm dev` |
| Your images | `brand-assets/` | **no**, gitignored | `pnpm dev`, `brand:check`, `brand:push` |
| The images deploys use | your private bucket, `<project>-brand-assets` | no | CD (`brand:pull`) |
| Firebase CLI's project file | `.firebaserc` | no, generated | the `firebase` CLI |

`profile` is a folder name under `brand/`: lowercase letters, digits and hyphens, such as
`jci-valle`. `brand:init` writes it for you. To run one command against another profile
without editing the file, add `--profile <slug>`.

Your editor explains every field of `luminova.json` and `brand.json` on hover: both files
point at a JSON Schema (`brand/luminova.schema.json`, `brand/brand.schema.json`).

What stays out of the repository: your `gcloud`, `gh` and `firebase` sign-ins (each tool
keeps its own), and the optional `DEPLOY_WEBHOOK_URL` GitHub secret that posts deploy
results to Slack or Discord. Local development still reads `apps/*/.env.local` for the
emulator settings; a follow-up moves that into the profile too.

## Before you start

- Node 24 (`.nvmrc`), pnpm through `corepack enable`, the Firebase CLI, a Java runtime (for
  the emulators), the `gcloud` CLI and the GitHub CLI `gh`.
- A Firebase project on the **Blaze** plan (Cloud Functions need it).
- Your chapter's 16 images (step 4) and the facts that go into the profile: name, city,
  region, founding year, national federation, both site origins and a contact email.

## Steps

| # | Step | Command | Who |
|---|---|---|---|
| 1 | Fork, clone, run the example locally | Quickstart in the [README](../README.md#quickstart) | You |
| 2 | Firebase project, two web apps, second hosting site | Console (below) | You |
| 3 | Create your profile | `pnpm brand:init` | You |
| 4 | Add the 16 images and check them | `pnpm brand:check` | You |
| 5 | Check the whole setup | `pnpm brand:doctor` | You |
| 6 | Commit the profile | `git add brand/<slug>/ luminova.json` | You |
| 7 | Keyless CD identity | `pnpm brand:provision`, steps 1 and 2 | You |
| 8 | Create the assets bucket | `pnpm brand:provision --apply` | You |
| 9 | Upload the images | `pnpm brand:push` | You |
| 10 | First deploy, then verify | merge to `main` or `gh workflow run deploy.yml` | You |
| 11 | First admin | `pnpm seed:production --project <id>` | You |

Every brand command tells you what to do next. A failure ends with a **To fix:** block:
the file or folder to change, the command, and where to run it. A success ends with
**Next:**, the following step of this guide. The `#` comment after each command says
where it goes:

- `# in the repo root` means a terminal at the top of your clone (where `package.json` is); `pnpm brand:*` does not work from a package folder;
- `# in your shell` means any terminal: a sign-in (`gcloud auth login`) or a GitHub command;
- a console name, such as `# in the Firebase console → Project settings`, means that web page.

```text
To fix:
  - put the files marked above in brand-assets/ at the sizes shown (all 16: docs/adopting.md step 4)
      pnpm brand:check   # in the repo root
```

### 1. Run the example

Follow the README Quickstart. `pnpm dev` runs both apps against the emulators with the
example profile (`luminova.json` selects `jci-oriente`), so nothing touches a real project.

### 2. Firebase project

In the [Firebase console](https://console.firebase.google.com), for your project:

1. Register **two web apps**, one for the public site and one for the admin site. Note
   each app id (`1:<number>:web:<hash>`).
2. Add a **second hosting site** for the admin site. The first site's id is usually the
   project id; `brand:init` suggests `<project>-backstage` for the second.
3. Enable **Authentication → Email/Password**, and the rest of the console checklist in
   [`docs/firebase-setup.md`](firebase-setup.md#console-checklist-manual-one-time). App Check
   is optional: a blank `appCheckSiteKey` turns it off.

### 3. Create your profile

```bash
pnpm brand:init                         # asks each question, with a suggested default
pnpm brand:init --answers answers.json  # or from a file, without prompts
```

Either form takes `--sdkconfig` to read both API keys, the auth domain and the sender id
with `firebase apps:sdkconfig` (read-only; needs `firebase login`), so an answers file can
leave the API keys out: `pnpm brand:init --answers answers.json --sdkconfig`.
```

`brand:init` writes `brand/<slug>/brand.json`, copies the example's `site-content.json`
next to it, creates `brand-assets/README.txt`, points `luminova.json` at the new profile and
writes `.firebaserc` for your project. It also fills `deploy`, CD's sign-in names, with the
ones step 7 creates. It validates everything before writing
anything and never overwrites an existing profile. When asking, it re-asks a malformed
or taken slug and a year or count that is not a whole number on the spot; if a later step fails, your
answers are saved to `brand-init-answers.json` (gitignored) for `--answers`. An answers
file is a partial
`brand.json`; anything missing is either derived (storage bucket, site ids, auth domain,
sender id, assets bucket, SEO text, `deploy`) or reported, all at once. The JSON Schema in
`brand/brand.schema.json` describes every field.

```json
{
  "slug": "jci-valle",
  "name": "JCI Valle",
  "locality": { "city": "Cochabamba", "region": "el valle cochabambino", "country": "Bolivia" },
  "foundedYear": 1990,
  "stats": { "nationalOrganizations": 18 },
  "parentOrganization": { "name": "JCI Bolivia", "url": "https://jcibolivia.org/" },
  "broadcastChannelName": "Difusión Valle",
  "urls": { "spotlight": "https://jcivalle.org", "backstage": "https://admin.jcivalle.org" },
  "backstage": { "emailPlaceholder": "tu.nombre@jcivalle.org", "contactEmail": "hola@jcivalle.org" },
  "firebase": {
    "projectId": "jci-valle",
    "web": {
      "spotlight": { "appId": "1:123:web:abc", "apiKey": "AIza…" },
      "backstage": { "appId": "1:123:web:def", "apiKey": "AIza…" }
    }
  }
}
```

Edit `brand/<slug>/site-content.json`: history, mission, vision, values, statistics and
contacts. It seeds the site once; after that, the admin `/config` screen is where it
changes.

### 4. Images

Put these 16 PNG files in `brand-assets/` (its `README.txt` lists them too):

| File | Size |
|---|---|
| `logo-main.png`, `logo-on-dark.png`, `logo-on-primary.png` | any, all three the same size, at least 184 px tall |
| `og-image.png` | 1200×630, under 300 KB or WhatsApp skips the preview |
| `<app>/favicon-16.png`, `<app>/favicon-32.png` | 16×16, 32×32 |
| `<app>/apple-touch-icon-180x180.png` | 180×180 |
| `<app>/pwa-192x192.png`, `<app>/pwa-512x512.png`, `<app>/maskable-icon-512x512.png` | 192×192, 512×512, 512×512 |

`<app>` is `spotlight` and `backstage`, so 6 icons each. There is no icon generator in
the repository yet (`docs/roadmap.md`); any tool that exports exact PNG sizes works.

```bash
pnpm brand:check            # one row per file: expected, found, verdict
```

`brand:check` runs the same validator as the build and also schema-checks your
`site-content.json`. A local build reads `brand-assets/` once it holds any of the 16
files (the README alone does not count), so `pnpm dev` now shows your images. Before
that, a new profile has no images of its own and the build lists every missing file.

### 5. Doctor

```bash
pnpm brand:doctor
```

One table, in the order fixes must happen: Node, pnpm, `luminova.json`, the profile and
its schema, site content, images, `.firebaserc`, CD identity, your `gcloud` account and the
bucket. It only reads, and every row reports even when an earlier one fails. Before step 9
the **bucket** row fails, and the **gcloud account** row too until you run
`gcloud auth login` (step 7); every other row should pass.

If you exported `BRAND_PROFILE` in an earlier version of this guide, the `luminova.json`
row warns while it differs from the file: remove the `export` line from your shell's
startup file. Tools set that variable for single test builds; you never need it.

### 6. Commit the profile

Commit `brand/<slug>/` and `luminova.json` in your fork. Never commit `brand-assets/`: it
is gitignored, and a deploy build refuses any asset source other than a pull from your
bucket.

### 7. Keyless CD

```bash
gcloud auth login              # an owner of your Firebase project
gh auth login                  # an admin of your fork
pnpm brand:provision           # prints every step with your values; changes nothing
```

`brand:provision` prints the whole Google Cloud setup as numbered steps. Each step says
why, where to run it, the exact commands and how to check that it worked. Run its step 1
yourself: it creates CD's deploy account and its keyless sign-in (Workload Identity
Federation: GitHub proves the run comes from your fork's `main`, no key is stored). Its
step 2 is the `deploy` section of `brand/<slug>/brand.json`: `brand:init` already wrote it,
so check that the values match and commit any change. The full block, with the reasoning
behind each permission, is [`docs/ci-cd.md` section 6](ci-cd.md#6-one-time-provisioning-reproducible).

### 8. Assets bucket

```bash
pnpm brand:provision --apply   # creates and configures the bucket, skipping what is done
```

The bucket is private and versioned, keeps the last three versions of each file, and the
deploy account from step 7 gets read-only access to it alone. Step 7 must come first:
the grant fails for an account that does not exist yet.

### 9. Upload the images

```bash
pnpm brand:push                # validates brand-assets/ first, then uploads
pnpm brand:doctor              # every row passes now
```

`brand:push` never deletes, and versioning keeps every overwritten file for rollback. It
prints the deploy command to run afterwards: an image change is not in git, so CD does not
see it on its own.

### 10. Deploy and verify

Merge to `main`, or run `gh workflow run deploy.yml -f surface=all`, and approve the run.
Hosting deploys to a preview channel, is smoke-tested, then promoted. Then check:

- view source on both sites: title, description, `rel=canonical` and `og:image` carry your
  origin and the hashed `og-image.<hash>.png`;
- a WhatsApp share of the public site shows your image and text;
- installing either site as an app shows your name and icon;
- a member QR starts with your `qrPrefix`;
- the public site's "Ingresar" opens your admin origin.

Custom domains and the console settings that must list every hostname:
[`docs/domains.md`](domains.md).

### 11. First admin

```bash
gcloud auth application-default login   # the script uses Application Default Credentials
pnpm seed:production --project <your-project-id>
```

Creates the first admin interactively and seeds the site content from step 3. It refuses
the emulators and any project other than the one your profile names.

## Changing things later

| Change | Do |
|---|---|
| A profile value (`brand.json`) | Edit, commit, merge; CD redeploys |
| Site content | The admin `/config` screen |
| An image | Replace it in `brand-assets/`, `pnpm brand:check`, `pnpm brand:push`, then the printed deploy command |
| Roll back an image | `gcloud storage cp gs://<bucket>/<file>#<generation> gs://<bucket>/<file>`, then deploy |

A new share image gets a new URL automatically (`og-image.<hash>.png`), so WhatsApp picks
it up. To keep an old cached URL working, list it in `og.legacyPaths`.

## What a profile does not cover

- **Language.** The interface is Spanish. Strings are not extracted for translation yet.
- **Country rules.** The phone format and the date/time zone are Bolivian.
- **Design tokens.** The JCI palette in `packages/ui` is shared; only `themeColor` is per
  profile.
- **Points matrix.** Defaults follow JCI Oriente's scoring
  (`docs/reference/points-matrix.md`); values are editable per term at `/point-rules`, but
  which activities count is code.
- **JCI marks.** Not covered by this repository's license; see [NOTICE](../NOTICE).

If one of these blocks you, say so in an adoption issue: it is how we prioritise.
