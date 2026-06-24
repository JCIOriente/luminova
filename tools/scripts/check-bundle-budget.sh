#!/usr/bin/env bash
# Bundle budget gate. Compares each app's initial `index-*` chunk (gzip transfer
# size) against the budgets documented in docs/performance.md §2. Exits non-zero
# on any breach so CI fails. Run AFTER the frontends are built (dist/ present).
set -euo pipefail

fail=0

# check <label> <glob> <budget_kb>
check() {
  local label="$1" glob="$2" budget_kb="$3"
  local f
  f=$(ls $glob 2>/dev/null | head -1 || true)
  if [ -z "$f" ]; then
    echo "MISSING  $label — no file matched $glob (was the app built?)"
    fail=1
    return
  fi
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
