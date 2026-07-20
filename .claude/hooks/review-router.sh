#!/usr/bin/env bash
# PostToolUse(Bash) — after `gh pr create`, print the EXACT review set this diff
# demands, computed from .claude/review-routing.json. Non-blocking; feeds Claude
# context. Supersedes post-pr-create.sh, whose routing was a hand-maintained
# regex twin of the gate's.
#
# The hook DECIDES and REMINDS; the model runs the skills. A shell cannot invoke
# a Claude skill, so enforcement lives in review-gate.sh (hard, security class
# only) plus the CLAUDE.md "Review routing" contract (binding, all classes).
# Route BEFORE the PR with .claude/hooks/route.sh — this is the safety net.
set -uo pipefail

input=$(cat)
. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"

# Fast path: this hook fires on EVERY Bash call. Skip the node spawn unless the
# raw payload even mentions the command. (Authoritative parse re-checks below.)
case "$input" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

hook_is_pr_create "$(hook_cmd "$input")" || exit 0

# Diff the tree the PR was opened from (its worktree), not the primary checkout.
hook_enter_tree "$input" || exit 0

base=$(hook_merge_base)
if [ -n "$base" ]; then
  range="$base...HEAD"
else
  range="HEAD~1"
fi

routing=$(hook_route "$range" --format text 2>/dev/null || echo "")

msg="PR opened — it is now ready for review. Run \`pnpm pr-tests\` locally now."
if [ -n "$routing" ]; then
  msg="$msg

$routing"
fi

node -e 'let m=process.argv[1];process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:m}}))' "$msg"
exit 0
