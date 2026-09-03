import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function schemaDeclarations(schema: string) {
  return [...schema.matchAll(/^(model|enum)\s+(\w+)\s+\{([\s\S]*?)^\}/gm)].map(
    ([, kind, name, body]) => ({
      kind,
      name,
      body: body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith("@@map")),
    }),
  );
}

describe("Prisma schema parity", () => {
  it("keeps SQLite and PostgreSQL model and enum declarations equivalent", async () => {
    const [sqlite, postgresql] = await Promise.all([
      readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
      readFile(new URL("../prisma/schema.postgresql.prisma", import.meta.url), "utf8"),
    ]);

    expect(schemaDeclarations(postgresql)).toEqual(schemaDeclarations(sqlite));
  });
});
