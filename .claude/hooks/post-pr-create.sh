#!/usr/bin/env bash
# PostToolUse(Bash) — after `gh pr create`, route security-sensitive diffs to
# /security-review and remind to run pr-tests. Non-blocking; feeds Claude context.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})')

case "$cmd" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

base=$(git merge-base HEAD origin/master 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo "")
if [ -n "$base" ]; then
  diff=$(git diff --name-only "$base"...HEAD 2>/dev/null || echo "")
else
  diff=$(git diff --name-only HEAD~1 2>/dev/null || echo "")
fi

sensitive=$(printf '%s\n' "$diff" | grep -E 'apps/beacon/|firestore\.rules|_auth|_app\.tsx|repositories/|/functions/' || true)

msg="PR opened. Run \`pnpm pr-tests\` locally now."
if [ -n "$sensitive" ]; then
  list=$(printf '%s\n' "$sensitive" | sed 's/^/  - /')
  msg="$msg

SECURITY-SENSITIVE paths changed — run /security-review before merge:
$list"
fi

node -e 'let m=process.argv[1];process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:m}}))' "$msg"
exit 0
