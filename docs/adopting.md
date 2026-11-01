# Adopting Luminova for your chapter

Luminova is not multi-tenant: one deployment serves one chapter. You run it for yours by
forking the repository and adding a **brand profile**, `brand/<slug>/`, that holds every
value that makes a deployment yours: names, places, origins, the Firebase project, theme
colours and share text. The committed example, `brand/example/`, is a neutral chapter
("JCI Ejemplo") on an emulator-only project; its texts are good defaults to start from.
Your images never enter git. Deployments read them from a private bucket in your own Google
Cloud project.

A chapter's brand is moving out of git into its own bucket
(`docs/specs/2026-10-29-brand-outside-repo.md`). Where that move stands today:

- `brand/` commits only `brand/example/` and the two shared files. A chapter folder is
  git-ignored, and CI's `assert-brand-example-only` check fails a change that adds or edits
  a file anywhere else under `brand/`; deleting one passes.
- Upstream still commits JCI Oriente's own profile, `brand/jci-oriente/`, which is how JCI
  Oriente deploys until its brand reaches its bucket. In your fork it is a chapter profile
  like yours, so delete it before step 2: `git rm -r brand/jci-oriente`.
- Steps 1 to 4 work as written. Steps 5 and 12 commit a chapter profile, which the check
  refuses, so going live from a fork waits for the fork CD of that spec (its steps 3 and 4).

Every step below names its command. No step needs a Luminova maintainer. If you get stuck,
[open an adoption issue](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml).

## Where configuration lives

Everything is in the repository's files. You never export an environment variable or edit
your shell's startup file, and CD needs no GitHub variables.

| What | File | In git? | Who reads it |
|---|---|---|---|
| Which chapter this repository builds | the folder `brand/<slug>/` itself: your chapter's is the only one besides the example `example` | no, git-ignored | every `pnpm brand:*` command, `pnpm dev`, the builds, the seed scripts, CD |
| The chapter: names, texts, site addresses, Firebase project and web apps, CD's sign-in | `brand/<slug>/brand.json` | no, git-ignored; every value is public | the builds, CD |
| The site's texts, seeded into the database once | `brand/<slug>/site-content.json` | no, git-ignored | `pnpm seed:production`, `pnpm dev` |
| Your images | `brand-assets/` | **no**, gitignored | `pnpm dev`, `brand:check`, `brand:push` |
| The images deploys use | your private bucket, `<project>-brand-assets` | no | CD (`brand:pull`) |
| Firebase CLI's project file | `.firebaserc` | no, generated | the `firebase` CLI |

There is no file to edit to choose the chapter. Every command looks in `brand/`: your
chapter's folder (named with lowercase letters, digits and hyphens, such as `jci-valle`) is
selected when it is the only chapter profile there; with none, the example `example`
is. Your fork only adds that folder and never edits a shared file, so pulling upstream
updates never conflicts with your configuration. A repository builds one chapter:
`brand:init` refuses to create a second, and with two every command stops and names them.

Your editor explains every field of `brand.json` on hover: it points at a JSON Schema
(`brand/brand.schema.json`).

