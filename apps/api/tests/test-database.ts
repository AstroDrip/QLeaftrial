import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_FILE, TEST_DATABASE_URL } from "./test-database-path";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));

function prisma(args: string[], input?: string): string {
  return execFileSync(process.execPath, ["scripts/prisma.mjs", ...args], { cwd: apiRoot, input, encoding: "utf8" });
}

// Rebuilds an empty test database from the current schema before every run.
export default function setup(): void {
  rmSync(TEST_DATABASE_FILE, { force: true });
  rmSync(`${TEST_DATABASE_FILE}-journal`, { force: true });
  const sql = prisma(["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"]);
  prisma(["db", "execute", "--url", TEST_DATABASE_URL, "--stdin"], sql);
}
