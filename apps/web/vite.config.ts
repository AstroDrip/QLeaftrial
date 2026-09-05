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
    // Three.js is isolated to the decorative homepage particle field. Its
    // minified ESM bundle is ~501 kB, so keep the warning threshold narrowly
    // above that measured vendor chunk rather than hiding larger regressions.
    chunkSizeWarningLimit: 510,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "zustand"],
          anime: ["animejs"],
          three: ["three"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
