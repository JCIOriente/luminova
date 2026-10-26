# Adopting Luminova for your chapter

Luminova is not multi-tenant: one deployment serves one chapter. You run it for yours by
forking the repository and adding a **brand profile**, `brand/<slug>/`, that holds every
value that makes a deployment yours: names, places, origins, the Firebase project, theme
colours and share text. JCI Oriente's profile, `brand/jci-oriente/`, is the committed example.
Your images never enter git. Deployments read them from a private bucket in your own Google
Cloud project.

Every step below names its command. No step needs a Luminova maintainer. If you get stuck,
[open an adoption issue](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml).

## Where configuration lives

Everything is in the repository's files. You never export an environment variable or edit
your shell's startup file, and CD needs no GitHub variables.

| What | File | In git? | Who reads it |
|---|---|---|---|
| Which chapter this repository builds | the folder `brand/<slug>/` itself: your chapter's is the only one besides the example `jci-oriente` and the test `fixture` | yes | every `pnpm brand:*` command, `pnpm dev`, the builds, the seed scripts, CD |
| The chapter: names, texts, site addresses, Firebase project and web apps, CD's sign-in | `brand/<slug>/brand.json` | yes; every value is public | the builds, CD |
| The site's texts, seeded into the database once | `brand/<slug>/site-content.json` | yes | `pnpm seed:production`, `pnpm dev` |
| Your images | `brand-assets/` | **no**, gitignored | `pnpm dev`, `brand:check`, `brand:push` |
| The images deploys use | your private bucket, `<project>-brand-assets` | no | CD (`brand:pull`) |
| Firebase CLI's project file | `.firebaserc` | no, generated | the `firebase` CLI |

There is no file to edit to choose the chapter. Every command looks in `brand/`: your
chapter's folder (named with lowercase letters, digits and hyphens, such as `jci-valle`) is
selected when it is the only chapter profile there; with none, the example `jci-oriente`
is. Your fork only adds that folder and never edits a shared file, so pulling upstream
updates never conflicts with your configuration. A repository builds one chapter:
`brand:init` refuses to create a second, and with two every command stops and names them.
To run one command against another profile, add `--profile <slug>`.

Your editor explains every field of `brand.json` on hover: it points at a JSON Schema
(`brand/brand.schema.json`).

Upgrading a fork from a version with a root `luminova.json`: the pull that removes it
conflicts once if you had edited it. Resolve it by deleting the file
(`git rm luminova.json`); `brand:doctor` warns while a copy is left. If `brand/` holds
more than one chapter folder (an older `brand:init` allowed it), every command and Deploy
stop until you delete all but the one you build. Send pull requests upstream from a branch
of upstream's `main`, never from your fork's `main`: upstream's CI refuses a chapter folder.

What stays out of the repository: your `gcloud`, `gh` and `firebase` sign-ins (each tool
keeps its own), and the optional `DEPLOY_WEBHOOK_URL` GitHub secret that posts deploy
results to Slack or Discord. No `.env` file is needed: `apps/*/.env.local.example` lists
the few optional overrides.

## Two parts: try it, then go live

Part 1 runs entirely on your computer. You need no Google account and no Firebase
project, and nothing is deployed: your profile starts **local-only**, on an emulator
project named `demo-<slug>`. Part 2 connects a real Firebase project and goes live, when
your chapter decides to. Merging to your fork's `main` is safe at any time: Deploy skips
with a note until the profile has a real project and CD's sign-in (step 9).

| # | Step | Command |
|---|---|---|
| | **Before you start: the tools** | `pnpm brand:setup` |
| | **Part 1: try it on your computer** | |
| 1 | Fork, clone, run the example | `pnpm install`, then `pnpm dev` |
| 2 | Create your profile | `pnpm brand:init` (answer **n**: no Firebase project yet) |
| 3 | Add the 16 images and check them | `pnpm brand:check` |
| 4 | Write the site texts and look at your sites | edit `site-content.json`, `pnpm dev` |
| 5 | Commit the profile | `git add brand/<slug>/` |
| | **Part 2: go live, when you are ready** | |
| 6 | Firebase project, two web apps, second hosting site | Firebase console (below) |
| 7 | Connect the project | `pnpm brand:init --connect` |
| 8 | Check the setup | `pnpm brand:doctor` |
| 9 | Keyless CD | `pnpm brand:provision`, steps 1 and 2 |
| 10 | Create the assets bucket | `pnpm brand:provision --apply` |
| 11 | Upload the images | `pnpm brand:push` |
| 12 | Go live | merge to `main` |
| 13 | First admin | `pnpm seed:production --project <id>` |

