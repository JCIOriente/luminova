#!/usr/bin/env bash
# Is this repository set up to deploy? A fork whose profile is local-only (a `demo-`
# project, from `pnpm brand:init --local`) or has no "deploy" section has no cloud yet, so
# Deploy skips every job with a notice instead of failing on every merge to main
# (docs/specs/2026-10-25-local-first-adoption.md, L4). A brand/ folder with no single
# profile to select is not "not set up": it fails loudly.
#
# Twin of the TypeScript rules in packages/brand/src (discoverProfile in load-profile.ts,
# LoadedProfile.localOnly, missingDeployProblem in release.ts), kept in bash and jq
# because Deploy's filter job runs before any pnpm install. Change both together.
#
# Prints `project=<id>`, `ready=true|false` and, when false, `reason=<one line>`, for
# $GITHUB_OUTPUT.
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

# Folder names under brand/, from the working tree or from $ref, one per line, sorted
# like the TypeScript twin. Like Node's Dirent.isDirectory(), a symlink is no folder, and
# dot-folders count. A ref is read NUL-separated, so git never quotes a name.
folders() {
  if [ -n "$ref" ]; then
    git -C "$root" ls-tree -z "$ref" brand/ 2>/dev/null |
      while IFS= read -r -d '' entry; do
        case "$entry" in *" tree "*) path=${entry#*$'\t'} && printf '%s\n' "${path#brand/}" ;; esac
      done
  elif [ -d "$root/brand" ]; then
    for dir in "$root"/brand/* "$root"/brand/.[!.]*; do
      if [ -d "$dir" ] && [ ! -L "$dir" ]; then printf '%s\n' "${dir##*/}"; fi
    done
  fi | LC_ALL=C sort
}

# The profile brand/ selects (spec docs/specs/2026-10-25-profile-discovery.md, P1): its one
# chapter profile (a folder with a brand.json, not the example or the fixture), else the
# example.
example=jci-oriente
chapters=()
while IFS= read -r name; do
  case "$name" in "" | fixture | "$example") continue ;; esac
  if read_file "brand/$name/brand.json" >/dev/null; then chapters+=("$name"); fi
done < <(folders)
if [ "${#chapters[@]}" -gt 1 ]; then
  list=$(printf ', %s' "${chapters[@]}")
  echo "deploy-ready: brand/ holds ${#chapters[@]} chapter profiles (${list:2}); a repository builds one" >&2
  exit 1
elif [ "${#chapters[@]}" -eq 1 ]; then
  profile=${chapters[0]}
elif read_file "brand/$example/brand.json" >/dev/null; then
  profile=$example
else
  echo "deploy-ready: brand/ holds no profile (a folder with a brand.json)" >&2
  exit 1
fi
if ! [[ "$profile" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "deploy-ready: brand/$profile/ must be named with lowercase letters, digits and hyphens" >&2
  exit 1
fi
brand=$(read_file "brand/$profile/brand.json")

project=$(jq -r '.firebase.projectId // empty' <<<"$brand")
echo "project=$project"
if [[ "$project" == demo-* ]]; then
  echo "ready=false"
  echo "reason=profile \"$profile\" is local-only (project $project). To go live: create a Firebase project, pnpm brand:init --connect, then pnpm brand:provision (docs/adopting.md steps 6 to 12)."
elif ! jq -e '(.deploy.workloadIdentityProvider // "") != "" and (.deploy.serviceAccount // "") != ""' <<<"$brand" >/dev/null; then
  echo "ready=false"
  echo "reason=brand/$profile/brand.json has no \"deploy\" section, so CD cannot sign in yet. pnpm brand:provision shows it (step 2)."
else
  echo "ready=true"
fi
