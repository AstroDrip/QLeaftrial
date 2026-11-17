import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    // The catalogue-import tests take 3-5 s each; the default 5 s limit made them fail on a busy machine.
    testTimeout: 20_000,
    // tests/pg runs separately against a real PostgreSQL (vitest.pg.config.ts, npm run test:pg).
    exclude: ["tests/pg/**", "node_modules/**"],
    globalSetup: ["./tests/test-database.ts"],
    setupFiles: ["./tests/use-test-database.ts"],
  },
});
