import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  PWA_INCLUDE_ASSETS,
  brandPlugin,
  pwaManifest,
  resolveBrandBuild,
} from "@luminova/brand/vite";

export default defineConfig(({ command, mode }) => {
  const build = resolveBrandBuild({
    app: "backstage",
    command,
    mode,
    envDir: fileURLToPath(new URL(".", import.meta.url)),
  });
  return {
    plugins: [
      brandPlugin({ app: "backstage", build }),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routeFileIgnorePattern: "\\.(test|spec)\\.",
      }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        includeAssets: PWA_INCLUDE_ASSETS,
        manifest: pwaManifest(build.profile.brand, "backstage"),
        // App-shell precache ONLY. No runtimeCaching by design: this is an authed
        // admin app — caching Firestore/Auth/Storage responses would leak data.
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,woff2}"],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          navigateFallbackDenylist: [/^\/__\/auth\//],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
