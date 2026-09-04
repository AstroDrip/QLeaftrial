import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const runCommand = promisify(execFile);
const apiDirectory = fileURLToPath(new URL("..", import.meta.url));
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const postgresqlUrl = "postgresql://qleaves:qleaves@localhost:6543/qleaves?pgbouncer=true&connection_limit=1";
const directUrl = "postgresql://qleaves:qleaves@localhost:5432/qleaves";

function runProductionPrisma(script: string, arguments_: string[] = []) {
  return runCommand(process.execPath, [npmCli, "run", script, ...arguments_], {
    cwd: apiDirectory,
    env: { ...process.env, DATABASE_URL: postgresqlUrl, DIRECT_URL: directUrl },
  });
}

function selectPostgreSqlWithoutUrl() {
  const { DATABASE_URL: _databaseUrl, ...environment } = process.env;

  return runCommand(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      "import './src/lib/prisma.ts'",
    ],
    {
      cwd: apiDirectory,
      env: { ...environment, QLEAVES_DATABASE_PROVIDER: "postgresql" },
    },
  );
}

function selectProductionWithoutProvider() {
  const { QLEAVES_DATABASE_PROVIDER: _provider, ...environment } = process.env;

  return runCommand(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      "import './src/lib/prisma.ts'",
    ],
    {
      cwd: apiDirectory,
      env: {
        ...environment,
        NODE_ENV: "production",
        DATABASE_URL: postgresqlUrl,
        DIRECT_URL: directUrl,
      },
    },
  );
}



describe("production Prisma workflow", () => {
  it("generates and validates the PostgreSQL client without a live database", async () => {
    const generated = await runProductionPrisma("prisma:generate:production");
    const validated = await runProductionPrisma("prisma:validate:production");
    const deployment = await runProductionPrisma("prisma:deploy:production", ["--", "--help"]);

    expect(generated.stdout).toContain("schema.postgresql.prisma");
    expect(validated.stdout).toContain("is valid");
    expect(deployment.stdout).toContain("prisma db push");
  }, 30_000);

  it("requires a PostgreSQL URL before selecting the production client", async () => {
    await expect(selectPostgreSqlWithoutUrl()).rejects.toThrow(
      "DATABASE_URL is required for PostgreSQL runtime selection",
    );
  });



  it("requires an explicit PostgreSQL provider in production", async () => {
    await expect(selectProductionWithoutProvider()).rejects.toThrow(
      "QLEAVES_DATABASE_PROVIDER=postgresql is required in production",
    );
  });
});
