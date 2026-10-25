# Local-first adoption

Status: approved design (owner, 2026-10-25)
Follows: `docs/specs/2026-10-25-repo-contained-config.md` (C11 lands here)

## 1. Problem

A new chapter (say JCI Osaka) meets Luminova in three moments: trying it, making it theirs,
and going live. Today the tools force the third onto the first two:

- `brand:init` asks for a real Firebase project and both web app ids before anything else.
- `pnpm dev` takes its Firebase settings from `apps/*/.env.local`, which still names JCI
  Oriente's project, so a new profile's dev server and its seeded emulator data disagree.
- Every push to a fork's `main` starts Deploy, which fails until the cloud setup exists.
- After `brand:push` and `brand:doctor`, "Next" presents a production deploy as the
  immediate step.

Owner rule: nothing reaches production until the chapter decides to go live.

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| L1 | Try before the cloud | `brand:init` first asks whether a Firebase project exists. "No" (or `--local`) writes a **local-only profile**: `firebase.projectId` `demo-<slug>`, placeholder web config, no `deploy` section | The Firebase emulators run a `demo-` project with no real project behind it, and every release path already refuses `demo-` projects |
| L2 | Connect later | `pnpm brand:init --connect` asks only the Firebase questions (project, sites, web apps, optional `--sdkconfig`) for the profile `luminova.json` selects and rewrites `.firebaserc`. Re-connecting the same project keeps its current values. It never writes `deploy`: that section is the switch that lets CD deploy, added at `brand:provision` step 2 once CD's account exists | Going live is one command, not a re-run of the whole questionnaire |
| L3 | Dev reads the profile | The Vite plugin feeds `firebase.web` from the profile to every mode (dev, `build:local`, release), not only production builds. `pnpm dev` connects to the emulators unless an env file sets `VITE_FIREBASE_EMULATOR_ENABLED=false` | One source for the project id: dev, the emulators (`.firebaserc`) and the seeds agree. `.env.local` becomes optional (C11) |
| L4 | CD waits for setup | Deploy's `filter` job reads `luminova.json` and the profile with `.github/scripts/deploy-ready.sh`: a profile without `deploy`, or on a `demo-` project, skips every deploy job with a notice and a summary line naming `pnpm brand:provision` | A fork's merges stay green until the chapter sets up CD; no credential is minted, no environment approval is requested |
| L5 | Going live is a choice | "Next" after `brand:push`, `brand:doctor` and `brand:provision` leads with checking the setup and says "when you are ready to go live" before any deploy. A local-only profile's doctor skips the cloud rows and points at `--connect` | The tool must never read as "deploy now" |
| L6 | Guide | `docs/adopting.md` splits into "Try it locally" (no cloud account) and "Go live" | The order a newcomer actually follows |
