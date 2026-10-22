import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { brandPlugin } from "@luminova/brand/vite";

export default defineConfig({
  plugins: [brandPlugin({ app: "backstage", profile: "fixture" }), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
