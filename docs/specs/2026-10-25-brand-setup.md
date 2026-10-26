# Tool setup for adopters (R26)

Status: approved 2026-10-25. Roadmap R26. Builds on `docs/specs/2026-10-25-profile-discovery.md`.

## Problem

`docs/adopting.md` names the tools each part needs (Node 24, pnpm, Java, the Firebase CLI;
then `gcloud`, `gh` and their sign-ins) but not how to install them, and nothing checks
them before a step fails halfway. `brand:doctor` checks Node, pnpm and the `gcloud`
account, but only once a profile exists, and its install hints are a URL or nothing.

## Decisions

- **S1. `pnpm brand:setup` only reads.** It runs each tool's version command and sign-in
  check and prints what it found. It never installs, signs in or writes a file. A missing
  tool gets the install command for this computer in the usual **To fix:** block.
- **S2. Grouped by guide part.** Part 1 (try it): `node`, `pnpm`, `java`, `firebase`.
  Part 2 (go live): `gh`, `gh account`, `gcloud`, `gcloud account`, `gcloud ADC`,
  `firebase account`. `--part try` or `--part live` checks one part; the default is both.
  Exit 1 when a checked row fails; a warning never fails.
- **S3. Severity follows the step that needs it.** A missing tool fails. A missing sign-in
  fails for `gh` and `gcloud` (step 9 needs both). `firebase account` and `gcloud ADC`
  warn: only `brand:init --connect --sdkconfig` (step 7, optional) and
  `seed:production` (step 13) need them; even an error in their check only warns.
- **S4. Runs before `pnpm install`.** `setup.ts` imports no npm package, so a fresh clone
  can check its tools before installing anything: `node packages/brand/src/cli/setup.ts`
  needs Node alone. A test pins this. (`pnpm brand:setup` in a clone without
  `node_modules` makes pnpm 11 install the packages first, then run the check.)
- **S5. One table of checks.** The checks and their install remedies live in
  `packages/brand/src/cli/tools.ts`. `brand:doctor` uses them: the Part 1 rows open its
  table, the Part 2 rows replace its `gcloud account` row (skipped for a local-only
  profile, as before), except the two optional sign-ins of S3. `commandFailure`'s "not installed" remedy comes from the same
  table, so `brand:push` and the rest print the same install command.
- **S6. Install commands per OS, from the vendors' own pages** (checked 2026-10-25):
  macOS uses Homebrew (and nvm's script for Node), Linux uses Ubuntu's apt or the vendor
  script. The Firebase CLI is `npm install -g firebase-tools@15.22.1`, the version CI pins.
  Java 21 is firebase-tools' minimum (`MIN_SUPPORTED_JAVA_MAJOR_VERSION`).
- **S7. Windows means WSL 2.** `pnpm dev` runs a bash script, and Node's `execFile` cannot
  start the `.cmd` shims `gcloud`, `firebase` and `pnpm` install on Windows. On native
  Windows, `brand:setup` stops before any check, and `brand:doctor` opens with a failing
  `windows` row: install WSL 2 (`wsl --install`) and follow the Linux commands inside it. Owner ruling, 2026-10-25.
- **S8. Homebrew's keg-only OpenJDK counts.** `tools/scripts/emulators.sh` adds
  `/opt/homebrew/opt/openjdk/bin` to `PATH`, so `java` found only there is `ok` for
  `pnpm dev`, with a note; it wins over another Java on `PATH`, as it does in
  `pnpm dev`. macOS's `/usr/bin/java` stub ("Unable to locate a Java Runtime") counts as
  not installed.
- **S9. Sign-in checks are local and read-only.** `gcloud auth list`, `gh auth status`,
  `firebase login:list` (`gh auth status --active`, so another account's dead token does
  not fail the row; without the flag on gh before 2.40, which rejects it. An invalid
  `GH_TOKEN` is told to be unset, since `gh auth login` cannot replace it);
  Application Default Credentials (ADC) by file:
  `GOOGLE_APPLICATION_CREDENTIALS`, else `application_default_credentials.json` in the
  gcloud config folder (`CLOUDSDK_CONFIG` or `~/.config/gcloud`). A
  `GOOGLE_APPLICATION_CREDENTIALS` naming a missing file is reported as such. No token is
  minted.

## Docs

`docs/adopting.md` gains **Before you start**: one table per part with the install command
for macOS, Linux and Windows (WSL), and a verify command per tool. Steps 6–13 name the
tools they need and link to it. The README Quickstart points there.

## Out of scope

Native Windows support for the brand CLIs, and installing anything.