Upgrading a fork from a version with a root `luminova.json`: the pull that removes it
conflicts once if you had edited it. Resolve it by deleting the file
(`git rm luminova.json`); `brand:check` warns while a copy is left. If `brand/` holds
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
| | **Before you start: the tools** | `pnpm brand:check` |
| | **Part 1: try it on your computer** | |
| 1 | Fork, clone, run the example | `pnpm install`, then `pnpm dev` |
| 2 | Create your profile | `pnpm brand:init` (answer **n**: no Firebase project yet) |
| 3 | Add the 16 images and check them | `pnpm brand:check` |
| 4 | Write the site texts and look at your sites | edit `site-content.json`, `pnpm dev` |
| 5 | Commit the profile | `git add brand/<slug>/` |
| | **Part 2: go live, when you are ready** | |
| 6 | Firebase project, two web apps, second hosting site | Firebase console (below) |
| 7 | Connect the project | `pnpm brand:init` (answer **y**: connect it) |
| 8 | Check the setup | `pnpm brand:check` |
| 9 | Keyless CD | `pnpm brand:provision`, steps 1 and 2 |
| 10 | Create the assets bucket | `pnpm brand:provision` (answer **y**: do step 3) |
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
pnpm install                                     # in the repo root
pnpm turbo run build --filter=@luminova/types    # once: the check reads the site texts with it
pnpm brand:check                                 # in the repo root
```

It is the one command that checks everything, in four sections: the tools on this
computer, your chapter's files, its images, and going live. Each row shows what it found.
Anything missing ends in a **To fix:** block with the command for your computer. It only
reads: it never installs anything and never signs you in. In a fresh clone, `pnpm install`
installs the packages but builds none: the site-content row fails until the build above
has run once, and its **To fix:** names it. Before `brand:init`, the check reads the
example, which upstream deploys: its going-live rows only warn, and you need their tools
only once your chapter's own profile connects a Firebase project. A local-only profile
shows going live as one line.

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

CI uses Firebase CLI 15.22.1. Another version works for Part 1; `brand:check` only notes
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
| `gcloud` Application Default Credentials (the sign-in scripts use) | `gcloud auth application-default login` | step 13 | the `gcloud ADC` row of `brand:check` |
| Firebase CLI | `firebase login` | step 7, only to read the API keys for you | `firebase login:list` |

Once your chapter is connected (step 7), `brand:check`'s going-live section fails until
`gh` and `gcloud` are installed and signed in. The last two rows only warn: you can do
them when you reach their step.

## Part 1: try it on your computer

You need the [Part 1 tools](#part-1-tools-try-it): Node 24, pnpm, Java and the Firebase CLI.
Nothing else.

### 1. Run the example

Follow the README Quickstart. `pnpm dev` starts the local emulators, fills them with test
data and opens both sites with the example profile (once `brand/jci-oriente/` is deleted,
`brand/` holds no chapter profile, so `example` is selected).
Dev talks to the emulators, never to a real project.

### 2. Create your profile

```bash
pnpm brand:init               # asks each question, with a suggested default
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
not a whole number, on the spot. If a later step fails, your answers are saved to
`brand-init-answers.json` (gitignored), and the next `pnpm brand:init` offers them: answer
**y** to reuse them. Anything you leave blank is either derived (site addresses, SEO text
and, for a real project, the storage bucket, site ids, auth domain, sender id and assets
bucket) or reported, all at once.

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
pnpm brand:icons            # the 12 icons from the master
pnpm brand:check            # the images section names each file with a problem
```

The maskable and Apple icons get an opaque background in your `themeColor`; the others
stay transparent. If icons are already there, `brand:icons` asks before replacing them
(answer **y**), and if it cannot write one icon it changes none. You can also export the
12 icons yourself with any tool that writes exact PNG sizes.

`brand:check` runs the same validator as the build and also schema-checks your
`site-content.json`. Every command reads one images folder, named in the title of
`brand:check`'s images section: `brand-assets/` once it holds any of the 16 files (the
README alone does not count). Before that, a new profile has no images of its own and
the section lists every missing file.

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

Needs: nothing new. Reading the API keys for you also needs the Firebase CLI
[signed in](#part-2-tools-go-live) (`firebase login`).

```bash
pnpm brand:init               # answer y to connect your profile to a Firebase project
```

With your profile already in `brand/`, `brand:init` asks whether to connect it. Answer
**y**: it asks the project id, the hosting site ids and both web app ids, replaces the
`demo-` project in `brand/<slug>/brand.json` and rewrites `.firebaserc`. Your chapter's
answers from step 2 stay as they are. It also offers to read both API keys, the auth
domain and the sender id with `firebase apps:sdkconfig` (read-only). Run it again any time:
for the same project it offers the current values as defaults, so Enter keeps them; to
turn App Check or web push off, blank that key in `brand.json` instead. Merging this to `main` still
deploys nothing: CD waits for the `deploy` section of step 9.

### 8. Check the setup

Needs: the [Part 1 tools](#part-1-tools-try-it), plus `gh` and `gcloud` for going live.

```bash
pnpm brand:check
```

Four sections, in the order fixes must happen: the tools on this computer (Node, pnpm,
Java, the Firebase CLI); your chapter (which profile `brand/` selects and why, the
profile, `brand.json`, site content, `.firebaserc`); the images; and going live (CD
identity, `gh` and `gcloud` with their sign-ins, and the bucket). It only reads, and every
row reports even when an earlier one fails. Until step 11 the **bucket** row fails, and
**CD identity** warns until step 9.

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
pnpm brand:provision           # after printing, it asks: answer y to do step 3
```

It creates and configures the bucket, skipping what is already done. The bucket is private and versioned, keeps the last three versions of each file, and the
deploy account from step 9 gets read-only access to it alone. Step 9 must come first:
the grant fails for an account that does not exist yet.

### 11. Upload the images

Needs: [`gcloud`](#part-2-tools-go-live), signed in as a project owner.

```bash
pnpm brand:push                # checks the images first, then uploads them
pnpm brand:check               # every row passes now
```

`brand:push` uploads the folder `brand:check` names, and refuses with the same images
section while any image has a problem.

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
