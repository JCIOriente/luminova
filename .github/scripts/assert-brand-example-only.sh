#!/usr/bin/env bash
# A chapter's brand lives in its bucket, never in git (docs/specs/2026-10-29-brand-outside-repo.md).
# Under brand/, a change may add or edit only the example and the two shared files; deleting
# anything passes, so a chapter folder can leave the repository. .gitignore keeps the rest out
# of `git add`; this check catches a forced add, in upstream and in every fork.
#
# Judges every commit since the merge base with <base-ref>: CI passes the PR's base sha, or
# the push's `before`. Runs before any install: git and bash only.
# Usage: assert-brand-example-only.sh <base-ref>
set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: assert-brand-example-only.sh <base-ref>" >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null; then
  echo "assert-brand-example-only: \"$base\" is not a commit in this clone" >&2
  exit 2
fi

# brand/jci-oriente/brand.toml is a temporary allowance: the brand.toml PR converts JCI
# Oriente's committed profile in place, and the JCI Oriente removal PR deletes that folder
# together with this allowance.
allowed() {
  case "$1" in
    brand/example/* | brand/brand.schema.json | brand/bucket-lifecycle.json | brand/jci-oriente/brand.toml) return 0 ;;
    *) return 1 ;;
  esac
}

offending=()
# NUL-separated, so git never quotes a name: "<status>\0<path>\0", and a rename or copy
# carries its source before the destination, which is the path it adds.
while IFS= read -r -d '' status; do
  IFS= read -r -d '' path
  case "$status" in
    R* | C*) IFS= read -r -d '' path ;;
  esac
  if ! allowed "$path"; then offending+=("$path"); fi
done < <(git diff --name-status -z --diff-filter=d "${base}...HEAD" -- brand/)

if [ "${#offending[@]}" -gt 0 ]; then
  for path in "${offending[@]}"; do
    echo "assert-brand-example-only: $path is added or changed outside brand/example/" >&2
  done
  echo "assert-brand-example-only: a chapter's brand lives in its bucket, never in git. Remove these files from the change (pnpm brand:push uploads them)." >&2
  exit 1
fi
echo "assert-brand-example-only: ok, brand/ changes touch only brand/example/ and the shared files"
