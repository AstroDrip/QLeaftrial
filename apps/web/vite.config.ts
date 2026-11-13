import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  // MapLibre loads its worker from a file next to its own module; serving the package as-is keeps that file in reach.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: {
    rollupOptions: {
      output: {
        // Shared framework code in one long-cached chunk; pages are split by route. The map libraries are only used
        // by the checkout location step and admin order locations, so they stay in their own lazily loaded chunks.
        manualChunks: (id) => (id.includes("/node_modules/") && !/\/node_modules\/(maplibre-gl|pmtiles|@protomaps)\//.test(id) ? "vendor" : undefined),
      },
    },
  },
  test: {
    environment: "jsdom",
    // Typing-driven UI tests take ~1s alone but can pass 5s when every file runs at once.
    testTimeout: 15_000,
    setupFiles: "./src/test/setup.ts",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
