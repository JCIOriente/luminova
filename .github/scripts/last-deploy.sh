#!/usr/bin/env bash
# The commit Deploy last shipped to <project>, or nothing when it never did (a first deploy:
# Deploy then ships every surface).
#
# Reads `gh run list --workflow Deploy --status success --json displayTitle` on stdin, newest
# first. deploy.yml titles a run "Deploy to <project> at <sha>" only when it could deploy
# every surface changed up to <sha>: a manual run of surface `all` on main, or a run after a
# green CI of a push to main, with both required repository variables set. Every other run
# gets a title this never matches: a partial dispatch ("Deploy <project>: hosting only")
# would hide the other surfaces' undeployed changes, a skipped run ("Deploy (skipped)",
# "Deploy (not set up)") deployed nothing, and a run of another project is not this one's.
# The sha comes from the title, not the run's headSha: a workflow_run's head is the default
# branch's tip when it started, not the commit CI tested.
# Unreadable input prints nothing: the safe answer is to ship every surface.
# Usage: last-deploy.sh <project>
set -euo pipefail

project="$1"
sha=$(jq -r --arg prefix "Deploy to $project at " \
  'if type == "array" then
     first(.[] | objects | .displayTitle | strings | select(startswith($prefix))
           | ltrimstr($prefix) | select(test("\\A[0-9a-f]{40}\\z"))) // empty
   else empty end' \
  2>/dev/null || true)
if [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then echo "$sha"; fi
