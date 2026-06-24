import { defineConfig } from "vitest/config";

// Fast unit suite. Emulator-backed tests (*.emulator.test.ts) are excluded here
// and run separately via `pnpm test:emulator` under the Firestore emulator lock.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.emulator.test.ts"],
  },
});
