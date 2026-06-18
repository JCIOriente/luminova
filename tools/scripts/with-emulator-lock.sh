#!/usr/bin/env bash
# Serialize Firebase emulator runs machine-wide so concurrent rules suites
# (turbo runs every package `ci` at once) and parallel git worktrees never
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
# The lock is an atomically-created directory ($LOCK); the holder's PID lives in
# $LOCK/pid for liveness checks. Portable (no flock — absent on macOS).
#
# Not handled by design: PID reuse (a recycled PID reads as "alive" so a crashed
# holder isn't reclaimed until the timeout). Astronomically unlikely in a 5-min
# window and the blast radius is one spurious CI timeout, not a double-acquire.
set -uo pipefail

[ "$#" -gt 0 ] || {
  echo "with-emulator-lock: usage: with-emulator-lock <command> [args...]" >&2
  exit 2
}

LOCK="${EMULATOR_LOCK_DIR:-${TMPDIR:-/tmp}/luminova-emulator.lock}"
TIMEOUT="${EMULATOR_LOCK_TIMEOUT:-300}"

acquired=""
release() { [ -n "$acquired" ] && rm -rf "$LOCK" 2>/dev/null; return 0; }

waited=0
while :; do
  if mkdir "$LOCK" 2>/dev/null; then
    acquired=1
    # Install cleanup the instant we own the dir — before the pid write or any
    # other step can fail — so a death here can't leak the lock. Forward INT/TERM
    # (bash does NOT run the EXIT trap on an untrapped SIGTERM) so a cancelled CI
    # job releases the lock and still reports the right termination status.
    trap 'release' EXIT
    trap 'release; trap - INT;  kill -INT  $$' INT
    trap 'release; trap - TERM; kill -TERM $$' TERM
    echo $$ > "$LOCK/pid"
    break
  fi

  # Acquire failed. Decide whether the holder is stale and, if so, reclaim it.
  # Serialize reclaim with a second dir so two waiters can't both rm the lock and
  # then both re-acquire (a TOCTOU double-acquire), and RE-VERIFY liveness under
  # that reclaim lock so a holder that became live meanwhile is never reaped.
  if mkdir "$LOCK.reap" 2>/dev/null; then
    holder=$(cat "$LOCK/pid" 2>/dev/null)
    stale=""
    if [ -n "$holder" ]; then
      kill -0 "$holder" 2>/dev/null || stale=1
    else
      # No pid file: either the lock was just released, or the holder died in the
      # tiny mkdir→pid window. A healthy holder writes pid within milliseconds,
      # so if it is still absent after a beat, treat the lock as abandoned.
      sleep 1
      [ -e "$LOCK" ] && [ ! -f "$LOCK/pid" ] && stale=1
    fi
    [ -n "$stale" ] && rm -rf "$LOCK" 2>/dev/null
    rmdir "$LOCK.reap" 2>/dev/null || true
    [ -n "$stale" ] && continue
  fi

  if [ "$waited" -ge "$TIMEOUT" ]; then
    echo "with-emulator-lock: timed out after ${TIMEOUT}s waiting for $LOCK" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

"$@"
status=$?
exit "$status"
