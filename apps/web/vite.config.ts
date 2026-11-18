import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { isHomeBootstrap } from "../api/src/lib/home-bootstrap";

// Puts the homepage bootstrap inside index.html as a JSON data block (data, not script: it is never executed), so
// the homepage has its categories and first products with the page itself. Freshest source first: the file the
// build just cut from the database, then the committed fallback. A production build with neither fails, so a
// release can never ship without homepage data.
function homeBootstrap(): Plugin {
  const sources = ["./public/catalogue/home-bootstrap.json", "./bootstrap/home-fallback.json"].map((path) => fileURLToPath(new URL(path, import.meta.url)));
  let production = false;
  return {
    name: "qleaves-home-bootstrap",
    configResolved(config) { production = config.command === "build"; },
    transformIndexHtml() {
      for (const source of sources) {
        if (!existsSync(source)) continue;
        try {
          const parsed: unknown = JSON.parse(readFileSync(source, "utf8"));
          if (!isHomeBootstrap(parsed)) continue;
          // "<" is escaped so no product text can close the data block early.
          const json = JSON.stringify(parsed).replace(/</g, "\\u003c");
          return [{ tag: "script", attrs: { type: "application/json", id: "qleaves-home-bootstrap" }, children: json, injectTo: "head" }];
        } catch {
          // An unreadable file is skipped; the next source is tried.
        }
      }
      if (production) throw new Error("No valid homepage bootstrap: run the catalogue generation, or refresh apps/web/bootstrap/home-fallback.json (npm run home:fallback -w @qleaves/api)");
      return [];
    },
  };
}

// The two typefaces every page shows first (body text and headings, Latin script) are fetched alongside the
// stylesheet instead of after it, so text appears in its real face sooner. Their file names carry a build hash,
// so the links are written from the finished bundle.
function preloadFonts(): Plugin {
  const first = [/^assets\/archivo-latin-wght-normal-.+\.woff2$/, /^assets\/fraunces-latin-opsz-normal-.+\.woff2$/];
  return {
    name: "qleaves-preload-fonts",
    transformIndexHtml: {
      order: "post",
      handler(_html, context) {
        const files = Object.keys(context.bundle ?? {}).filter((file) => first.some((pattern) => pattern.test(file)));
        return files.map((file) => ({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${file}`, crossorigin: "" }, injectTo: "head" as const }));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), homeBootstrap(), preloadFonts()],
  server: {
    port: 5173,
    proxy: {
      // The browser journeys point this at their own test API (QLEAVES_API_PROXY, see playwright.config.ts).
      "/api": process.env.QLEAVES_API_PROXY || "http://localhost:3000",
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
