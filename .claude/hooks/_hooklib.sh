#!/usr/bin/env bash
# Shared hook helpers. Sourced by the hooks in this dir — NOT a hook itself
# (underscore-prefixed, never registered in settings.json).

# _hook_json <dotted.key.path> <raw-json>
# Read <raw-json> and print the value at <dotted.key.path>; print nothing on
# parse error, a missing key, or a nullish value. The accumulate/parse/try-catch
# scaffold lives here once — callers supply only the key path. A key path, not a
# JS expression: a hook must never eval a string. Each caller still gets its OWN
# node pass; folding several field reads into one was rejected as newline/NUL-split
# fragile.
_hook_json() {
  printf '%s' "$2" |
    node -e 'let s="";const k=process.argv[1].split(".");process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=k.reduce((o,p)=>(o==null?o:o[p]),JSON.parse(s));process.stdout.write(v==null?"":String(v))}catch{process.stdout.write("")}})' "$1"
}

# hook_cmd <raw-hook-input-json>
# Echo the payload's `.tool_input.command` string (empty on parse error / absent).
hook_cmd() {
  _hook_json 'tool_input.command' "$1"
}

# hook_is_pr_create <command-string>
# True when the command runs `gh pr create` in COMMAND POSITION — start of line
# or after a shell separator — so a harmless `echo "gh pr create"` does not trip
# a hook. Shared so the advisory router and the hard gate can never disagree
# about what counts as opening a PR (they did: one had the strict form, its twin
# used a loose substring match).
hook_is_pr_create() {
  # Strip quoted segments first: `git commit -m 'docs: ... gh pr create ...'`
  # merely MENTIONS the command, and matching it blocked ordinary checkpoint
  # commits with a PR-gate message (and made the advisory hook announce a PR that
  # was never opened — fabricated state fed to the model). The real command is
  # never itself quoted, so `gh pr create --title "x"` still matches.
  printf '%s' "$1" |
    sed "s/'[^']*'//g; s/\"[^\"]*\"//g" |
    grep -qE '(^|[[:space:]]|[;&|(])gh[[:space:]]+pr[[:space:]]+create([[:space:];&|)]|$)'
}

# hook_pr_head_branch <command-string>
# Echo the value of `gh pr create`'s --head/-H flag, empty when absent. That flag
# opens a PR for an arbitrary pushed branch, so the gate must not assume the diff
# it evaluated (HEAD of the current tree) is the diff being proposed.
hook_pr_head_branch() {
  printf '%s' "$1" |
    grep -oE '(^|[[:space:]])(--head|-H)([= ]|[[:space:]]+)[^[:space:]]+' |
    tail -1 |
    sed -E 's/.*(--head|-H)([= ]|[[:space:]]+)//; s/^["'"'"']//; s/["'"'"']$//'
}

# hook_tree_root <raw-hook-input-json>
# Echo the git worktree root of the tree a hook should operate on.
#
# The hook payload's `.cwd` is the real working directory the tool command runs
# in — including a git worktree — so it, not CLAUDE_PROJECT_DIR, is authoritative.
# CLAUDE_PROJECT_DIR points at the PRIMARY checkout, which under this repo's
# mandatory worktree-first workflow is almost never the tree being committed /
# diffed and may sit on another branch; targeting it makes a hook format, stage,
# or inspect the WRONG tree. So we deliberately never fall back to it. We resolve
# `.cwd` to its git toplevel (subdir-safe) and, when that is unusable, use the
# hook's own cwd (`.`) — which branch-guard.sh proves already tracks the worktree.
hook_tree_root() {
  local cwd
  cwd=$(_hook_json 'cwd' "$1")
  git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${cwd:-.}"
}

# hook_enter_tree <raw-hook-input-json>
# cd into hook_tree_root, silently. Returns cd's status so each caller chooses
# its own failure handling (default: `|| exit 0`).
hook_enter_tree() {
  cd "$(hook_tree_root "$1")" 2>/dev/null
}

# hook_default_branch
# Echo the repo's default branch. Resolved from origin/HEAD rather than assumed:
# this repo carries a stale origin/master ref, and assuming it yields a bogus
# merge-base and therefore a garbage diff range.
hook_default_branch() {
  local d
  d=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
  printf '%s' "${d:-main}"
}

# hook_merge_base
# Echo the merge-base of HEAD and the default branch; empty when undeterminable
# (callers must treat empty as "range unknown" and skip rather than false-gate).
hook_merge_base() {
  local d
  d=$(hook_default_branch)
  git merge-base HEAD "origin/$d" 2>/dev/null || git merge-base HEAD "$d" 2>/dev/null || printf ''
}

# hook_route <git-diff-range> [classifier-args...]
# Run the deterministic review router (review-route.mjs, rubric in
# .claude/review-routing.json) over the numstat of the given range. The rubric is
# the single source of truth for which paths demand which review — hooks must
# call this instead of carrying their own path regexes, which is how the old
# post-pr-create / security-review-gate path sets came to be copy-pasted twins.
hook_route() {
  local range="$1"
  shift
  # core.quotePath=false: with quoting on, `apps/beacon/src/índex.ts` arrives as
  # `"apps/beacon/src/\303\255ndex.ts"` and the leading quote defeats every
  # start-anchored rule — the gate then sees no sensitive file and exits 0.
  # review-route.mjs unquotes defensively too (this flag still quotes paths with
  # `"`, `\`, or control chars).
  git -c core.quotePath=false diff --numstat "$range" 2>/dev/null |
    node "$(dirname "${BASH_SOURCE[0]}")/review-route.mjs" "$@"
}

# hook_route_tokens <git-diff-range> [classifier-args...]
# Echo one mandated review token per line for the range. Uses the classifier's
# own `--format tokens` rather than piping JSON through a second node process.
hook_route_tokens() {
  hook_route "$@" --format tokens
}

# hook_trailer_keys
# Echo the rubric's review trailer keys, current first, one per line — so the
# gate reads the trailer vocabulary from the rubric instead of hardcoding names
# the rubric only pretends to own.
hook_trailer_keys() {
  node "$(dirname "${BASH_SOURCE[0]}")/review-route.mjs" --trailer-keys
}
