# Plan — repo-contained configuration

Spec: `docs/specs/2026-10-25-repo-contained-config.md`. Branch `feat/brand-repo-config`.
Claude never runs `brand:push`, `brand:provision --apply`, `gh workflow run` or any prod
command; `brand:doctor` only reads.

## Tasks (one commit each, at most 10 files)

1. **Config file.** `packages/brand/src/config.ts`: strict `luminovaConfigSchema`
   (`$schema`, `profile`), `readLuminovaConfig`, JSON Schema render. Root `luminova.json`,
   `brand/luminova.schema.json`, `brand:schema` writes and checks both. Field descriptions on
   both schemas (C8). Tests: missing file, bad JSON, unknown key, bad slug.
2. **Loader.** `selectedProfile`: `--profile` flag, then the `BRAND_PROFILE` override, then
   `luminova.json`; sources `flag | override | file`. Override notice; remove the shell and
   GitHub-variable remedies; selection remedies edit `luminova.json`. `runCli` parses
   `--profile`. Tests rewritten on temp roots with a `luminova.json`.
3. **Release, check, push, apply.** Release refuses an override. `brand:check --assets <dir>`
   replaces the `BRAND_ASSETS_DIR=` hint; `build:release` script replaces the inline release
   build command in remedies. `brand.json` `deploy` section (schema + jci-oriente values).
4. **init, doctor, provision.** `init` writes `luminova.json`, `.firebaserc` and the `deploy`
   section, and puts the asset README in `brand-assets/`. Doctor rows `luminova.json` and
   `CD identity`. Provision prints numbered steps (why, command, where, check) and no B5.
5. **CD.** `brand:ci-config` (writes the four outputs, release rules). `firebase-setup`
   action takes no inputs and exposes outputs; `deploy.yml` reads them, no `vars.*`.
6. **Scripts and turbo.** Seed scripts' messages, `turbo.json` inputs, guard comments.
7. **Docs.** `docs/adopting.md` ("Where configuration lives", steps), `docs/ci-cd.md`
   (section 6 and the variables table), `docs/firebase-setup.md`, `CLAUDE.md`, `README*`,
   brand spec D18 note, brand plan part B (B5 replaced), roadmap row R23.
8. **Copy pass.** Run every command in its failure and success states, collect the output,
   Fable reviews the wording against spec C9; apply.
9. Simplify, route, reviews, stamp, PR, `pnpm pr-tests`.

## Owner steps after merge

Delete the GitHub `production` variables `BRAND_PROFILE`, `GCP_PROJECT_ID`, `WIF_PROVIDER`,
`WIF_SERVICE_ACCOUNT` (CD no longer reads them). Remove any `export BRAND_PROFILE` from
your shell startup file. Then B1–B4 and B6 as before.
