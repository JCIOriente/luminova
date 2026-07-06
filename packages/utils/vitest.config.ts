import { defineConfig } from "vitest/config";

// Pin the test timezone to Bolivia (UTC-4) so the suite runs as a non-UTC viewer
// on any host/CI runner. Set at the config layer (before test modules load) so
// even module-scope formatter construction sees it — an in-file process.env.TZ
// assignment runs too late (ESM hoists imports above it). This is what makes the
// UTC-pin regression guards real instead of coincidentally green on a UTC runner.
export default defineConfig({
  test: {
    env: { TZ: "America/La_Paz" },
  },
});
