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
# The lock is a file ($LOCK) holding the holder's PID for liveness checks, created
# by bash itself: noclobber opens with O_EXCL, so exactly one contender wins. Do not
# use `mkdir` for this: uutils mkdir (the default on Ubuntu 26.04, 0.10.0) stats first
# and lets two concurrent callers both exit 0. Portable (no flock — absent on macOS).
#
# Not handled by design: PID reuse (a recycled PID reads as "alive" so a crashed
# holder isn't reclaimed until the timeout). Astronomically unlikely in a 5-min
# window and the blast radius is one spurious CI timeout, not a double-acquire.
set -uo pipefail

[ "$#" -gt 0 ] || {
  echo "with-emulator-lock: usage: with-emulator-lock <command> [args...]" >&2
  exit 2
}

# Namespace the default path per-uid so a co-tenant on a shared runner can't
# pre-create (and thus DoS or block reclaim of) another user's lock in /tmp.
LOCK="${EMULATOR_LOCK_FILE:-${TMPDIR:-/tmp}/luminova-emulator-$(id -u).lock}"
TIMEOUT="${EMULATOR_LOCK_TIMEOUT:-300}"

create_exclusive() { (set -C; echo $$ > "$1") 2>/dev/null; }

acquired=""
release() { [ -n "$acquired" ] && rm -rf "$LOCK" 2>/dev/null; return 0; }

waited=0
while :; do
  if create_exclusive "$LOCK"; then
    acquired=1
    # Install cleanup the instant we own the lock, so a death here can't leak it.
    # Forward INT/TERM (bash does NOT run the EXIT trap on an untrapped SIGTERM)
    # so a cancelled CI job releases the lock and still reports the right
    # termination status.
    trap 'release' EXIT
    trap 'release; trap - INT;  kill -INT  $$' INT
    trap 'release; trap - TERM; kill -TERM $$' TERM
    break
  fi

  # Acquire failed. Decide whether the holder is stale and, if so, reclaim it.
  # Serialize reclaim with a second file so two waiters can't both rm the lock and
  # then both re-acquire (a TOCTOU double-acquire), and RE-VERIFY liveness under
  # that reclaim lock so a holder that became live meanwhile is never reaped.
  if create_exclusive "$LOCK.reap"; then
    holder=$(cat "$LOCK" 2>/dev/null)
    stale=""
    if [ -n "$holder" ]; then
      kill -0 "$holder" 2>/dev/null || stale=1
    else
      # No pid: either the lock was just released, or the holder died between the
      # create and the write. A healthy holder writes within milliseconds, so if
      # it is still unreadable after a beat, treat the lock as abandoned. That also
      # clears a directory left by the old mkdir format, which cat cannot read.
      sleep 1
      [ -e "$LOCK" ] && [ -z "$(cat "$LOCK" 2>/dev/null)" ] && stale=1
    fi
    [ -n "$stale" ] && rm -rf "$LOCK" 2>/dev/null
    rm -f "$LOCK.reap"
    [ -n "$stale" ] && continue
  fi

  if [ "$waited" -ge "$TIMEOUT" ]; then
    # Self-heal a wedge: a reaper SIGKILL'd while holding $LOCK.reap leaves it
    # orphaned (its only cleanup is the rm above; no trap survives SIGKILL),
    # so reclaim can never run even though the holder is dead. Clear both files
    # once and retry — but ONLY when the holder is genuinely dead/absent. A LIVE
    # holder that legitimately ran past TIMEOUT must still time out; stealing its
    # lock would double-acquire.
    h=$(cat "$LOCK" 2>/dev/null)
    if [ -z "${retried:-}" ] && { [ -z "$h" ] || ! kill -0 "$h" 2>/dev/null; }; then
      retried=1
      rm -rf "$LOCK" "$LOCK.reap" 2>/dev/null
      waited=0
      continue
    fi
    echo "with-emulator-lock: timed out after ${TIMEOUT}s waiting for $LOCK" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done

"$@"
status=$?
exit "$status"