"You" means a chapter member. Part 2 needs owner access to the Firebase project and admin
access to the fork.

Every brand command tells you what to do next. A failure ends with a **To fix:** block:
the file or folder to change, the command, and where to run it. A success ends with
**Next:**, the following step of this guide. The `#` comment after each command says
where it goes:

- `# in the repo root` means a terminal at the top of your clone (where `package.json` is); `pnpm brand:*` does not work from a package folder;
- `# in your shell` means any terminal: a sign-in (`gcloud auth login`) or a GitHub command;
- a console name, such as `# in the Firebase console → Project settings`, means that web page.

```text
To fix:
  - put the files marked above in brand-assets/ at the sizes shown (all 16: docs/adopting.md step 3)
      pnpm brand:check   # in the repo root
```

## Before you start

Each part needs a few tools on your computer. Install Node and pnpm first (the first two
rows of the Part 1 table below), clone your fork, then let the repository check the rest:

```bash
pnpm brand:setup               # in the repo root; add --part try or --part live for one part
```

It prints one table per part. Each row shows the tool and the version or account it found.
Missing tools end in a **To fix:** block with the install command for your computer. It
only reads: it never installs anything and never signs you in. In a fresh clone, pnpm
installs the repository's packages before the check runs. To check even before that, run
`node packages/brand/src/cli/setup.ts` instead; it needs only Node.

**Windows:** use WSL 2. Open PowerShell as administrator, run `wsl --install`, restart,
open Ubuntu, and follow the Linux commands below inside it. Clone into your Ubuntu home
folder (`~`), not under `/mnt/c`. Install every tool inside Ubuntu too: the repository's
scripts need bash, and its commands cannot start the Windows versions of `gcloud`,
`firebase` and `pnpm`.

