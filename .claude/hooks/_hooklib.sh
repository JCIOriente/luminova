#!/usr/bin/env bash
# Shared hook helpers. Sourced by the hooks in this dir — NOT a hook itself
# (underscore-prefixed, never registered in settings.json).

# hook_cmd <raw-hook-input-json>
# Echo the payload's `.tool_input.command` string (empty on parse error / absent).
# Kept separate from hook_tree_root's `.cwd` parse on purpose: folding both into
# one node pass was rejected as newline/NUL-split fragile.
hook_cmd() {
  printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})'
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
  cwd=$(printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).cwd||"")}catch{process.stdout.write("")}})')
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
  git diff --numstat "$range" 2>/dev/null |
    node "$(dirname "${BASH_SOURCE[0]}")/review-route.mjs" "$@"
}

# hook_tokens <router-json>
# Echo one review token per line from a `hook_route --format json` payload.
hook_tokens() {
  printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).reviews.map(r=>r.token).join("\n"))}catch{}})'
}
