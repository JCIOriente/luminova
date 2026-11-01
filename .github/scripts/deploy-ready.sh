#!/usr/bin/env bash
# Is this repository set up to deploy? A fork whose profile is local-only (a `demo-`
# project, from `pnpm brand:init` without a Firebase project) or has no [deploy] table has no cloud yet, so
# Deploy skips every job with a notice instead of failing on every merge to main
# (docs/specs/2026-10-25-local-first-adoption.md, L4). A brand/ folder with no single
# profile to select is not "not set up": it fails loudly.
#
# Twin of the TypeScript rules in packages/brand/src (discoverProfile in load-profile.ts,
# LoadedProfile.localOnly, missingDeployProblem in release.ts), kept in bash and awk
# because Deploy's filter job runs before any pnpm install. Change both together.
# A profile is a folder with a brand.toml. A folder with only a brand.json is one too, read
# with jq: the base tree of the first deploy after brand.toml landed still holds those.
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
# dot-folders count. A ref is read NUL-separated, so git never quotes a name. A name with a
# newline splits in two and is dropped; no slug can hold one, and the build stops on it.
folders() {
  if [ -n "$ref" ]; then
    git -C "$root" ls-tree -z "$ref" brand/ 2>/dev/null |
      while IFS= read -r -d '' entry; do
        case "$entry" in 040000" tree "*) path=${entry#*$'\t'} && printf '%s\n' "${path#brand/}" ;; esac
      done
  elif [ -d "$root/brand" ]; then
    for dir in "$root"/brand/* "$root"/brand/.[!.]* "$root"/brand/..?*; do
      if [ -d "$dir" ] && [ ! -L "$dir" ]; then printf '%s\n' "${dir##*/}"; fi
    done
  fi | LC_ALL=C sort
}

# Reads one value of a brand.toml on stdin: `toml_value "" project` for the top-level
# project, `toml_value deploy serviceAccount` for a key of the [deploy] table. Not a TOML
# parser; the narrow grammar it reads:
#   - a line `key = "value"` or `key = 'value'`: spaces around `=` optional, an optional
#     trailing `# comment`, CRLF accepted. The value holds no quote or escape (a project id,
#     a resource name and an email never do);
#   - a top-level key counts only before the first [table] header, and a table's key only
#     between its header (`[deploy]`, `[ deploy ]`, `[deploy] # note`) and the next header.
# A value written any other way (dotted keys, an inline table, a multi-line string) reads
# as absent, so a profile reads as not ready, never as ready by mistake.
toml_value() {
  awk -v want_table="$1" -v want_key="$2" -v sq="'" '
    { sub(/\r$/, "") }
    /^[ \t]*\[/ {
      header = $0
      sub(/#.*/, "", header)
      gsub(/[][ \t]/, "", header)
      table = header
      next
    }
    table == want_table && match($0, "^[ \t]*" want_key "[ \t]*=[ \t]*") {
      rest = substr($0, RLENGTH + 1)
      quote = substr(rest, 1, 1)
      if (quote != "\"" && quote != sq) next
      rest = substr(rest, 2)
      end = index(rest, quote)
      if (end == 0) next
      if (substr(rest, end + 1) !~ /^[ \t]*(#.*)?$/) next
      print substr(rest, 1, end - 1)
      exit
    }'
}

# The profile file of a folder: its brand.toml, else a brand.json; fails without either.
profile_file() {
  if read_file "brand/$1/brand.toml" >/dev/null; then
    echo brand.toml
  elif read_file "brand/$1/brand.json" >/dev/null; then
    echo brand.json
  else
    return 1
  fi
}

# The profile brand/ selects (spec docs/specs/2026-10-25-profile-discovery.md, P1): its one
# chapter profile (a folder with a brand.toml, not the example), else the example.
# `fixture` is the example's old name: a base tree from before brand/example/ still holds it
# beside jci-oriente, and must not look like two chapters (D12 in
# docs/specs/2026-10-29-brand-outside-repo.md; the removal PR drops it).
example=example
chapters=()
while IFS= read -r name; do
  case "$name" in "" | fixture | "$example") continue ;; esac
  if profile_file "$name" >/dev/null; then chapters+=("$name"); fi
done < <(folders)
if [ "${#chapters[@]}" -gt 1 ]; then
  list=$(printf ', %s' "${chapters[@]}")
  echo "deploy-ready: brand/ holds ${#chapters[@]} chapter profiles (${list:2}); a repository builds one" >&2
  exit 1
elif [ "${#chapters[@]}" -eq 1 ]; then
  profile=${chapters[0]}
elif profile_file "$example" >/dev/null; then
  profile=$example
else
  echo "deploy-ready: brand/ holds no profile (a folder with a brand.toml)" >&2
  exit 1
fi
if ! [[ "$profile" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "deploy-ready: brand/$profile/ must be named with lowercase letters, digits and hyphens" >&2
  exit 1
fi
file=$(profile_file "$profile")
brand=$(read_file "brand/$profile/$file")

if [ "$file" = brand.toml ]; then
  project=$(toml_value "" project <<<"$brand")
  provider=$(toml_value deploy workloadIdentityProvider <<<"$brand")
  account=$(toml_value deploy serviceAccount <<<"$brand")
  missing="has no [deploy] table"
  unread='its project could not be read (a line project = "<id>" before the first [table])'
else
  # Only the base tree from before brand.toml holds a brand.json; the fork-CD PR drops this
  # branch and jq with it.
  project=$(jq -r '.firebase.projectId // empty' <<<"$brand")
  provider=$(jq -r '.deploy.workloadIdentityProvider // empty' <<<"$brand")
  account=$(jq -r '.deploy.serviceAccount // empty' <<<"$brand")
  missing='has no "deploy" section'
  unread='its firebase.projectId could not be read'
fi
echo "project=$project"
if [[ "$project" == demo-* ]]; then
  echo "ready=false"
  echo "reason=profile \"$profile\" is local-only (project $project). To go live: create a Firebase project, connect it with pnpm brand:init, then pnpm brand:provision (docs/adopting.md steps 6 to 12)."
elif [ -z "$project" ]; then
  echo "ready=false"
  echo "reason=brand/$profile/$file: $unread, so Deploy cannot tell where to deploy."
elif [ -z "$provider" ] || [ -z "$account" ]; then
  echo "ready=false"
  echo "reason=brand/$profile/$file $missing, so CD cannot sign in yet. pnpm brand:provision shows it (step 2)."
else
  echo "ready=true"
fi
