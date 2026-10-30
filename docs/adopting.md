# Adopting Luminova for your chapter

Luminova is not multi-tenant: one deployment serves one chapter. You run it for yours by
forking the repository and filling one git-ignored folder, `brand/local/`, that holds every
value that makes a deployment yours: names, places, origins, the Firebase project, theme
colours, share text and your 16 images. `pnpm install` creates it from the committed example,
`brand/example/` (a neutral chapter, "JCI Ejemplo", on an emulator-only project), so the
example's texts and images are good defaults to start from. Deployments read your brand from
a private bucket in your own Google Cloud project.

- `brand/` commits only `brand/example/` and the two shared files. `brand/local/` is
  git-ignored, and CI's `assert-brand-example-only` check fails a change that adds or edits
  a file anywhere else under `brand/`; deleting one passes.
- Upstream still commits JCI Oriente's own profile, `brand/jci-oriente/`, until its removal.
  It is not a path for your chapter, and CD does not deploy it: CD deploys the brand it pulls
  from the bucket. While it exists and `brand/local/brand.toml` does not, it is the profile
  `brand/` selects on a computer.
- Your fork deploys itself. Its GitHub Actions sign in to your Google Cloud project, which two
  repository variables of the fork name, and pull your brand from your bucket before they
  build. A pull request from a fork never deploys: it gets no credentials.

