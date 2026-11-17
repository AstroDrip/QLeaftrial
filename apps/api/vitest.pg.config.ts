import { defineConfig } from "vitest/config";

// Transaction, concurrency and idempotency tests against a real PostgreSQL (SQLite runs writes one at a time, so it
// cannot show what happens when orders really collide). Run with: npm run test:pg -w @qleaves/api
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/pg/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["./tests/pg/global-setup.ts"],
    setupFiles: ["./tests/pg/use-pg-database.ts"],
  },
});
