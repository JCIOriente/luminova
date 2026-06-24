#!/usr/bin/env bash
# Retry Firebase emulator BOOT failures only — never the test itself.
#
# Usage: with-emulator-boot-retry.sh firebase emulators:exec [opts] "<test cmd>"
# Composes INSIDE with-emulator-lock.sh, so the machine-wide lock is held across
# every attempt (we never release+reacquire between retries).
#
# Why this exists: `firebase emulators:exec` couples boot + test in one process,
# and the emulator's flaky surface is environmental (JVM cold start, port bind,
# first-run JAR download) — NOT the assertions. A blanket retry would re-run a
# genuinely-failing test until it happened to pass, masking exactly the kind of
# intermittent concurrency-race bug the beacon suite exists to catch. That is
# worse than no retry.
#
# How boot is told apart from test: `emulators:exec` runs the inner command ONLY
# after the emulator is up, so we prepend `touch <marker>` to it. After a run:
#   - marker ABSENT  -> the emulator never reached the command => boot/setup
#     failed => retry with backoff.
#   - marker PRESENT -> the test ran (pass or fail) => propagate its exit code
#     immediately and NEVER retry. A mid-test emulator crash counts as a test
#     failure on purpose; retrying it could hide a race.
set -uo pipefail

[ "$#" -gt 0 ] || {
  echo "with-emulator-boot-retry: usage: with-emulator-boot-retry <emulators:exec command> \"<test cmd>\"" >&2
  exit 2
}

ATTEMPTS="${EMULATOR_BOOT_ATTEMPTS:-3}"
BACKOFF="${EMULATOR_BOOT_BACKOFF:-2}"
# A non-positive / non-numeric budget must NEVER mean "run nothing and pass" —
# this gates CI. Fall back to the defaults rather than skipping the loop.
[[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || ATTEMPTS=3
[[ "$BACKOFF" =~ ^[0-9]+$ ]] || BACKOFF=2
MARKER="$(mktemp -u "${TMPDIR:-/tmp}/emu-boot-marker.XXXXXX")"
cleanup() { rm -f "$MARKER" 2>/dev/null; return 0; }
# Clean up on normal exit; on INT/TERM (CI cancel, job timeout) clean up AND
# re-raise so the wrapper actually dies instead of resuming the retry loop and
# relaunching the emulator (mirrors with-emulator-lock.sh).
trap cleanup EXIT
trap 'cleanup; trap - INT;  kill -INT  $$' INT
trap 'cleanup; trap - TERM; kill -TERM $$' TERM

# The inner test command is the last argument; everything before it boots the
# emulator and then runs that command. Re-attach it with the boot marker.
inner="${!#}"
cmd=( "${@:1:$#-1}" "touch '$MARKER'; $inner" )

status=0
attempt=1
backoff="$BACKOFF"
while [ "$attempt" -le "$ATTEMPTS" ]; do
  rm -f "$MARKER" 2>/dev/null
  "${cmd[@]}"
  status=$?

  if [ "$status" -eq 0 ]; then
    exit 0
  fi

  if [ -e "$MARKER" ]; then
    echo "with-emulator-boot-retry: emulator booted; the test failed (exit $status) — not a boot flake, not retrying." >&2
    exit "$status"
  fi

  echo "with-emulator-boot-retry: emulator boot/setup failed before the test (attempt ${attempt}/${ATTEMPTS}, exit ${status})." >&2
  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    [ "$backoff" -gt 0 ] && sleep "$backoff"
    backoff=$((backoff * 2))
  fi
  attempt=$((attempt + 1))
done

echo "with-emulator-boot-retry: emulator failed to boot after ${ATTEMPTS} attempts." >&2
exit "$status"
