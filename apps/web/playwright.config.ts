import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a production build of the storefront, served by Vite's preview server: the same files
// customers get, with no on-demand compiling (the development server was slow and unreliable for a long suite).
// API calls go to the test API (apps/api/scripts/e2e-server.ts) on port 3100; some tests serve fixed answers instead.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One test at a time against one server: steadier timings for tests that measure motion.
  workers: 1,
  retries: 0,
  // Every spec on a phone; the customer and admin journeys on a desktop screen too.
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"] } },
    { name: "desktop", testMatch: /journeys\.spec\.ts/, use: { viewport: { width: 1280, height: 900 } } },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    // The Google Chrome installed on this machine, so no separate browser download is needed.
    channel: "chrome",
    // Software WebGL, so the checkout map draws in a headless browser.
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: [
    {
      // The test API: its own throwaway database, fake email and photo storage, nothing reaches the outside world
      // (apps/api/scripts/e2e-server.ts). Never the production database.
      command: "npx tsx scripts/e2e-server.ts",
      cwd: "../api",
      url: "http://127.0.0.1:3100/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NODE_USE_SYSTEM_CA: "1" },
    },
    {
      command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 240_000,
      env: { QLEAVES_API_PROXY: "http://127.0.0.1:3100" },
    },
  ],
});
