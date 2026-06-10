#!/usr/bin/env bash
# Starts the Firebase emulators for local development with persisted state.
# Wrapped (not a raw `firebase emulators:start`) so the three recurring gotchas
# are handled automatically:
#   1. The Firestore emulator needs Java. Homebrew's OpenJDK is keg-only, so it
#      isn't on PATH by default — add it best-effort (no-op on Linux/CI).
#   2. The functions emulator silently runs a stale beacon `dist` — rebuild first.
#   3. State is wiped on every restart unless --import/--export-on-exit is used —
#      persist it under ./emulator-data so the seeded Admin survives restarts.
set -euo pipefail

if [ -d /opt/homebrew/opt/openjdk/bin ]; then
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  export JAVA_HOME="/opt/homebrew/opt/openjdk"
fi

# Fresh functions dist so the emulator never loads stale triggers.
pnpm --filter beacon build

# Persist state across restarts (so the seeded Admin survives). Only --import when
# a prior export exists — on the very first run there is no export yet, and
# pointing --import at an empty dir makes the emulators fail to start.
# (Two branches, not an array, to stay safe on macOS's stock bash 3.2 + `set -u`.)
if [ -f emulator-data/firebase-export-metadata.json ]; then
  exec firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
else
  exec firebase emulators:start --export-on-exit=./emulator-data
fi
