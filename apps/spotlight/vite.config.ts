import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { imagetools } from "vite-imagetools";

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
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
});
