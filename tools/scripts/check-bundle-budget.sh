#!/usr/bin/env bash
# Bundle budget gate. Compares each app's initial `index-*` chunk (gzip transfer
# size) against the budgets documented in docs/performance.md §2. Exits non-zero
# on any breach so CI fails. Run AFTER the frontends are built (dist/ present).
#
# Scope: this gate covers the INITIAL `index` JS/CSS chunks only. The per-route
# chunk budget (≤40 kB gz, docs/performance.md §2) is NOT enforced here — route
# splitting makes the chunk set dynamic; watch it via the bundle-budget-watcher
# subagent until a per-route check is wired.
set -euo pipefail

fail=0

# check <label> <glob> <budget_kb>
check() {
  local label="$1" glob="$2" budget_kb="$3"
  # shellcheck disable=SC2086 # word-split the glob on purpose to count matches
  local matches=( $glob )
  if [ ! -e "${matches[0]}" ]; then
    echo "MISSING  $label — no file matched $glob (was the app built?)"
    fail=1
    return
  fi
  if [ "${#matches[@]}" -gt 1 ]; then
    echo "AMBIGUOUS $label — ${#matches[@]} files matched $glob: ${matches[*]}"
    echo "          expected exactly one entry chunk; refusing to guess."
    fail=1
    return
  fi
  local f="${matches[0]}"
  local gz budget kb
  gz=$(gzip -c "$f" | wc -c | tr -d ' ')
  budget=$((budget_kb * 1024))
  kb=$(( (gz + 1023) / 1024 ))
  if [ "$gz" -gt "$budget" ]; then
    echo "OVER     $label — ${kb} kB gz > ${budget_kb} kB budget  ($(basename "$f"))"
    fail=1
  else
    echo "ok       $label — ${kb} kB gz <= ${budget_kb} kB  ($(basename "$f"))"
  fi
}

# Budgets: docs/performance.md §2 (gzip).
check "spotlight index JS"  "apps/spotlight/dist/assets/index-*.js"  100
check "spotlight index CSS" "apps/spotlight/dist/assets/index-*.css" 15
check "backstage index JS"  "apps/backstage/dist/assets/index-*.js"  115
check "backstage index CSS" "apps/backstage/dist/assets/index-*.css" 15

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Bundle budget breached. Either trim the chunk or, if deliberate, raise the"
  echo "budget in docs/performance.md §2 and note it in the PR (see the perf guardrails)."
fi
exit $fail
