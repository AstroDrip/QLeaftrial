import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./tests/test-database.ts"],
    setupFiles: ["./tests/use-test-database.ts"],
  },
});
