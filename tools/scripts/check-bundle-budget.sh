#!/usr/bin/env sh
# Bundle budget gate. Compares each app's EAGER JS (gzip transfer size) against
# the budgets documented in docs/performance.md section 2. Exits non-zero on any
# breach so CI fails. Run AFTER the frontends are built (dist/ present).
#
# "Eager JS" = the entry <script src> PLUS every <link rel="modulepreload" href>
# the built dist/index.html declares, summed (gzip). That is the true JS the
# browser fetches before first paint. The old gate measured only `index-*.js`,
# so it was blind to chunks rolldown hoists OUT of index and modulepreloads
# separately (e.g. the `site-data` firebase chunk, or a mislabeled `icons-*.js`
# that actually holds @firebase/*). We sum by what index.html preloads — not by
# filename — so a rolldown chunk misname does not fool the gate.
#
# Scope: this gate covers the INITIAL eager JS + the eager `index` CSS chunk.
# The per-route chunk budget (<=40 kB gz, docs/performance.md section 2) is NOT
# enforced here — route splitting makes the chunk set dynamic; watch it via the
# bundle-budget-watcher subagent until a per-route check is wired.
set -eu

fail=0

# gzip byte size of a file (gzip -c level, matches CI's `gzip`).
gzip_size() {
  gzip -c "$1" | wc -c | tr -d ' '
}

# check_eager_js <label> <dist_dir> <budget_kb>
# Sums the gzip size of the entry script + every modulepreload declared in
# <dist_dir>/index.html and compares against the budget.
check_eager_js() {
  label="$1" dist="$2" budget_kb="$3"
  html="$dist/index.html"
  if [ ! -f "$html" ]; then
    echo "MISSING  $label — no built index.html at $html (was the app built?)"
    fail=1
    return
  fi
  # Entry <script src> + <link rel=modulepreload href>, .js only, one path/line.
  refs=$(grep -oE '(src|href)="[^"]+\.js"' "$html" | sed -E 's/^[a-z]+="([^"]+)"$/\1/')
  if [ -z "$refs" ]; then
    echo "MISSING  $label — no eager JS (<script>/modulepreload) found in $html"
    fail=1
    return
  fi
  total=0
  for ref in $refs; do
    # ref is dist-root-relative (leading slash), e.g. /assets/index-abc.js
    f="$dist/$(printf '%s' "$ref" | sed 's#^/##')"
    if [ ! -f "$f" ]; then
      echo "MISSING  $label — index.html references $ref but $f is absent"
      fail=1
      continue
    fi
    gz=$(gzip_size "$f")
    total=$((total + gz))
  done
  budget=$((budget_kb * 1024))
  kb=$(((total + 1023) / 1024))
  if [ "$total" -gt "$budget" ]; then
    echo "OVER     $label — ${kb} kB gz > ${budget_kb} kB budget"
    fail=1
  else
    echo "ok       $label — ${kb} kB gz <= ${budget_kb} kB"
  fi
}

# check_css <label> <glob> <budget_kb> — the eager index CSS chunk.
check_css() {
  label="$1" glob="$2" budget_kb="$3"
  # shellcheck disable=SC2086 # word-split the glob on purpose to count matches
  set -- $glob
  if [ ! -e "$1" ]; then
    echo "MISSING  $label — no file matched $glob (was the app built?)"
    fail=1
    return
  fi
  if [ "$#" -gt 1 ]; then
    echo "AMBIGUOUS $label — $# files matched $glob: $*"
    echo "          expected exactly one entry chunk; refusing to guess."
    fail=1
    return
  fi
  gz=$(gzip_size "$1")
  budget=$((budget_kb * 1024))
  kb=$(((gz + 1023) / 1024))
  if [ "$gz" -gt "$budget" ]; then
    echo "OVER     $label — ${kb} kB gz > ${budget_kb} kB budget  ($(basename "$1"))"
    fail=1
  else
    echo "ok       $label — ${kb} kB gz <= ${budget_kb} kB  ($(basename "$1"))"
  fi
}

# Budgets: docs/performance.md section 2 (gzip). Eager JS = entry + modulepreloads.
check_eager_js "spotlight eager JS" "apps/spotlight/dist" 108
# Bumped 15→17 for the /about "El Masthead" Directiva section (real permanent
# leadership page section, token-based hand-authored gradients/clip layout; +1.1 kB
# gz). Conscious budget decision per docs/performance.md; still leaves ~1 kB headroom.
check_css      "spotlight index CSS" "apps/spotlight/dist/assets/index-*.css" 17
# Backstage eager budget re-baselined by PR2: the full Firebase SDK was split so
# firestore/storage/functions leave the login-path graph (they now load only in
# lazy feature route chunks), and the `/me` route's stray non-Route export — which
# had disabled its auto-code-splitting and dragged all member/initiative hooks
# (→ firestore) + zod doc-schemas eager — was extracted. Honest eager total fell
# from ~279 kB to ~157 kB; budget set at 162 kB (small headroom).
check_eager_js "backstage eager JS" "apps/backstage/dist" 162
check_css      "backstage index CSS" "apps/backstage/dist/assets/index-*.css" 15

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Bundle budget breached. Either trim the eager set or, if deliberate, raise"
  echo "the budget in docs/performance.md section 2 and note it in the PR (see the"
  echo "perf guardrails)."
fi
exit $fail
