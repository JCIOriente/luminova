#!/usr/bin/env bash
# Route the CURRENT branch diff — the pre-PR entry point for a human or the agent.
#
#   .claude/hooks/route.sh                # human-readable checklist (default)
#   .claude/hooks/route.sh --format tokens
#
# Not registered in settings.json: this is the "route first" mechanism the
# contract requires, callable before a PR exists. review-router.sh runs the same
# routing automatically after `gh pr create`, which is too late to act cheaply.
# Uses hook_merge_base so the documented path resolves the default branch the
# same way the hooks do, instead of assuming origin/main.
set -uo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/_hooklib.sh"

base=$(hook_merge_base)
if [ -z "$base" ]; then
  echo "route: could not resolve a merge-base against the default branch." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  set -- --format text
fi

hook_route "$base...HEAD" "$@"
