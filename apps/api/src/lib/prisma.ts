import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.platform === "win32" && !process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const bundledEngine = resolve(
    process.cwd(),
    "../../node_modules/@prisma/engines/query_engine-windows.dll.node",
  );

  if (existsSync(bundledEngine)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = bundledEngine;
  }
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
