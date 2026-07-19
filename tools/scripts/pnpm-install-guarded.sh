#!/usr/bin/env bash
# Wraps `pnpm install --frozen-lockfile` so an un-allowlisted native build script
# fails as an explicit, actionable CI step instead of an opaque abort.
#
# pnpm blocks a dependency's install/build script unless it is listed in
# `allowBuilds` (pnpm-workspace.yaml) — a supply-chain safety default. When an
# un-listed one appears (e.g. a transitive `sharp`), a strict frozen install
# EXITS 1 at the very first step with `ERR_PNPM_IGNORED_BUILDS`, before lint/test.
# On a PR that coincides with a wedged merge ref that reads as a hung
# "Expected — waiting for status" check (real case: PR #175). This wrapper
# surfaces the exact packages + remediation up front so the failure is obvious.
# See docs/ci-cd.md (Troubleshooting: pnpm ignored build scripts).
set -uo pipefail

log=$(mktemp)
pnpm install --frozen-lockfile "$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}

if [ "$status" -eq 0 ]; then
  rm -f "$log"
  exit 0
fi

if grep -q 'ERR_PNPM_IGNORED_BUILDS' "$log"; then
  pkgs=$(grep -o 'Ignored build scripts:.*' "$log" | head -1 | sed 's/Ignored build scripts: *//')
  echo "::error::Un-allowlisted native build script(s): ${pkgs}"
  {
    echo ""
    echo "A dependency ships a native install/build script that pnpm blocks by default."
    echo "Add each package (bare name, drop the @version) to allowBuilds in pnpm-workspace.yaml:"
    echo ""
    echo "    allowBuilds:"
    for p in ${pkgs//,/ }; do
      echo "${p%@*}"
    done | sort -u | sed 's/^/      /; s/$/: true/'
    echo ""
    echo "Then commit the updated pnpm-workspace.yaml. See docs/ci-cd.md (Troubleshooting)."
  } >&2
  rm -f "$log"
  exit 1
fi

rm -f "$log"
exit "$status"
