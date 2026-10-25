#!/usr/bin/env bash
# Is this repository set up to deploy? A fork whose profile is local-only (a `demo-`
# project, from `pnpm brand:init --local`) or has no "deploy" section has no cloud yet, so
# Deploy skips every job with a notice instead of failing on every merge to main
# (docs/specs/2026-10-25-local-first-adoption.md, L4). A broken luminova.json or missing
# profile is not "not set up": it fails loudly.
#
# Prints `ready=true|false` and, when false, `reason=<one line>`, for $GITHUB_OUTPUT.
# With a git ref, judges the files as they were at that commit: Deploy uses it to tell a
# first deploy (the last one ran before setup, so it skipped) from a later one.
# Usage: deploy-ready.sh [repo-root] [git-ref]
set -euo pipefail

root="${1:-.}"
ref="${2:-}"

# Prints a repo file, from the working tree or from $ref; fails when it does not exist.
read_file() {
  if [ -n "$ref" ]; then
    git -C "$root" show "$ref:$1" 2>/dev/null
  else
    cat "$root/$1" 2>/dev/null
  fi
}

if ! config=$(read_file luminova.json); then
  echo "deploy-ready: luminova.json is missing; it names the profile to deploy" >&2
  exit 1
fi
profile=$(jq -r '.profile // empty' <<<"$config")
if ! [[ "$profile" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "deploy-ready: luminova.json \"profile\" must be a folder name under brand/" >&2
  exit 1
fi
if ! brand=$(read_file "brand/$profile/brand.json"); then
  echo "deploy-ready: brand/$profile/brand.json is missing" >&2
  exit 1
fi

project=$(jq -r '.firebase.projectId // empty' <<<"$brand")
if [[ "$project" == demo-* ]]; then
  echo "ready=false"
  echo "reason=profile \"$profile\" is local-only (project $project). To go live: pnpm brand:init --connect, then pnpm brand:provision (docs/adopting.md steps 6 to 12)."
elif ! jq -e '(.deploy.workloadIdentityProvider // "") != "" and (.deploy.serviceAccount // "") != ""' <<<"$brand" >/dev/null; then
  echo "ready=false"
  echo "reason=brand/$profile/brand.json has no \"deploy\" section, so CD cannot sign in yet. pnpm brand:provision shows it (step 2)."
else
  echo "ready=true"
fi
