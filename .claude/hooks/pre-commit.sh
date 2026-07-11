#!/usr/bin/env bash
# PreToolUse(Bash) — auto-format + lint/typecheck gate before `git commit`.
# Blocks (exit 2) only if checks still fail after auto-fix. Honors --no-verify.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch{process.stdout.write("")}})')

# Only act on git commit invocations.
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

# Respect explicit bypass.
if printf '%s' "$cmd" | grep -qE -- '(--no-verify|[[:space:]]-n([[:space:]]|$))'; then
  echo "pre-commit: --no-verify set — skipping format/lint gate (use sparingly)." >&2
  exit 0
fi

# Format/stage the tree the commit actually runs in — never the primary checkout.
. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"
cd "$(hook_tree_root "$input")" 2>/dev/null || exit 0

echo "pre-commit: auto-formatting…" >&2
pnpm run format:fix >/dev/null 2>&1 || true
git add -u >/dev/null 2>&1 || true

echo "pre-commit: lint + typecheck…" >&2
log=$(mktemp)
if ! pnpm exec turbo run lint typecheck >"$log" 2>&1; then
  echo "pre-commit: lint/typecheck FAILED — commit blocked. Last lines:" >&2
  tail -25 "$log" >&2
  rm -f "$log"
  exit 2
fi
rm -f "$log"

echo "pre-commit: staged changes —" >&2
git diff --cached --stat >&2
exit 0
