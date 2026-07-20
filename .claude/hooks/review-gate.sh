#!/usr/bin/env bash
# PreToolUse(Bash) — review hard gate before `gh pr create`.
#
# Scope: the HARD class in .claude/review-routing.json (today: /security-review —
# auth / firestore.rules / apps/beacon / repositories). Everything else the router
# mandates is enforced by the CLAUDE.md "Review routing" contract, not by exit 2:
# hard-gating quality skills makes the agent thrash stamping trailers on trivial
# diffs, and a gate that gets routed around is worse than an honest advisory.
#
# Evidence: a commit trailer in range, either
#     Reviews: <sha> security-review,code-review,simplify      (current)
#     Security-Reviewed: <sha>                                 (legacy, == security-review)
# accepted only while FRESH — the sha must be an ancestor of HEAD and no file in
# that review's scope may have changed after it. Freshness is decided by re-running
# the router over `<sha>..HEAD`, so the gate and the advisory checklist share one
# definition of "security-sensitive" instead of two regexes that can drift.
#
# Producer side: feature-flow phase 3 stamps once /security-review runs clean.
set -uo pipefail

input=$(cat)
. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"

# Fast path: this hook fires on EVERY Bash call. Skip the node spawn unless the
# raw payload even mentions the command. (Authoritative parse re-checks below.)
case "$input" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

cmd=$(hook_cmd "$input")

# Authoritative filter: match `gh pr create` in command position (start of line
# or after a shell separator) so a harmless `echo "gh pr create"` doesn't block.
if ! printf '%s' "$cmd" | grep -qE '(^|[[:space:]]|[;&|(])gh[[:space:]]+pr[[:space:]]+create([[:space:];&|)]|$)'; then
  exit 0
fi

# Diff the tree the command actually runs in — a worktree-based `gh pr create`
# must be diffed against its OWN branch, never the primary checkout (which may
# sit on another branch, silently inspecting the wrong tree and skipping the gate).
hook_enter_tree "$input" \
  || { echo "review-gate: WARN — could not enter a working dir; gate skipped." >&2; exit 0; }

base=$(hook_merge_base)

# Range undeterminable — don't block (avoid a false gate); warn so it's visible.
if [ -z "$base" ]; then
  echo "review-gate: WARN — could not resolve merge-base vs default branch; gate skipped." >&2
  exit 0
fi

owed=$(hook_tokens "$(hook_route "$base...HEAD" --gate-only)")

# Nothing in the hard class touched — gate does not apply.
[ -z "$owed" ] && exit 0

# Candidate stamps, one `<sha> <token,token,...>` per line. The legacy
# single-purpose trailer is normalized into the same shape.
stamps=$(
  {
    git log "$base"..HEAD --format='%(trailers:key=Reviews,valueonly)' 2>/dev/null
    git log "$base"..HEAD --format='%(trailers:key=Security-Reviewed,valueonly)' 2>/dev/null |
      grep -v '^[[:space:]]*$' | sed 's/[[:space:]]*$/ security-review/'
  } | grep -v '^[[:space:]]*$' || true
)

unmet=""
while IFS= read -r token; do
  [ -z "$token" ] && continue
  covered=""
  while IFS= read -r stamp; do
    [ -z "$stamp" ] && continue
    sha=${stamp%% *}
    tokens=${stamp#* }
    # Only honor a literal sha — a symbolic ref like HEAD/main/<tag> would
    # trivially self-certify (always an ancestor of HEAD, empty diff after it).
    printf '%s' "$sha" | grep -qiE '^[0-9a-f]{7,40}$' || continue
    printf '%s' ",${tokens// /}," | grep -q ",$token," || continue
    rsha=$(git rev-parse --verify --quiet "${sha}^{commit}" 2>/dev/null || echo "")
    [ -z "$rsha" ] && continue
    git merge-base --is-ancestor "$rsha" HEAD 2>/dev/null || continue
    # Stale if the same review is owed again by what landed after the stamp.
    if ! hook_tokens "$(hook_route "$rsha..HEAD" --gate-only)" | grep -qx "$token"; then
      covered=1
      break
    fi
  done <<< "$stamps"
  [ -n "$covered" ] || unmet="$unmet $token"
done <<< "$owed"

[ -z "$unmet" ] && exit 0

head=$(git rev-parse --short HEAD 2>/dev/null || echo HEAD)
csv=$(printf '%s' "${unmet# }" | tr ' ' ',')
echo "review-gate: BLOCKED — security-sensitive paths changed without a fresh review: $csv" >&2
echo "" >&2
hook_route "$base...HEAD" --format text >&2 2>/dev/null
echo "" >&2
echo "Run the blocked review(s) on the branch diff, then stamp the reviewed sha:" >&2
echo "  git commit --allow-empty -m 'chore: reviews' -m 'Reviews: $head $csv'" >&2
echo "A stamp is honored only while no file in that review's scope changes after its sha." >&2
exit 2
