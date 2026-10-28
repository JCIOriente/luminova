# Brand CLI follow-ups: SVG icon master, all-or-nothing icons, unknown flags

Status: approved 2026-10-26. Follow-ups noted on R21 (#271). Builds on
`docs/specs/2026-10-22-brand-config-design.md`.

## Problem

- `brand:icons` reads only `brand-assets/icon-master.png`, though most logo marks are
  drawn as SVG and sharp already reads SVG.
- `brand:icons` renders all 12 icons before writing, then writes them one by one. A disk
  error partway (full disk, a read-only file) leaves a set mixing new and old icons.
- Every brand command reads its flags by name and ignores anything else. `pnpm brand:icons
  --forse` runs without `--force`, and `pnpm brand:check --relase` checks the wrong set,
  both without a word.

## Decisions

- **F1. An SVG master.** `brand:icons` reads `brand-assets/icon-master.svg` when there is
  no `icon-master.png`. The SVG must be square; its size does not matter, because sharp
  renders it at each icon's size. Both files present is an error: keep one.
  Nothing new is installed: sharp renders SVG.
- **F2. All or nothing.** Each icon is written to a hidden temporary file next to its
  target, then all are renamed into place. A failed write removes the temporary files and
  changes no icon. A failed rename, after every write succeeded, says how many icons were
  replaced and gives the command that finishes the set.
- **F3. Each command declares its flags, and reads them only through that declaration.**
  `parseArgs` (`packages/brand/src/argv.ts`) checks argv against a command's flags and
  returns `args.has()` / `args.value()`, which throw on a name that was not declared, so
  the list that is checked is the list that is read. An unknown flag, a value given to a
  switch, or a stray word stops the command before it does anything, with a **To fix:**
  line listing the flags it takes. A bare `--` is ignored. `runBrandCommand` runs every
  command this way; `runCli` builds on it and adds `--profile`. `brand:setup` calls
  `parseArgs` directly: `argv.ts` imports no npm package, so setup keeps running before
  `pnpm install` (R26, S4).
- **F4. Out of scope.** `brand:assert-dist` takes the dist folder as a positional argument
  from the hosting `predeploy` hook; it is not an adopter command and keeps its argument.
  No `--help` flag: the unknown-flag message lists the flags.
