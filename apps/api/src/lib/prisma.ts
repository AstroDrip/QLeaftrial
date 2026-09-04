import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as PostgreSqlPrismaClient } from "../../generated/postgresql/index.js";
import { PrismaClient as SqlitePrismaClient } from "../../generated/sqlite/index.js";

if (process.platform === "win32" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const bundledEngine = resolve(
    process.cwd(),
    "../../node_modules/@prisma/engines/query_engine-windows.dll.node",
  );

  if (existsSync(bundledEngine)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = bundledEngine;
  }
}

type DatabaseProvider = "postgresql" | "sqlite";

type PrismaClient =
  | InstanceType<typeof PostgreSqlPrismaClient>
  | InstanceType<typeof SqlitePrismaClient>;

function databaseProvider(): DatabaseProvider {
  const explicitProvider = process.env.QLEAVES_DATABASE_PROVIDER;

  const provider =
    explicitProvider ??
    (process.env.NODE_ENV === "production" ? "postgresql" : "sqlite");

  if (provider !== "postgresql" && provider !== "sqlite") {
    throw new Error(`Unsupported QLEAVES_DATABASE_PROVIDER: ${provider}`);
  }

  if (
    process.env.NODE_ENV === "production" &&
    explicitProvider !== "postgresql"
  ) {
    throw new Error(
      "QLEAVES_DATABASE_PROVIDER=postgresql is required in production",
    );
  }

  if (provider === "postgresql" && !process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for PostgreSQL runtime selection",
    );
  }

  return provider;
}

function createPrismaClient(): PrismaClient {
  const provider = databaseProvider();

  if (provider === "postgresql") {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    return new PostgreSqlPrismaClient({ adapter });
  }

  return new SqlitePrismaClient();
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
