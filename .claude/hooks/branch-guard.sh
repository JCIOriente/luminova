#!/usr/bin/env bash
# PreToolUse(Bash) — branch guard before `git commit`.
# Hard-blocks (exit 2) commits on main/master; warns (non-blocking) on branch
# names outside feat/|fix/|chore/|migration/. Wired BEFORE pre-commit.sh so its
# message leads. The main/master block is unconditional — it does NOT honor
# --no-verify, since the accidental commit on main is exactly the case this
# guards against.
set -uo pipefail

input=$(cat)

# Fast path: this hook fires on EVERY Bash call. Skip the node spawn entirely
# unless the raw payload even mentions a commit. (May false-positive on a
# command that merely contains the string — the authoritative parse below
# re-checks.)
case "$input" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})')

# Authoritative filter: match `git commit` only in command position (start of
# line, or after a shell separator) so we don't block/warn on a harmless
# `echo "git commit"` or `grep "git commit"` that merely contains the string.
if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|[;&|(])git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Unresolved / detached HEAD — let other gates decide, don't block.
if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  exit 0
fi

case "$branch" in
  main|master)
    echo "branch-guard: BLOCKED — refusing to commit on '$branch'." >&2
    echo "Create a feature branch first (in a worktree, ideally):" >&2
    echo "  git worktree add -b feat/<slug> .worktrees/<slug> main" >&2
    echo "or  git switch -c feat/<slug>" >&2
    echo "Then re-run the commit. (This block ignores --no-verify by design.)" >&2
    exit 2
    ;;
esac

if ! printf '%s' "$branch" | grep -qE '^(feat|fix|chore|migration)/'; then
  echo "branch-guard: WARN — branch '$branch' is not feat/|fix/|chore/|migration/." >&2
  echo "branch-guard: commit allowed, but the repo convention is a scoped prefix." >&2
fi

exit 0
