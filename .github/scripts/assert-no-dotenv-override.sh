#!/usr/bin/env bash
#
# The REPO half of the App Check enforcement guard: no committed (or built) beacon env file
# sets FUNCTIONS_EMULATOR, which would ship the two unauthenticated invite callables with
# enforcement off (`enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"`).
#
# This is the narrow half. A console edit or a value set on the Cloud Run service cannot be
# seen from a checkout at all; those are covered after every release by
# assert-deployed-env-clean.sh. What a repo scan can catch is a dotenv file, and only if it
# looks in the directory firebase-tools actually reads: `env.js` resolves the dotenv directory
# from the functions SOURCE (`opts.configDir || opts.functionsSource`) and firebase.json
# declares `"source": "apps/beacon/dist"`. `apps/beacon/.env*` is never read for this project.
#
# RUN IT AFTER THE BUILD, and know what the dist arm is worth where you run it. dist is
# gitignored and wiped by apps/beacon/build.mjs, so it only exists once something has built
# beacon. A turbo CACHE RESTORE is the one path that could put an unlisted file there — and no
# turbo cache is configured in GitHub CI, so on that runner the arm scans a freshly built dist
# and cannot fire. It is live locally under `pnpm pr-tests`. Keep the arm (it costs nothing and
# a cache may be configured later) but do not call it a CI control; the CI-live arm is
# `apps/beacon/.env*`, a hygiene signal, and the real control is the post-deploy assertion.
#
# Usage: assert-no-dotenv-override.sh <dir> [<dir>...]
set -euo pipefail

KEY="${DOTENV_KEY:-FUNCTIONS_EMULATOR}"

if [ "$#" -eq 0 ]; then
  echo "::error::assert-no-dotenv-override.sh needs at least one directory" >&2
  exit 2
fi

found=""
scanned=""
for dir in "$@"; do
  [ -d "$dir" ] || continue
  # ONE pass builds both accumulators. An earlier version walked the directory list twice —
  # once to grep, once to compose the success message — so a slip would have made the "ok"
  # line name a directory that was never scanned: the exact silent mismatch this guard exists
  # to prevent.
  scanned="$scanned $dir/.env*"
  # `(export)?` mirrors firebase-tools' own LINE_RE (`^\s*(?:export)?\s*([\w./]+)\s*=`, flags
  # `gms`), which accepts the shell `export FOO=bar` spelling as an ordinary assignment.
  # Without it this missed a line the parser honours, and FUNCTIONS_EMULATOR is in neither
  # RESERVED_KEYS nor RESERVED_PREFIXES, so the deploy would not have caught it either.
  # `[[:space:]]*` not `+` for the same reason: the parser's `\s*` is optional there too, so
  # even `exportFUNCTIONS_EMULATOR=true` reads as that key.
  #
  # -s suppresses grep's "No such file or directory" when the `.env*` glob matches nothing
  # (bash leaves an unmatched glob literal), which is the normal case. -l prints the filename
  # without the contents, so a secret in a neighbouring line never reaches the log.
  if grep -rlsE "^[[:space:]]*(export)?[[:space:]]*${KEY}[[:space:]]*=" "$dir"/.env*; then
    found="yes"
  fi
done

if [ -n "$found" ]; then
  echo "::error::${KEY} is set in a beacon env file (listed above). Under apps/beacon/dist that is the directory firebase-tools deploys from, so it would disable App Check on the unauthenticated invite callables in production. Remove it."
  exit 1
fi
echo "ok: no ${KEY} override in${scanned:- (none of the given directories exist)}"
