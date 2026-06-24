import { defineConfig } from "vitest/config";

// Emulator-backed integration tests only. Invoked by `pnpm test:emulator`, which
// boots the Firestore emulator via `firebase emulators:exec` (sets
// FIRESTORE_EMULATOR_HOST) behind the machine-wide emulator lock.
export default defineConfig({
  test: {
    include: ["**/*.emulator.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Serial: each test clears shared collections in beforeEach.
    fileParallelism: false,
  },
});
