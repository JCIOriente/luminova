#!/usr/bin/env bash
#
# Post-deploy assertion: neither unauthenticated invite callable carries an environment
# variable that disables App Check on the service that is now LIVE.
#
# WHAT THIS IS AND IS NOT. It runs AFTER `firebase deploy --only functions`, so it does not
# prevent a bad deploy — the bad config is already serving by the time this reads it. It
# DETECTS one and stops the rest of the release: `deploy-hosting` gates on
# `needs.deploy-functions.result != 'failure'`, so a hit here also holds back the UI. That is
# deliberate. Shipping a frontend against an endpoint whose attestation is off is strictly
# worse than shipping neither.
#
# It replaces a pre-deploy grep of `apps/beacon/.env*` that could not cover any of this: that
# directory is not the one firebase-tools reads (`firebase.json` declares
# `"source": "apps/beacon/dist"`), and the grep ran before `predeploy` built dist, so its dist
# arm never executed. The narrowed repo grep now lives in PR CI, where a committed override is
# the only thing it was ever able to catch. This step covers what a repo grep structurally
# cannot see: a console edit, a value set directly on the Cloud Run service, and a turbo cache
# hit restoring an unlisted dotenv.
#
# TWO VARIABLE FAMILIES, not one. `FUNCTIONS_EMULATOR` is what our own code keys on
# (`enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"`). `FIREBASE_DEBUG_MODE` — and
# `FIREBASE_DEBUG_FEATURES` carrying `skipTokenVerification` — fails the control open ONE LEVEL
# BELOW our code, inside firebase-functions: it routes App Check through
# `unsafeDecodeAppCheckToken`, which accepts a self-crafted UNSIGNED token. Enforcement would
# still read `true` in our own cold-start log line while accepting anything, so the log cannot
# catch this family and only a read of the deployed env can.
#
# PRESENCE IS THE TEST, not the value. `FUNCTIONS_EMULATOR=false` is harmless to the code path
# today, but none of these belong on a deployed service at any value, and a check that reasons
# about values has to stay in sync with three different consumers' truthiness rules.
#
# Usage: assert-deployed-env-clean.sh <service> [<service>...]
#   ENV_PROBE  — optional command run as `$ENV_PROBE <service>`, printing the service's env as
#                JSON on stdout. Exists so the fixture tests can drive every arm below,
#                including the failure arms, without a GCP project. Defaults to gcloud.
#   GCP_REGION — region for the default probe (gen2 default us-central1; beacon sets no region
#                and calls no setGlobalOptions).
set -euo pipefail

BANNED_KEYS=(FUNCTIONS_EMULATOR FIREBASE_DEBUG_MODE FIREBASE_DEBUG_FEATURES)
region="${GCP_REGION:-us-central1}"

if [ "$#" -eq 0 ]; then
  echo "::error::assert-deployed-env-clean.sh needs at least one service name" >&2
  exit 2
fi

if [ -z "${ENV_PROBE:-}" ]; then
  # A MISSING BINARY IS A WIRING BUG, not a runtime condition, so it fails hard here rather
  # than falling into the tolerant "couldn't check" arm below.
  #
  # `firebase-setup` installs Node, pnpm and firebase-tools and runs google-github-actions/auth,
  # which writes ADC only and installs no CLI — so deploy.yml runs a pinned setup-gcloud before
  # the step that calls this. ubuntu-24.04 also ships the SDK today, which makes this check
  # belt-and-braces rather than load-bearing; it stays because the message it prints is the
  # difference between a five-minute fix and a confusing post-deploy failure.
  command -v gcloud >/dev/null 2>&1 || {
    echo "::error::gcloud is not on PATH, so the deployed env was never read. Add google-github-actions/setup-gcloud to this job." >&2
    exit 2
  }
  : "${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set when ENV_PROBE is not}"
fi

probe() {
  if [ -n "${ENV_PROBE:-}" ]; then
    "$ENV_PROBE" "$1"
  else
    gcloud run services describe "$1" \
      --region="$region" --project="$GCP_PROJECT_ID" \
      --format='json(spec.template.spec.containers[0].env)'
  fi
}

found=0
# `checked` only, not a matching `unchecked` beside it: the two always summed to `$#`, and
# keeping both meant a hidden invariant nothing asserted. This is the half that survives ON
# PURPOSE, because the two are not symmetric under a future edit. The post-loop rule asks
# "did anything get read?" — so a new branch that neither reads a service nor marks it absent
# leaves `checked` low and FAILS, while the same branch counted from `unchecked` would leave
# `unchecked < $#` and PASS. One direction fails closed; the other reintroduces the exact
# silent green this script exists to prevent. The absent count is derived for messaging only.
checked=0

