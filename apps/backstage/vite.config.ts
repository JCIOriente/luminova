import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.(test|spec)\\.",
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "JCI Oriente",
        short_name: "JCI Oriente",
        description: "Junior Chamber International Oriente",
        lang: "es",
        theme_color: "#0A2A43",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
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
  server: { port: 5174 },
  preview: { port: 4174 },
});
