import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
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

// Both generated clients expose the same application models. A union of the two
// makes non-strict TypeScript (as used by Vercel's function compiler) recurse
// through Prisma's types (TS2615), so the SQLite shape is the declared type.
type PrismaClient = InstanceType<typeof SqlitePrismaClient>;

function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const explicitProvider = process.env.QLEAVES_DATABASE_PROVIDER;

  if (isProduction && explicitProvider !== "postgresql") {
    throw new Error(
      "QLEAVES_DATABASE_PROVIDER=postgresql is required in production",
    );
  }

  const provider = explicitProvider ?? (isProduction ? "postgresql" : "sqlite");

  if (provider !== "postgresql" && provider !== "sqlite") {
    throw new Error(`Unsupported QLEAVES_DATABASE_PROVIDER: ${provider}`);
  }

  if (provider === "postgresql") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required for PostgreSQL runtime selection",
      );
    }

    if (databaseUrl.trim().startsWith("file:")) {
      throw new Error("SQLite file: URLs are not permitted in production");
    }

    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        throw new Error("DATABASE_URL must use postgresql: or postgres: protocol");
      }
      if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
        throw new Error("DATABASE_URL must specify a host and database name");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("DATABASE_URL")) {
        throw error;
      }
      throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
    }
  }
}

function databaseProvider(): DatabaseProvider {
  validateEnvironment();

  return (process.env.QLEAVES_DATABASE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "postgresql" : "sqlite")) as DatabaseProvider;
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  pgPool?: pg.Pool;
};

function getOrCreatePgPool(connectionString: string): pg.Pool {
  if (globalForPrisma.pgPool) {
    return globalForPrisma.pgPool;
  }

  // Supabase transaction pooler (port 6543) requires bounded connection reservations.
  // Default to 1 for serverless functions, with an upper bound of 5 if DB_POOL_MAX is provided.
  const parsedMax = Number(process.env.DB_POOL_MAX);
  const poolMax = Number.isInteger(parsedMax) && parsedMax >= 1 ? Math.min(parsedMax, 5) : 1;

  const pool = new pg.Pool({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  pool.on("error", (err) => {
    // Log unexpected errors on idle clients without crashing the process
    console.error("Unexpected error on idle PostgreSQL client:", err.message);
  });

  globalForPrisma.pgPool = pool;
  return pool;
}

function createPrismaClient(): PrismaClient {
  const provider = databaseProvider();

  if (provider === "postgresql") {
    const pool = getOrCreatePgPool(process.env.DATABASE_URL!);
    const adapter = new PrismaPg(pool);

    return new PostgreSqlPrismaClient({ adapter }) as unknown as PrismaClient;
  }

  // Tests point this at their own database so they never wipe the developer's dev.db.
  const sqliteUrl = process.env.QLEAVES_SQLITE_URL;
  return new SqlitePrismaClient(sqliteUrl ? { datasourceUrl: sqliteUrl } : undefined);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In serverless execution environments (Vercel), freezing and resuming execution
// can cause multiple client instantiations if not explicitly saved on globalThis.
globalForPrisma.prisma = prisma;

