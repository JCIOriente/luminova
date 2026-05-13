---
name: secure-dep-vetting
description: Vet npm dependencies before adding or upgrading them — always pick the latest secure version compatible with Node 24, block on known CVEs. Use this skill whenever the user wants to add, install, upgrade, or replace a dependency in `package.json` or any related lockfile, even if they don't ask for security review explicitly. Triggers on phrases like "add lodash", "install zod", "add this package", "bump axios to latest", "replace moment with dayjs", "what version of X should I use", "is this dep safe", "add a new npm dependency", or any edit that touches a `dependencies` / `devDependencies` block. Runs `npm view` to find the current latest, checks `engines.node` compatibility with Node 24, runs `pnpm audit` to check for CVEs, and refuses to proceed when a known advisory or incompatibility exists. Always invoke before editing dependency files — never default to a stale version pulled from training data.
---

# Secure Dependency Vetting

A skill for adding and upgrading npm dependencies safely. Three rules, in order:

1. **Latest secure** — always pick the newest version that has no known CVE, no deprecation notice, and no incompatibility. Never propose a version from memory.
2. **Node 24 compatible** — this project's runtime is Node 24 (LTS). Reject any package whose `engines.node` excludes Node 24.
3. **Block on CVE** — `high` or `critical` advisory anywhere in the dependency closure is a stop.

This project uses **pnpm**. The `packageManager` field in root `package.json` pins the pnpm version. All workspace operations use pnpm.

## When to apply

Invoke this skill before:

- Adding a new entry to `package.json` `dependencies` / `devDependencies`
- Bumping a version specifier in any `package.json`
- Replacing a dependency with another (e.g. moment → dayjs)
- The user asks "what version of X should I use" or "is X safe"

If the user is only running `pnpm install` to refresh a lockfile, this skill does not apply — that's lockfile maintenance, not a dependency decision.

## Workflow

### Step 1 — Identify candidate and target

Confirm:
- **Package name**: exact string the user wants. If ambiguous ("a date library"), ask for specifics; do not pick silently.
- **Target workspace package**: e.g. `apps/backstage/package.json`, `packages/ui/package.json`, root `package.json`. Most app-level deps go in the app's package.json, not root.
- **Why**: one-liner on purpose. Reject typo-squats, abandoned packages, packages with no recent releases (>2 years stale on a security-sensitive dep is a flag).

### Step 2 — Look up the latest published version

Do not type a version from memory.

```bash
npm view <package> version
npm view <package> dist-tags
npm view <package> deprecated
npm view <package> time.modified
npm view <package> engines
```

Interpret:
- **`dist-tags.latest`** is the stable channel. If the absolute newest version is on a `next`/`beta`/`canary`/`rc` tag, use `latest` instead.
- **`deprecated`** non-empty → **stop**. Surface the deprecation message; it often names a successor.
- **`time.modified`** ancient (>2 years) on a security-sensitive package (auth, crypto, JWT, validators, network) → **flag** and ask the user to confirm.
- **`engines.node`** must include Node 24. If it requires `>=20 <24` → reject this version, fall back to a version that supports Node 24, or pick a different package.

### Step 3 — Check peer-dep compatibility

```bash
npm view <package>@<version> peerDependencies
```

Compare against existing versions in the consuming workspace. If conflict:
- Prefer the version of the new package that's compatible with current peers.
- If only an older version works and it has a known CVE → **block** and surface the trade-off; don't silently downgrade.
- For monorepo-wide peers (React, TypeScript), confirm compat with **all** workspaces, not just the target.

### Step 4 — Run security audit

This project uses pnpm. Use pnpm audit:

```bash
# From repo root — audits the entire workspace
pnpm audit --audit-level=high

# Or run a dry-add to see what the candidate would pull in
pnpm --filter <workspace-name> add <package>@<version> --lockfile-only
pnpm audit --audit-level=high
```

If the dry-add introduces advisories, revert before continuing:

```bash
git checkout -- pnpm-lock.yaml <workspace>/package.json
```

`pnpm audit` surfaces both direct and transitive CVEs. Read the output carefully — sometimes the advisory is in a transitive that has a patched parent version available via `pnpm.overrides`.

### Step 5 — Decide

**Block** if any of:
- Package is deprecated (no override).
- `engines.node` excludes Node 24 and no compatible version exists.
- `pnpm audit` reports `high` or `critical` in this package or transitives it introduces.
- Peer-dependency conflict that cannot be resolved without pulling another package below its latest secure version.
- Package shows signs of abandonment (no release in >2 years on a security-sensitive dep, archived GitHub repo, single-maintainer with no activity).

**Proceed** otherwise. State explicitly:
- Version chosen and dist-tag (`latest`).
- Node compat (e.g. "engines: >=18, includes 24").
- Audit result (e.g. "clean", or "1 moderate transitive — accepted at `--audit-level=high`").
- Peer compat status.

### Step 6 — Update the dependency file

Edit the **correct workspace** `package.json`. Use the right semver range:

- **Security-critical** (firebase, firebase-admin, auth, crypto, jwt, zod for input validation): pin **exact** (`"firebase": "11.2.0"`) so a malicious patch can't slip in. Rely on Renovate/Dependabot PRs for upgrades.
- **Framework** (react, vite, tanstack): caret (`"react": "^19.0.0"`) — patch + minor updates.
- **Utilities** (lodash, clsx, date-fns): caret is fine.
- **Types** (`@types/*`): caret, devDependencies only.

Reinstall and re-audit:

```bash
pnpm install
pnpm audit --audit-level=high
```

If the post-install audit surfaces something the dry-run missed (different resolution), report and revert.

### Step 7 — Consider pnpm overrides for transitive CVEs

If a transitive has a CVE but a patched version exists upstream, add to root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "vulnerable-pkg@<2.0.0": "2.0.1"
    }
  }
}
```

Then `pnpm install` and re-audit. Document the override with a comment in the PR (not in JSON — out-of-band note).

## Output format

After the workflow, summarize so the user can verify quickly:

```
## secure-dep-vetting: <package>

- Target: <workspace>/package.json (<dependencies | devDependencies>)
- Version chosen: <version>  (pinned exact | ^range)
- Why: <brief>
- Latest stable: <version> (dist-tag: latest)
- Last published: <date>
- Deprecated: no | yes — <message>
- Node 24 compat: ok (engines: <range>)
- Peer compat: ok | conflict resolved by <…>
- Audit: clean | N moderate (transitive, --audit-level=high) | BLOCKED — <advisory-id, package, severity>

Action: added to <file> | blocked, suggested alternative: <name>
```

## Why this exists

LLM training data is months to years stale. A version specifier from memory is the most common way to introduce:
- A known CVE published since training (especially in auth, crypto, validators, network libs)
- A deprecated package with a recommended successor (training data often shows the deprecated one as canonical)
- A version that pre-dates a Node 24 compatibility fix
- A version that pre-dates a major security fix

Verifying against the live registry takes seconds. Skipping it costs real teams months of remediation.

## Out of scope

- GitHub Actions versions (`uses: org/action@v4`) — rely on Dependabot.
- Docker base image tags — rely on Trivy / Hadolint in CI.
- License compliance — not in scope for this skill.
- Supply-chain provenance (npm package provenance attestations) — surface if `npm view <pkg> --json | jq '.dist.attestations'` is present, but don't block on absence.