Every step below names its command. No step needs a Luminova maintainer. If you get stuck,
[open an adoption issue](https://github.com/JCIOriente/luminova/issues/new?template=chapter_adoption.yml).

## Where configuration lives

Your chapter's values live in `brand/local/` and in its bucket; where CD deploys is two
repository variables of your fork. You never export an environment variable or edit your
shell's startup file.

| What | File | In git? | Who reads it |
|---|---|---|---|
| The chapter: names, site addresses, Firebase project and web apps, and the site's texts (seeded into the database once) | `brand/local/brand.toml` | no, git-ignored; every value is public | every `pnpm brand:*` command, the builds, `pnpm seed:production`, `pnpm dev`, CD |
| Your images: the 16 files, laid out at the bucket's paths | `brand/local/` (`logo-main.png`, `spotlight/favicon-16.png`, ...) | **no**, git-ignored | `pnpm dev`, `brand:check`, `brand:push` |
| What the folder last received from the bucket or the example, with hashes | `brand/local/.pull-manifest.json` | no, git-ignored | `brand:pull`, `brand:push`, release builds |
| The brand deploys use: `brand.toml` and the 16 images | your private bucket, `gs://<project>-brand-assets/` | no | CD (`brand:pull`) |
| Where CD deploys: `FIREBASE_PROJECT_ID` and `GCP_PROJECT_NUMBER` (none is a secret) | your fork's repository variables (Settings, Secrets and variables, Actions, **Variables**) | no, GitHub settings | Deploy |
| Firebase CLI's project file | `.firebaserc` | no, generated | the `firebase` CLI |

There is no file to edit to choose the chapter. Every command looks in `brand/`:
`brand/local/brand.toml` is the profile when it exists, otherwise (until upstream's
`brand/jci-oriente/` is removed) that committed profile, otherwise the example. `pnpm install`
creates `brand/local/` from the example when it is missing, never under `CI`, and never
touches a folder that exists, even an empty one. Your fork only adds that git-ignored
folder and never edits a shared file, so pulling upstream updates never conflicts with your
configuration.

### The brand file

`brand/local/brand.toml` holds only what makes your chapter different. Every key you
leave out comes from the example's file, `brand/example/brand.toml`, which sets them all
and shows what each one means. To change one, copy it into your file:

- Required: `name`, `city`, `country`, `project` (the Firebase project id; a `demo-` id
  runs only in the emulators) and `[colors] spotlight`. A real project also needs each
  web app's `apiKey` and `appId` under `[firebase.spotlight]` and `[firebase.backstage]`;
  `brand:init` writes them.
- Tables merge key by key: writing `[contact] email` keeps the example's other `[contact]`
  keys. An array (`[[timeline]]`, `[[reasons]]`, `[[contact.links]]`) replaces the
  example's whole.
- The example's texts are templates: `{name}`, `{shortName}`, `{city}`, `{cityFormal}`,
  `{region}`, `{regionShort}`, `{country}` and `{movementName}` take your values, so its
  default sentences already name your chapter. Your own texts may use them too.
- Derived from `project` unless you set them: `[firebase] storageBucket`, `authDomain`,
  `messagingSenderId`, the hosting sites `[firebase.sites]` (`<project>` and
  `<project>-backstage`), the site addresses `[urls]` (`https://<site>.web.app`),
  `qrPrefix` (the project id without hyphens) and `assetsBucket` (`<project>-brand-assets`).
- `[backstage] contactEmail`, where a member without an account asks for access, defaults
  to `[contact] email`; with neither, the login page shows no link.
- `foundedYear`, which the site states, is the one `brand:init` asks for besides the
  identity. `brand:check` warns while it, `[contact] email`, `[contact] mapUrl` or
  `[backstage] emailPlaceholder` is still the example's.

Every error names the file, the table and the key, such as
`brand/local/brand.toml [contact] email: not an email address`; a syntax error gives
the line and column, and an unknown key is an error, so a typo never falls back to a
default. Line 1 of the file, `#:schema ../brand.schema.json`, points editors with TOML
support (Taplo, Even Better TOML) at `brand/brand.schema.json`, which explains every key
on hover; `brand:check` warns when that line is missing.

Upgrading a fork from a version with a root `luminova.json`: the pull that removes it
conflicts once if you had edited it. Resolve it by deleting the file
(`git rm luminova.json`); `brand:check` warns while a copy is left. Send pull requests
upstream from a branch of upstream's `main`, never from your fork's `main`: upstream's CI
refuses any addition under `brand/` other than the example.

What stays out of the repository: your `gcloud`, `gh` and `firebase` sign-ins (each tool
keeps its own), and the optional `DEPLOY_WEBHOOK_URL` GitHub secret that posts deploy
results to Slack or Discord. No `.env` file is needed: `apps/*/.env.local.example` lists
the few optional overrides.

## Two parts: try it, then go live

Part 1 runs entirely on your computer. You need no Google account and no Firebase
project, and nothing is deployed: your profile starts **local-only**, on an emulator
project named `demo-` plus an id derived from your chapter's name. Part 2 connects a real Firebase project and goes live, when
your chapter decides to. Merging to your fork's `main` is safe at any time: Deploy skips
with a note until your fork's repository variables name a real project (step 9).

| # | Step | Command |
|---|---|---|
| | **Before you start: the tools** | `pnpm brand:check` |
| | **Part 1: try it on your computer** | |
| 1 | Fork, enable Actions in the fork, clone, run the example | `pnpm install`, then `pnpm dev` |
| 2 | Create your profile | `pnpm brand:init` (answer **n**: no Firebase project yet) |
| 3 | Add the 16 images and check them | `pnpm brand:check` |
| 4 | Write the site texts and look at your sites | edit `brand.toml`, `pnpm dev` |
| 5 | Know what stays out of git | nothing to commit: `brand/local/` is git-ignored |
| | **Part 2: go live, when you are ready** | |
| 6 | Firebase project, two web apps, second hosting site | Firebase console (below) |
| 7 | Connect the project | `pnpm brand:init` (answer **y**: connect it) |
| 8 | Check the setup | `pnpm brand:check` |
| 9 | Keyless CD and the repository variables | `pnpm brand:provision`, steps 1 and 2 (answer **y**: do step 2) |
| 10 | Create the assets bucket | `pnpm brand:provision` (answer **y**: do step 3) |
| 11 | Upload the images | `pnpm brand:push` |
| 12 | Go live | `gh workflow run deploy.yml -f surface=all` |
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
  - put the files marked above in brand/local/ at the sizes shown (all 16: docs/adopting.md step 3)
      pnpm brand:check   # in the repo root
```

## Before you start

Each part needs a few tools on your computer. Install Node and pnpm first (the first two
rows of the Part 1 table below), clone your fork, then let the repository check the rest:

```bash
pnpm install                                     # in the repo root
pnpm brand:check                                 # in the repo root
```

It is the one command that checks everything, in four sections: the tools on this
computer, your chapter's files, its images, and going live. Each row shows what it found.
Anything missing ends in a **To fix:** block with the command for your computer. It only
reads: it never installs anything and never signs you in. Before `brand:init`, the check reads the
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

Fork the repository and clone your fork: `gh repo fork JCIOriente/luminova --clone` does
both, with the `origin` remote on your fork and an `upstream` remote on JCIOriente/luminova
(gh then treats `upstream` as its default repository, which is why the `brand:` commands
name your fork, read from `origin`, with `--repo`). GitHub disables Actions in a new fork:
open the fork's **Actions** tab and enable them, so CI checks your pushes (and, from step
12, deploys them). Then follow the README Quickstart in that clone. `pnpm install` creates `brand/local/` from the example, and
`pnpm dev` starts the local emulators, fills them with test data and opens both sites with
that profile. Dev talks to the emulators, never to a real project.

### 2. Create your profile

```bash
pnpm brand:init               # asks each question, with a suggested default
```

It asks about your chapter: its name, city and country, the year it was founded, and the
public site's theme colour. Then it asks whether you already have a Firebase project. Answer
**n** (the default) to start local-only: the profile gets an emulator project named
`demo-` plus an id derived from the chapter's name, and you connect a real one at step 7.
Answering **y** asks the Firebase questions now instead (see step 7).

`brand:init` writes a short `brand/local/brand.toml`: the `#:schema` line, your
answers, and the web apps' keys once a project is connected. Everything else comes from
the example ([The brand file](#the-brand-file)). It also creates `brand/local/README.txt`
(the list of images below) and writes `.firebaserc`. It validates everything before writing
anything, and asks before replacing an existing `brand.toml`. It re-asks a colour that is
not `#RRGGBB` on the spot. If a later step fails, your answers are saved to
`brand-init-answers.json` (gitignored), and the next `pnpm brand:init` offers them: answer
**y** to reuse them.

### 3. Images

`brand/local/` starts with copies of the example's 16 PNG files. Replace them with your chapter's, at the same paths (`brand/local/README.txt` lists them too):

| File | Size |
|---|---|
| `logo-main.png`, `logo-on-dark.png`, `logo-on-primary.png` | any, all three the same size, at least 184 px tall |
| `og-image.png` | 1200×630, under 300 KB or WhatsApp skips the preview |
| `<app>/favicon-16.png`, `<app>/favicon-32.png` | 16×16, 32×32 |
| `<app>/apple-touch-icon-180x180.png` | 180×180 |
| `<app>/pwa-192x192.png`, `<app>/pwa-512x512.png`, `<app>/maskable-icon-512x512.png` | 192×192, 512×512, 512×512 |

`<app>` is `spotlight` and `backstage`, so 6 icons each. You only have to make 4 of the 16
by hand: the three logos and `og-image.png`. For the 12 icons, put your logo mark in
`brand/local/icon-master.svg` (any square SVG) or `brand/local/icon-master.png` (a
square PNG of at least 512×512), best on a transparent background, and generate them:

```bash
pnpm brand:icons            # the 12 icons from the master
pnpm brand:check            # the images section names each file with a problem
```

The maskable and Apple icons get an opaque background in your theme colour; the others
stay transparent. If icons are already there, `brand:icons` asks before replacing them
(answer **y**), and if it cannot write one icon it changes none. You can also export the
12 icons yourself with any tool that writes exact PNG sizes.

`brand:check` runs the same validator as the build, and the build's checks on your whole
`brand.toml`, its site texts included. Its images section checks the 16 files in
`brand/local/` and lists each one with a problem.

### 4. Site texts, and a look

Edit the site texts in `brand/local/brand.toml`: history (`[[timeline]]`), mission,
vision and values (`[mvv]`), statistics (`[stats]`) and contacts (`[contact]`). Copy each
table you change from `brand/example/brand.toml`; the example's texts already name your
chapter through their templates. These texts fill the site once; after going live, the
admin `/config` screen is where they change. Then `pnpm dev` shows both sites with your
name, images and texts.

### 5. Commit the profile

`brand/local/` is git-ignored, so there is nothing to commit: your brand lives in that folder
and, once you go live, in your private bucket. A deploy build refuses any asset source other
than the files `brand:pull` downloaded from that bucket. Merging to `main` deploys nothing
yet: Deploy skips a local-only profile and says so in the run's summary.

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
   project id, and `brand.toml` expects `<project>-backstage` for the second; if your
   site ids differ, set them in `[firebase.sites]`.
3. Enable **Authentication → Email/Password**, and the rest of the console checklist in
   [`docs/firebase-setup.md`](firebase-setup.md#console-checklist-manual-one-time). App Check
   is optional: a blank `appCheckSiteKey` turns it off.

### 7. Connect the project

Needs: nothing new. Reading the API keys for you also needs the Firebase CLI
[signed in](#part-2-tools-go-live) (`firebase login`).

```bash
pnpm brand:init               # answer y to connect your profile to a Firebase project
```

With your profile already in `brand/local/`, `brand:init` asks whether to connect it. Answer
**y**: it asks the project id and both web app ids, rewrites the `project` line and the
`[firebase.spotlight]` and `[firebase.backstage]` tables of `brand/local/brand.toml`, and
rewrites `.firebaserc`. Every other line of the file, comments included, stays as it is.
It also offers to read both API keys with `firebase apps:sdkconfig` (read-only), and asks
for the optional App Check and web push keys. Run it again any time: for the same project
it offers the current values as defaults, so Enter keeps them; to turn App Check or web
push off, delete that key from `brand.toml` instead. Connecting another project keeps the
QR prefix members' credentials already carry. Merging to `main` still deploys nothing: CD
waits for the repository variables of step 9.

### 8. Check the setup

Needs: the [Part 1 tools](#part-1-tools-try-it), plus `gh` and `gcloud` for going live.

```bash
pnpm brand:check
```

Four sections, in the order fixes must happen: the tools on this computer (Node, pnpm,
Java, the Firebase CLI); your chapter (which profile `brand/` selects and why, the
profile, `brand.toml`, `.firebaserc`); the images; and going live (CD
identity, `gh` and `gcloud` with their sign-ins, and the bucket). It only reads, and every
row reports even when an earlier one fails. Until step 11 the **bucket** row fails, and
**CD identity** (your fork's repository variables, read with `gh variable get --repo` on the
fork `git remote get-url origin` names) warns until step 9, and while `origin` is not your
fork; it fails when they name another project than `brand.toml`.

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
Federation, no key is stored). The provider's attribute condition admits only your fork's
`deploy.yml`, on `refs/heads/main`: `assertion.repository == '<owner>/<repo>' &&
assertion.ref == 'refs/heads/main' && assertion.workflow_ref ==
'<owner>/<repo>/.github/workflows/deploy.yml@refs/heads/main'`, with your fork's name
(from `git remote get-url origin`) filled in.

Its step 2 sets your fork's two repository variables, the switch that turns deploys on:

```bash
gh variable set FIREBASE_PROJECT_ID --body <project id> --repo <owner>/<repo>
gh variable set GCP_PROJECT_NUMBER --body <project number> --repo <owner>/<repo>
```

It prints both lines with your values, and in a terminal it asks whether to run them (y/N,
default no). CD derives its sign-in from them: the provider
`projects/<number>/locations/global/workloadIdentityPools/github-actions/providers/github-oidc`
and the account `firebase-deployer@<project>.iam.gserviceaccount.com`, the names step 1
creates. The optional variables `GCP_REGION`, `WIF_PROVIDER` and `DEPLOY_SA` override the
region and those two names ([`docs/ci-cd.md`](ci-cd.md#33-repository-variables)).
The full block, with the reasoning behind each permission, is
[`docs/ci-cd.md` section 6](ci-cd.md#6-one-time-provisioning-reproducible).

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

`brand:push` uploads `brand/local/brand.toml` and the 16 images to
`gs://<project>-brand-assets/`, each with a generation precondition, so it refuses to
overwrite an object someone else changed since your last pull or push. It refuses while any
image has a problem, rewrites `brand/local/.pull-manifest.json` with what it uploaded, and
never deletes; versioning keeps every overwritten file for rollback. A brand change is not
in git, so after going live CD does not see it on its own: `brand:push` prints the hosting
deploy command for that, `gh workflow run deploy.yml -f surface=hosting`.

Deploys use only the bucket's copy: CD pulls `brand.toml` and the images from
`gs://<project>-brand-assets/` (the default bucket name; CD never reads an `assetsBucket`
override) and refuses a `brand.toml` that names another project than `FIREBASE_PROJECT_ID`.

`brand:pull` downloads the same 17 files into `brand/local/` and replaces only those. If any
changed since the last pull, push or install, it asks once (y/N, default no) before
overwriting them, and it refuses without a terminal. Release builds (what CD deploys) need
the pulled manifest, with matching hashes.

### 12. Go live

Needs: [`gh`](#part-2-tools-go-live), and a browser to approve the run.

```bash
gh workflow run deploy.yml -f surface=all --repo <owner>/<repo>   # your fork; brand:check prints it filled in
```

Approve the Deploy run in your fork's **Actions** tab (the `production` environment asks).
The next push to your fork's `main` starts one too. The first deploy to a project ships
everything: rules, functions and both sites. Each deploy job signs in, pulls your brand from
the bucket into `brand/local/` and builds from it. Hosting deploys to a preview channel, is
smoke-tested, then promoted. Then check:

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
| A profile value (`brand.toml`) | Edit `brand/local/brand.toml`, `pnpm brand:check`, `pnpm brand:push`, then `gh workflow run deploy.yml -f surface=hosting` |
| Site content | The admin `/config` screen |
| An image | Replace it in `brand/local/`, `pnpm brand:check`, `pnpm brand:push`, then `gh workflow run deploy.yml -f surface=hosting` |
| Roll back an image | `gcloud storage cp gs://<bucket>/<file>#<generation> gs://<bucket>/<file>`, then deploy |
| Take upstream's updates | **Sync fork** on your fork's GitHub page: the push to your `main` runs CI, then Deploy redeploys the surfaces the update touches |
| Deploy to another project | `pnpm brand:init` (connect it), `pnpm brand:provision`, set both variables again, `pnpm brand:push`; the first deploy to it ships everything |

A new share image gets a new URL automatically (`og-image.<hash>.png`), so WhatsApp picks
it up. To keep an old cached URL working, list it in `[og] legacyPaths`.

## What a profile does not cover

- **Language.** The interface is Spanish. Strings are not extracted for translation yet.
- **Country rules.** The phone format and the date/time zone are Bolivian.
- **Design tokens.** The JCI palette in `packages/ui` is shared; only `[colors]` is per
  profile.
- **Points matrix.** Defaults follow JCI Oriente's scoring
  (`docs/reference/points-matrix.md`); values are editable per term at `/point-rules`, but
  which activities count is code.
- **JCI marks.** Not covered by this repository's license; see [NOTICE](../NOTICE).

If one of these blocks you, say so in an adoption issue: it is how we prioritise.
