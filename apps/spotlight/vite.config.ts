import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { imagetools } from "vite-imagetools";

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
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    rollupOptions: {
      output: {
        // Pin the site-data layer (firebase lite SDK + App Check + @luminova/firebase
        // glue + the site-config SWR cache) into its own chunk. The shell (Footer →
        // useSiteConfig) loads it eagerly regardless, so a dedicated file keeps it out
        // of the index budget — without an explicit group rolldown's heuristic inlines
        // it into index on small graph changes.
        manualChunks(id) {
          if (
            id.includes("firebase") ||
            id.includes("/site-config/") ||
            id.includes("cached-resource")
          ) {
            return "site-data";
          }
        },
      },
    },
  },
});
