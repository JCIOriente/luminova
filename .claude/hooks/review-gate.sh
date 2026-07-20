#!/usr/bin/env bash
# PreToolUse(Bash) — review hard gate before `gh pr create`.
#
# Scope: whatever the rubric (.claude/review-routing.json) marks `gate: "hard"`.
# The gate itself knows nothing about which reviews those are — it asks the
# router and quotes the matched rules' own `why` back to the user. Everything
# else the router mandates is enforced by the CLAUDE.md "Review routing"
# contract, not by exit 2: hard-gating quality skills makes the agent thrash
# stamping trailers on trivial diffs, and a gate that gets routed around is worse
# than an honest advisory.
#
# Evidence: a commit trailer in range — key names come from the rubric
# (`trailerKey` + `legacyTrailerKeys`), currently
#     Reviews: <sha> security-review,code-review,simplify      (current)
#     Security-Reviewed: <sha>                                 (legacy, == security-review)
# accepted only while FRESH — the sha must be an ancestor of HEAD and no file in
# that review's scope may have changed after it. Freshness re-runs the router
# over `<sha>..HEAD`, so the gate and the advisory checklist share one definition
# of what is sensitive.
#
# Producer side: feature-flow phase 3 routes, reviews, and stamps the token set.
set -uo pipefail

input=$(cat)
. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"

# Fast path: this hook fires on EVERY Bash call. Skip the node spawn unless the
# raw payload could possibly be the command. Matching on `create` alone is
# deliberately LOOSER than the authoritative regex below: the old `gh pr create`
# substring prefilter was STRICTER than the regex it guarded, so `gh  pr create`
# (two spaces) or a tab skipped the gate entirely — a prefilter must never be
# able to reject something the real check would have blocked.
case "$input" in
  *create*) ;;
  *) exit 0 ;;
esac

hook_is_pr_create "$(hook_cmd "$input")" || exit 0

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

# A classifier failure must BLOCK, never wave the PR through. Without this, any
# throw in review-route.mjs — an unknown pathSet, malformed rubric JSON, a bad
# regex, the file missing — produced an empty `owed` and silently disabled the
# gate. And since the rubric is itself hard-gated, a PR that breaks the rubric
# would have turned off its own gate. A broken control is not a passing control.
if ! owed=$(hook_route_tokens "$base...HEAD" --gate-only); then
  echo "review-gate: BLOCKED — the review router failed to classify this diff." >&2
  echo "The rubric or the evaluator is broken, so no review requirement could be" >&2
  echo "determined. Fix .claude/review-routing.json / review-route.mjs, then retry:" >&2
  echo "  .claude/hooks/route.sh" >&2
  exit 2
fi

# Nothing in the hard class touched — gate does not apply.
[ -z "$owed" ] && exit 0

# Candidate stamps as `<sha> <token,token,...>`, one per line, gathered over the
# rubric's trailer keys. The legacy single-purpose key carries no token list, so
# its value is normalized into the same shape by appending the token it means.
stamps=""
first=1
while IFS= read -r key; do
  [ -z "$key" ] && continue
  values=$(git log "$base"..HEAD --format="%(trailers:key=$key,valueonly)" 2>/dev/null |
    grep -v '^[[:space:]]*$' || true)
  [ -z "$values" ] && { first=0; continue; }
  if [ "$first" = 1 ]; then
    stamps="$stamps$values
"
  else
    # Legacy keys predate multi-token stamps: `<sha>` alone means security-review.
    stamps="$stamps$(printf '%s\n' "$values" | sed 's/[[:space:]]*$/ security-review/')
"
  fi
  first=0
done <<< "$(hook_trailer_keys)"

# One router run per candidate stamp (not per token x stamp): a stamp's residual
# is the set of hard reviews owed again for what landed after it, so every token
# it covers is decided by that single evaluation.
covered=""
while IFS= read -r stamp; do
  [ -z "$stamp" ] && continue
  sha=$(printf '%s' "${stamp%% *}" | tr 'A-Z' 'a-z')
  tokens=${stamp#* }
  # Only honor a literal object id. Hex shape alone is not enough: `git rev-parse`
  # resolves NAMES too, so a tag or branch called `deadbeef` pointing at HEAD
  # would self-certify the whole branch. Require the stamp to be an abbreviation
  # of the commit it resolves to — a ref name is not a prefix of its own sha.
  printf '%s' "$sha" | grep -qE '^[0-9a-f]{7,40}$' || continue
  rsha=$(git rev-parse --verify --quiet "${sha}^{commit}" 2>/dev/null || echo "")
  [ -z "$rsha" ] && continue
  case "$rsha" in "$sha"*) ;; *) continue ;; esac
  git merge-base --is-ancestor "$rsha" HEAD 2>/dev/null || continue
  # A failed residual computation must not mark anything covered (fail closed).
  residual=$(hook_route_tokens "$rsha..HEAD" --gate-only) || continue
  while IFS= read -r token; do
    [ -z "$token" ] && continue
    printf '%s\n' "$residual" | grep -qx "$token" && continue
    covered="$covered $token"
    # Accept `a,b`, `a, b` and `a b` alike — a human copying the token set with
    # spaces was silently blocked with no explanation.
  done <<< "$(printf '%s' "$tokens" | tr ',' ' ' | tr -s ' ' '\n')"
done <<< "$stamps"

unmet=""
while IFS= read -r token; do
  [ -z "$token" ] && continue
  printf '%s ' "$covered" | grep -q " $token " || unmet="$unmet $token"
done <<< "$owed"

[ -z "$unmet" ] && exit 0

head=$(git rev-parse --short HEAD 2>/dev/null || echo HEAD)
csv=$(printf '%s' "${unmet# }" | tr ' ' ',')
trailer=$(hook_trailer_keys | head -1)
echo "review-gate: BLOCKED — this branch owes a review with no fresh stamp: $csv" >&2
echo "" >&2
hook_route "$base...HEAD" --format text >&2 2>/dev/null
echo "" >&2
echo "Run the blocked review(s) on the branch diff, then stamp the reviewed sha:" >&2
echo "  git commit --allow-empty -m 'chore: reviews' -m '$trailer: $head $csv'" >&2
echo "A stamp is honored only while no file in that review's scope changes after its sha." >&2
exit 2
