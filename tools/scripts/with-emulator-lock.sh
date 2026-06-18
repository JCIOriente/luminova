#!/usr/bin/env bash
# Serialize Firebase emulator runs across the whole machine so concurrent rules
# suites (turbo runs every package `ci` at once) and parallel git worktrees never
# collide on the fixed emulator ports (firestore 4010, the Emulator Hub 4400, …).
#
# Usage: with-emulator-lock.sh <command> [args...]
# Runs <command> while holding an exclusive lock; releases it on exit.
#
# Why a lock and not per-run dynamic ports: `firebase emulators:exec` binds many
# ports (firestore + hub + logging) from firebase.json; assigning a free one to
# each is fragile. One-at-a-time is simpler and fully removes the race. The rules
# suites are fast, so the serialization cost is negligible.
#
# Portable (no flock — absent on macOS): atomic `mkdir` lock with stale-holder
# reclaim by PID.
set -uo pipefail

LOCK="${EMULATOR_LOCK_DIR:-${TMPDIR:-/tmp}/luminova-emulator.lock}"
TIMEOUT="${EMULATOR_LOCK_TIMEOUT:-300}"

waited=0
until mkdir "$LOCK" 2>/dev/null; do
  # Reclaim a lock whose holder process is gone (crash / kill).
  if [ -f "$LOCK/pid" ]; then
    holder=$(cat "$LOCK/pid" 2>/dev/null || echo "")
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      rm -rf "$LOCK" 2>/dev/null || true
      continue
    fi
  fi
  if [ "$waited" -ge "$TIMEOUT" ]; then
    echo "with-emulator-lock: timed out after ${TIMEOUT}s waiting for $LOCK" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK" 2>/dev/null || true' EXIT

"$@"
