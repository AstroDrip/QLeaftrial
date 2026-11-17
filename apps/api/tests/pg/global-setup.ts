// Starts a real, throwaway PostgreSQL for the PostgreSQL test run (npm run test:pg -w @qleaves/api), applies the
// repository's production migrations to it exactly as production gets them (prisma migrate deploy), and removes it
// afterwards. Nothing here can reach the production database: the server listens on localhost only, on its own port,
// with its own data folder in the system temp directory.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

export const PG_TEST_PORT = 54329;
export const PG_TEST_DATABASE = "qleaves_test";
export const PG_TEST_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_TEST_PORT}/${PG_TEST_DATABASE}`;

const apiRoot = fileURLToPath(new URL("../..", import.meta.url));

export default async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "qleaves-pg-test-"));
  const server = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    user: "postgres",
    password: "postgres",
    port: PG_TEST_PORT,
    persistent: false,
    // Same text encoding as Supabase (UTF-8), not the Windows code page: Arabic names must be stored as they are.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => undefined,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase(PG_TEST_DATABASE);
  execFileSync(process.execPath, ["scripts/prisma.mjs", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: PG_TEST_URL, DIRECT_URL: PG_TEST_URL },
    stdio: "pipe",
  });
  return async () => {
    await server.stop();
    rmSync(directory, { recursive: true, force: true });
  };
}