**macOS:** the commands below use Homebrew. Install it from [brew.sh](https://brew.sh) first.

### Part 1 tools: try it

| Tool | macOS | Linux and WSL (Ubuntu) | Check |
|---|---|---|---|
| Node 24 | install nvm (commands below), then `nvm install` in your clone | same as macOS | `node --version` |
| pnpm | `corepack enable` (pnpm comes with Node 24) | same as macOS | `pnpm --version` |
| Java 21 or later (the emulators run on it) | `brew install --cask temurin@21` | `sudo apt install -y openjdk-21-jre-headless` | `java --version` |
| Firebase CLI | `npm install -g firebase-tools@15.22.1` | same as macOS | `firebase --version` |

nvm installs the Node version that `.nvmrc` pins:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
# open a new terminal, then in your clone:
nvm install
```

CI uses Firebase CLI 15.22.1. Another version works for Part 1; `brand:setup` only notes
the difference. If you already have Java from Homebrew's `openjdk` formula, it also works:
it is not on `PATH`, but `pnpm dev` adds it.

### Part 2 tools: go live

| Tool | macOS | Linux and WSL (Ubuntu) | Check |
|---|---|---|---|
| GitHub CLI `gh` | `brew install gh` | [GitHub's instructions for Debian and Ubuntu](https://github.com/cli/cli/blob/trunk/docs/install_linux.md) | `gh --version` |
| Google Cloud CLI `gcloud` | `brew install --cask gcloud-cli` | [Google's instructions for Debian and Ubuntu](https://cloud.google.com/sdk/docs/install) | `gcloud --version` |

Then sign in. Each tool keeps its own sign-in on your computer, outside the repository:

| Sign-in | Command | Needed at | Check |
|---|---|---|---|
| `gh`, as an admin of your fork | `gh auth login` | step 9 | `gh auth status` |
| `gcloud`, as an owner of your Firebase project | `gcloud auth login` | steps 9 to 11 | `gcloud auth list` |
| `gcloud` Application Default Credentials (the sign-in scripts use) | `gcloud auth application-default login` | step 13 | the `gcloud ADC` row of `brand:setup` |
| Firebase CLI | `firebase login` | step 7, only with `--sdkconfig` | `firebase login:list` |

`brand:setup --part live` fails until `gh` and `gcloud` are installed and signed in. The
last two rows only warn: you can do them when you reach their step.

## Part 1: try it on your computer

You need the [Part 1 tools](#part-1-tools-try-it): Node 24, pnpm, Java and the Firebase CLI.
Nothing else.

### 1. Run the example

Follow the README Quickstart. `pnpm dev` starts the local emulators, fills them with test
data and opens both sites with the example profile (`brand/` holds no chapter profile yet,
so `jci-oriente` is selected).
Dev talks to the emulators, never to a real project.

### 2. Create your profile

```bash
pnpm brand:init                                 # asks each question, with a suggested default
pnpm brand:init --local --answers answers.json  # or from a file, without prompts
```

It asks about your chapter: name, city, region, founding year, national federation, the
two site addresses and a contact email. Then it asks whether you already have a Firebase
project. Answer **n** (the default) to start local-only: the profile gets the emulator
project `demo-<slug>`, and you connect a real one at step 7. Answering **y** asks the
Firebase questions now instead (see step 7).

`brand:init` writes `brand/<slug>/brand.json`, copies the example's `site-content.json`
next to it, creates `brand-assets/README.txt` and writes `.firebaserc`. Being the only chapter
profile in `brand/`, the new one is selected from then on. It validates everything before writing anything and never
overwrites an existing profile. It re-asks a malformed or taken slug, or a year that is
not a whole number, on the spot; if a later step fails, your answers are saved to
`brand-init-answers.json` (gitignored) for `--answers`. An answers file is a partial
`brand.json`; anything missing is either derived (site addresses, SEO text and, for a real
project, the storage bucket, site ids, auth domain, sender id and assets bucket) or
reported, all at once:

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
  "backstage": { "emailPlaceholder": "tu.nombre@jcivalle.org", "contactEmail": "hola@jcivalle.org" }
}
```

### 3. Images

Put these 16 PNG files in `brand-assets/` (its `README.txt` lists them too):

| File | Size |
|---|---|
| `logo-main.png`, `logo-on-dark.png`, `logo-on-primary.png` | any, all three the same size, at least 184 px tall |
| `og-image.png` | 1200×630, under 300 KB or WhatsApp skips the preview |
| `<app>/favicon-16.png`, `<app>/favicon-32.png` | 16×16, 32×32 |
| `<app>/apple-touch-icon-180x180.png` | 180×180 |
| `<app>/pwa-192x192.png`, `<app>/pwa-512x512.png`, `<app>/maskable-icon-512x512.png` | 192×192, 512×512, 512×512 |

`<app>` is `spotlight` and `backstage`, so 6 icons each. You only have to make 4 of the 16
by hand: the three logos and `og-image.png`. For the 12 icons, put your logo mark in
`brand-assets/icon-master.svg` (any square SVG) or `brand-assets/icon-master.png` (a
square PNG of at least 512×512), best on a transparent background, and generate them:

```bash
pnpm brand:icons            # the 12 icons from the master; --force replaces existing ones
pnpm brand:check            # one row per file: expected, found, verdict
```

The maskable and Apple icons get an opaque background in your `themeColor`; the others
stay transparent. `brand:icons` never overwrites an icon without `--force`, and if it
cannot write one icon it changes none. You can also
export the 12 icons yourself with any tool that writes exact PNG sizes.

`brand:check` runs the same validator as the build and also schema-checks your
`site-content.json`. A local build reads `brand-assets/` once it holds any of the 16
files (the README alone does not count). Before that, a new profile has no images of its
own and the build lists every missing file.

### 4. Site texts, and a look

Edit `brand/<slug>/site-content.json`: history, mission, vision, values, statistics and
contacts. These texts fill the site once; after going live, the admin `/config` screen is
where they change. Then `pnpm dev` shows both sites with your name, images and texts.

### 5. Commit the profile

Commit `brand/<slug>/`. Never commit `brand-assets/`: it is
gitignored, and a deploy build refuses any asset source other than a pull from your
bucket. Merging to `main` deploys nothing yet: Deploy skips a local-only profile and says
so in the run's summary.

## Part 2: go live

You now also need the [Part 2 tools](#part-2-tools-go-live), `gh` and `gcloud`, and a
Firebase project on the **Blaze** plan (Cloud Functions need it). Each step below starts
with a **Needs:** line: the tools and sign-ins that step uses.

### 6. Firebase project

Needs: a browser.

In the [Firebase console](https://console.firebase.google.com), create the project, then:

1. Register **two web apps**, one for the public site and one for the admin site. Note
   each app id (`1:<number>:web:<hash>`).
2. Add a **second hosting site** for the admin site. The first site's id is usually the
   project id; `brand:init` suggests `<project>-backstage` for the second.
3. Enable **Authentication → Email/Password**, and the rest of the console checklist in
   [`docs/firebase-setup.md`](firebase-setup.md#console-checklist-manual-one-time). App Check
   is optional: a blank `appCheckSiteKey` turns it off.

### 7. Connect the project

Needs: nothing new. Only `--sdkconfig` also needs the Firebase CLI
[signed in](#part-2-tools-go-live) (`firebase login`).

```bash
pnpm brand:init --connect               # only the Firebase questions
pnpm brand:init --connect --sdkconfig   # and read the API keys for you (needs firebase login)
```

It asks the project id, the hosting site ids and both web app ids, replaces the `demo-`
project in `brand/<slug>/brand.json` and rewrites `.firebaserc`. Your chapter's answers
from step 2 stay as they are. `--sdkconfig` reads both API keys, the auth domain and the
sender id with `firebase apps:sdkconfig` (read-only). Run it again any time: for the same
project it offers the current values as defaults, so Enter keeps them; to turn App Check
or web push off, blank that key in `brand.json` instead. Merging this to `main` still
deploys nothing: CD waits for the `deploy` section of step 9.

### 8. Doctor

Needs: the [Part 1 tools](#part-1-tools-try-it), plus `gh` and `gcloud` for the cloud rows.

```bash
pnpm brand:doctor
```

One table, in the order fixes must happen: the Part 1 tools (Node, pnpm, Java, the
Firebase CLI), the selection (which profile `brand/` selects, and why), the profile,
`brand.json`, site content, images, `.firebaserc`, CD identity, `gh` and `gcloud` with
their sign-ins, and the bucket. It only reads, and every row reports even when an earlier
one fails. For a local-only profile it skips the cloud rows. Until step 11 the **bucket**
row fails, and **CD identity** warns until step 9.

If you exported `BRAND_PROFILE` in an earlier version of this guide, the selection row
warns while it differs from what `brand/` selects: remove the `export` line from your
shell's startup file. Tools set that variable for single test builds; you never need it.

### 9. Keyless CD

Needs: [`gcloud` and `gh`](#part-2-tools-go-live), both signed in.

```bash
gcloud auth login              # an owner of your Firebase project
gh auth login                  # an admin of your fork
pnpm brand:provision           # prints every step with your values; changes nothing
```

`brand:provision` prints the whole Google Cloud setup as numbered steps. Each step says
why, where to run it, the exact commands and how to check that it worked. Run its step 1
yourself: it creates CD's deploy account and its keyless sign-in (Workload Identity
Federation: GitHub proves the run comes from your fork's `main`, no key is stored). Its
step 2 is the `deploy` section to add to `brand/<slug>/brand.json`. That section is the
switch: CD deploys only a profile that has it. The full block, with the reasoning behind
each permission, is [`docs/ci-cd.md` section 6](ci-cd.md#6-one-time-provisioning-reproducible).

### 10. Assets bucket

Needs: [`gcloud`](#part-2-tools-go-live), signed in as a project owner.

```bash
pnpm brand:provision --apply   # creates and configures the bucket, skipping what is done
```

The bucket is private and versioned, keeps the last three versions of each file, and the
deploy account from step 9 gets read-only access to it alone. Step 9 must come first:
the grant fails for an account that does not exist yet.

### 11. Upload the images

Needs: [`gcloud`](#part-2-tools-go-live), signed in as a project owner.

```bash
pnpm brand:push                # validates brand-assets/ first, then uploads
pnpm brand:doctor              # every row passes now
```

`brand:push` never deletes, and versioning keeps every overwritten file for rollback. An
image change is not in git, so after going live CD does not see it on its own:
`brand:push` prints the hosting deploy command for that.

### 12. Go live

Needs: git, and a browser to approve the run. `gh` only to deploy again later.

Commit the `deploy` section from step 9 and merge to `main`, then approve the Deploy run it
starts. The first deploy after setup ships everything: rules, functions and both sites.
To deploy everything again later without a merge: `gh workflow run deploy.yml -f surface=all`.
Hosting deploys to a preview channel, is smoke-tested, then promoted. Then check:

- view source on both sites: title, description, `rel=canonical` and `og:image` carry your
  origin and the hashed `og-image.<hash>.png`;
- a WhatsApp share of the public site shows your image and text;
- installing either site as an app shows your name and icon;
- a member QR starts with your `qrPrefix`;
- the public site's "Ingresar" opens your admin origin.

Custom domains and the console settings that must list every hostname:
[`docs/domains.md`](domains.md).

### 13. First admin

Needs: `gcloud` [Application Default Credentials](#part-2-tools-go-live).

```bash
gcloud auth application-default login   # the script uses Application Default Credentials
pnpm seed:production --project <your-project-id>
```

Creates the first admin interactively and seeds the site content from step 4. It refuses
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