for svc in "$@"; do
  stderr_file="$(mktemp)"
  if ! out="$(probe "$svc" 2>"$stderr_file")"; then
    err="$(cat "$stderr_file")"
    rm -f "$stderr_file"
    # ONLY a missing service is tolerated, and only as a warning. Everything else — a revoked
    # permission, a typo'd service name, an API outage — FAILS. A tolerant catch-all would
    # leave this assertion permanently silent under a green check, which is the exact "guard
    # that gates nothing" failure this step was written to replace.
    #
    # THE PATTERN IS THE TOOL'S ACTUAL WORDING, not a guess at it. `gcloud run services
    # describe` does NOT say "NOT_FOUND" for an absent service: `GetService` swallows the
    # HttpNotFoundError and returns None, and `lib/surface/run/services/describe.py:114` then
    # raises `Cannot find service [<name>]` (Cloud SDK 577.0.0). The first version of this
    # regex matched only NOT_FOUND-ish spellings, so this arm — and the all-absent rule below
    # that depends on it — could never fire in production, while the fixtures passed because
    # they carried the same invented text. NOT_FOUND is kept as a second alternative because
    # the raw API and other surfaces do use it; "Cannot find service" is the one that fires.
    if printf '%s' "$err" | grep -qE 'Cannot find service|NOT_FOUND'; then
      echo "::warning::$svc does not exist in $region, so its env was NOT checked. If this deploy was meant to create it, the deploy itself is what to look at."
      continue
    fi
    echo "::error::could not read the deployed env of $svc — this assertion did NOT run. ${err}" >&2
    exit 2
  fi
  rm -f "$stderr_file"

  # Parsed with a REAL JSON parser, and the parse is itself the positive control: the
  # predecessor piped a flattened `--format=value(...)` rendering into grep, where an empty
  # string — a renamed field, a changed rendering, an env list that did not load — matches
  # nothing and reads as "clean". A false pass on this check is worse than no check.
  names="$(printf '%s' "$out" | python3 -c '
import json, sys
doc = json.load(sys.stdin)
env = (((doc.get("spec") or {}).get("template") or {}).get("spec") or {}).get("containers") or []
env = (env[0].get("env") if env else None) or []
names = [e["name"] for e in env if isinstance(e, dict) and "name" in e]
if not names:
    raise SystemExit("no environment variables parsed out of the describe output")
print("\n".join(names))
')" || {
    echo "::error::could not parse the deployed env of $svc, so nothing was verified. A gen2 function always carries env vars, so an empty or unreadable list means the describe output changed shape — fix this check rather than trusting it." >&2
    exit 2
  }

  checked=$((checked + 1))
  hits=0
  for key in "${BANNED_KEYS[@]}"; do
    if printf '%s\n' "$names" | grep -qx "$key"; then
      # The remedy is the SERVICE, not the repo: nothing in the checkout put this here.
      echo "::error::$svc has $key set on the deployed Cloud Run service. App Check on the unauthenticated invite callables is not enforced. Remove it from the service (gcloud run services update $svc --region=$region --remove-env-vars=$key), find who set it, and redeploy."
      found=$((found + 1))
      hits=$((hits + 1))
    fi
  done
  # Only when it really is clean. This line used to print unconditionally, so a service that
  # had just been reported dirty also got an "ok" line naming it — the exit code was still 1,
  # but a reader scanning the log found the service declared clean by name.
  if [ "$hits" -eq 0 ]; then
    echo "ok: $svc carries none of ${BANNED_KEYS[*]}"
  fi
done

if [ "$found" -gt 0 ]; then
  exit 1
fi
# TOLERATING EACH MISS IS NOT THE SAME AS TOLERATING ALL OF THEM. One absent service says
# nothing about the other, so it is a warning. Zero services read means this assertion verified
# NOTHING and reported success — a guard that gates nothing, which is the failure mode the step
# it replaced actually had.
#
# The reachable cause is the region. `region` defaults to us-central1 on the stated assumption
# that beacon sets no `region` and calls no `setGlobalOptions`; the day a callable gets one,
# every describe here returns NOT_FOUND and every miss is individually excusable. Fail instead,
# so the assumption is corrected rather than silently outlived.
if [ "$checked" -eq 0 ]; then
  echo "::error::no service was actually checked (all $# absent from $region), so App Check enforcement was NOT verified. If a callable now sets a region, pass GCP_REGION; otherwise look at whether the deploy created these services at all." >&2
  exit 2
fi
if [ "$checked" -lt "$#" ]; then
  echo "note: $(($# - checked)) service(s) could not be checked — see the warnings above."
fi
