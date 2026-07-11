#!/usr/bin/env bash
# Stop — checkpoint nudge. Prints working-tree status; warns if >10 files dirty.
# Read-only, never blocks.
set -uo pipefail

input=$(cat)

# Report the worktree the session is working in, not the primary checkout.
. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"
hook_enter_tree "$input" || exit 0

status=$(git status -sb 2>/dev/null || echo "")
count=$(printf '%s\n' "$status" | grep -cE '^[ MARCD?]{2} ' || true)

echo "── working tree ──"
printf '%s\n' "$status"
if [ "${count:-0}" -gt 10 ]; then
  echo "⚠ $count uncommitted files (>10) — consider a checkpoint commit."
fi
exit 0
