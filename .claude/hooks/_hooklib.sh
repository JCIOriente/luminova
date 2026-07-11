#!/usr/bin/env bash
# Shared hook helpers. Sourced by the hooks in this dir — NOT a hook itself
# (underscore-prefixed, never registered in settings.json).

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
