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
  build: {
    rollupOptions: {
      output: {
        // Shared framework code in one long-cached chunk; pages are split by route.
        // ogl (WebGL) is only used by the lazily loaded hero carousel, so it stays in that chunk.
        manualChunks: (id) => (id.includes("/node_modules/") && !id.includes("/node_modules/ogl/") ? "vendor" : undefined),
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
