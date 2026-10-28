# Brand commands without flags

Status: approved 2026-10-28 (R27). Supersedes the flag handling of
`docs/specs/2026-10-26-brand-cli-followups.md` F3, and `brand:setup` / `brand:doctor` of
`docs/specs/2026-10-25-brand-setup.md` and `docs/specs/2026-10-22-brand-config-design.md`.

## Problem

The brand commands are for chapter members who are not engineers, yet:

- `brand:doctor` and `brand:check` passed while `brand:push` failed with 16 missing images:
  check and doctor read the profile's own `assets/` when `brand-assets/` is empty, push read
  `brand-assets/` only. Each printed it differently (a summary row, a per-file table, a list
  of absolute paths), and doctor never named the folder.
- `brand:setup`, `brand:doctor` and `brand:check` overlap: doctor runs setup's tool rows and
  summarises check's rows.
- Thirteen flags to learn (`--assets`, `--release`, `--from`, `--force`, `--apply`, `--repo`,
  `--part`, `--profile`, `--check`, `--local`, `--connect`, `--sdkconfig`, `--answers`).

## Decisions

- **C1. No command takes a flag.** Any argument stops the command before it does anything:
  `brand:check takes no options (got --assets x).`, then the plain command to run. `brand:assert-dist <app>` keeps its
  positional argument: the hosting predeploy hook passes it, nobody types it.
- **C2. One `pnpm brand:check`** replaces `brand:setup`, `brand:doctor` and `brand:check`. It
  prints four titled sections in fix order, their check, status and detail columns aligned
  across all four:
  1. *Tools on this computer*: Node, pnpm, Java, Firebase CLI.
  2. *Your chapter*: the selection, the profile, `brand.json`, site content, `.firebaserc`.
  3. *Images in `<folder>/`*: one row per image with a problem, then one row for the rest
     (`all 16 valid`, or `14 more valid`).
  4. *Going live*: CD's identity, gh, gcloud and their sign-ins (the scripts' sign-in and
     the Firebase CLI's only warn), the bucket. A local-only profile shows one row instead:
     it comes with going live.
  Then one **To fix:** block in section order and a summary line; **Next:** when nothing
  failed. Exit 1 on any failure; `warn` and `skip` never fail. pnpm installs the packages
  before running it, so a fresh clone needs only Node and pnpm.
- **C3. One images folder.** Every command reads the folder `brand:check` names
  (`selectAssetsDir`: `brand-assets/` once it holds any image, else the profile's own
  `assets/`). `brand:push` uploads that folder, and its refusal prints the same images
  section. The deploy (release) rules stay in the release build and CD.
- **C4. A choice is a question, and no is the default.** `brand:icons` asks before
  replacing icons already there. `brand:provision` prints the steps, then asks whether to do
  step 3 (create and set up the bucket, skipping what is done). `brand:init` creates the
  profile, or, when `brand/` already has one, asks whether to connect it to a Firebase
  project; it first offers the answers a failed try saved, and removes them once used. With
  no terminal (a script, CI) nothing is asked: icons and init refuse and say to run them in
  a terminal, provision only prints.
- **C5. The profile is the folder in `brand/`.** `--profile` is gone. `BRAND_PROFILE` and
  `BRAND_ASSETS_DIR` stay as tooling-only environment overrides (`brand:guard` builds the
  fixture with them).
- **C6. `brand:schema` only writes.** Drift fails `packages/brand/src/schema.test.ts`, which
  CI runs with the package's tests, so CI drops `brand:schema --check`.
