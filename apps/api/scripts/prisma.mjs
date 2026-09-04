import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const environment = { ...process.env };

if (process.platform === "win32") {
  environment.PRISMA_QUERY_ENGINE_LIBRARY = require.resolve(
    "@prisma/engines/query_engine-windows.dll.node",
  );
  environment.PRISMA_SCHEMA_ENGINE_BINARY = require.resolve(
    "@prisma/engines/schema-engine-windows.exe",
  );
}

const prismaCli = require.resolve("prisma/build/index.js");
const prismaArguments = process.argv.slice(2);
const productionSchema = prismaArguments.some(
  (argument, index) =>
    argument === "--schema" && prismaArguments[index + 1]?.endsWith("schema.postgresql.prisma"),
);

if (
  productionSchema &&
  (prismaArguments[0] === "generate" || prismaArguments[0] === "validate")
) {
  environment.DATABASE_URL ??=
    "postgresql://qleaves:qleaves@localhost:6543/qleaves?pgbouncer=true&connection_limit=1";
  environment.DIRECT_URL ??=
    "postgresql://qleaves:qleaves@localhost:5432/qleaves";
}

if (prismaArguments[0] === "migrate" && prismaArguments[1] === "dev") {
  const databasePath = fileURLToPath(new URL("../prisma/dev.db", import.meta.url));
  await mkdir(dirname(databasePath), { recursive: true });
  const databaseFile = await open(databasePath, "a");
  await databaseFile.close();
}

const child = spawn(process.execPath, [prismaCli, ...prismaArguments], {
  env: environment,
  stdio: "inherit",
});

child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
