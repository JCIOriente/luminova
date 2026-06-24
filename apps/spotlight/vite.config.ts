import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { imagetools } from "vite-imagetools";

// Preload the above-the-fold latin Plus Jakarta Sans woff2 so the browser fetches
// it before CSS parse/layout (kills the swap delay on hero text). The emitted name
// is content-hashed, so resolve it from the build bundle rather than hardcoding.
function preloadJakartaLatin(): Plugin {
  return {
    name: "preload-jakarta-latin",
    apply: "build",
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
                href: `/${fileName}`,
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
});
