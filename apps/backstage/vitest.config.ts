import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { brandPlugin } from "@luminova/brand/vite";

export default defineConfig({
  plugins: [brandPlugin({ app: "backstage", profile: "example" }), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // A console line still flushing when a worker closes rejects Vitest's own RPC call and
    // fails a run whose tests all passed. Only that race is ignored, never a real rejection.
    onUnhandledError: ({ name, message }) =>
      !(name === "EnvironmentTeardownError" && message?.includes("onUserConsoleLog")),
  },
});
