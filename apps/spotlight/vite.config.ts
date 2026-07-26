import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { imagetools } from "vite-imagetools";
import { VitePWA } from "vite-plugin-pwa";

// Preload the above-the-fold latin Plus Jakarta Sans woff2 so the browser fetches
// it before CSS parse/layout (kills the swap delay on hero text). The emitted name
// is content-hashed, so resolve it from the build bundle rather than hardcoding.
function preloadJakartaLatin(): Plugin {
  let base = "/";
  return {
    name: "preload-jakarta-latin",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const fileName = ctx.bundle
          ? Object.keys(ctx.bundle).find((f) => /plus-jakarta-sans-latin-.*\.woff2$/.test(f))
          : undefined;
        if (!fileName) return html;
        return {
          html,
          tags: [
            {
              tag: "link",
              attrs: {
                rel: "preload",
                as: "font",
                type: "font/woff2",
                href: `${base}${fileName}`,
                crossorigin: "",
              },
              injectTo: "head",
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: "\\.(test|spec)\\.",
    }),
    react(),
    tailwindcss(),
    imagetools({
      include: /packages\/ui\/src\/assets\/logo-.*\.png$/,
      defaultDirectives: new URLSearchParams({ format: "webp" }),
      namedExports: false,
    }),
    preloadJakartaLatin(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon-16.png", "favicon-32.png", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "JCI Oriente",
        short_name: "JCI Oriente",
        description: "Junior Chamber International Oriente",
        lang: "es",
        theme_color: "#0097D7",
        background_color: "#0097D7",
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
      // App-shell precache ONLY. No runtimeCaching for firestore/googleapis by
      // design — the lite reads must stay live. png excluded from globPatterns
      // so the crawler-only OG share images (og-image-v2.png, og-linktree.png)
      // are not precached — nothing in the app shell loads them.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        // Pin the site-data layer (firebase lite SDK + App Check + @luminova/firebase
        // glue + the site-config firestore reader) into its own chunk. useSiteConfig
        // now dynamic-imports site-config-firestore inside its effect, so this chunk
        // loads async after paint — off the critical path — rather than eager. The
        // explicit group keeps rolldown from inlining firebase back into index on
        // small graph changes. Match `site-config-firestore` specifically, NOT the
        // whole /site-config/ folder: `use-site-config` (the hook) and `defaults`
        // are rendered synchronously by the eager shell, so they must stay in index —
        // grouping them here would drag firebase back into the eager set. Likewise
        // `cached-resource` (the tiny sync cache reader) stays in index.
        //
        // The firebase/messaging SDK and our @luminova/firebase/messaging wrapper
        // (packages/firebase/src/messaging.ts) must NOT ride in `site-data` — that
        // chunk is pulled by `Footer`→`useSiteConfig` on every page, so folding
        // messaging in ships the ~5 kB gz SDK to every visitor. The generic
        // `firebase` match below would otherwise capture it, so return early
        // (undefined) for every messaging id: that lets rolldown colocate it with
        // its ONLY importer — the dynamic import("./push-registration") from the
        // push opt-in — landing it in the lazy `push-registration` chunk instead.
        // Do NOT force it into a named chunk: forcing `@firebase/messaging` into its
        // own chunk makes rolldown relocate the SHARED firebase-app/installations
        // core into that chunk too, which `site-data` then imports back — an eager
        // reverse edge that loads messaging's chunk on every page anyway.
        manualChunks(id) {
          if (
            id.includes("@firebase/messaging") ||
            id.includes("firebase/messaging") ||
            id.includes("firebase/src/messaging") ||
            id.includes("firebase/dist/messaging")
          ) {
            return;
          }
          if (id.includes("firebase") || id.includes("site-config-firestore")) {
            return "site-data";
          }
        },
      },
    },
  },
});
