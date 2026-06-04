/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "SuperApp",
        short_name: "SuperApp",
        description: "Household tools — workout, groceries, finance, bakjes — in one PWA",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor code so the shell loads a small core and big libs are
        // cached independently. Per-app code is already lazy-loaded via routes.
        // Only peel off libraries the shell always needs. Everything else
        // (firebase, recharts, ...) is left to Rollup's automatic splitting so
        // it stays inside the lazy per-app chunk that imports it.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@supabase")) return "supabase";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("react-router")
          )
            return "react";
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
