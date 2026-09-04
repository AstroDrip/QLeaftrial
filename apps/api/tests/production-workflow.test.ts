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
const deploymentEnvironmentScript = fileURLToPath(
  new URL("../../../scripts/verify-vercel-env.mjs", import.meta.url),
);

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

function verifyDeploymentEnvironment(
  overrides: Record<string, string | undefined>,
) {
  const environment = { ...process.env };
  delete environment.QLEAVES_DATABASE_PROVIDER;
  delete environment.DATABASE_URL;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[key];
    else environment[key] = value;
  }

  return runCommand(process.execPath, [deploymentEnvironmentScript], {
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    env: environment,
  });
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

  it("accepts a complete Vercel PostgreSQL runtime configuration", async () => {
    const result = await verifyDeploymentEnvironment({
      QLEAVES_DATABASE_PROVIDER: "postgresql",
      DATABASE_URL: postgresqlUrl,
    });

    expect(result.stdout).toContain("Vercel runtime environment check passed");
  });

  it("rejects a deployment without the explicit PostgreSQL provider", async () => {
    await expect(
      verifyDeploymentEnvironment({ DATABASE_URL: postgresqlUrl }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "QLEAVES_DATABASE_PROVIDER must be set to postgresql",
      ),
    });
  });

  it("rejects a deployment without a PostgreSQL database URL", async () => {
    await expect(
      verifyDeploymentEnvironment({
        QLEAVES_DATABASE_PROVIDER: "postgresql",
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("DATABASE_URL must be set"),
    });
  });

  it("rejects a non-PostgreSQL database URL", async () => {
    await expect(
      verifyDeploymentEnvironment({
        QLEAVES_DATABASE_PROVIDER: "postgresql",
        DATABASE_URL: "file:./dev.db",
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("DATABASE_URL must use postgresql://"),
    });
  });
});
