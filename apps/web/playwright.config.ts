import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a production build of the storefront, served by Vite's preview server: the same files
// customers get, with no on-demand compiling (the development server was slow and unreliable for a long suite).
// API calls are proxied to localhost:3000 as in development; most tests serve their own fixed API answers instead.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One test at a time against one server: steadier timings for tests that measure motion.
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["iPhone 13"],
    browserName: "chromium",
    // The Google Chrome installed on this machine, so no separate browser download is needed.
    channel: "chrome",
  },
  webServer: {
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
