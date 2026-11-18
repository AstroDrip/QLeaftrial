import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Prisma applies migration folders in plain text order ("10_..." would run before "2_..."). The PostgreSQL folders
// are numbered 0-9 and then 9a, 9b, 9c, ... so text order and intended order are the same. This keeps it that way.
const folder = fileURLToPath(new URL("../prisma/postgresql/migrations/", import.meta.url));
const names = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

describe("PostgreSQL migration folders", () => {
  it("sort in the order they were written", () => {
    const intended = [...names].sort((a, b) => {
      const [, an, aSuffix] = a.match(/^(\d+)([a-z]*)_/) ?? [];
      const [, bn, bSuffix] = b.match(/^(\d+)([a-z]*)_/) ?? [];
      return Number(an) - Number(bn) || (aSuffix ?? "").localeCompare(bSuffix ?? "");
    });
    expect([...names].sort()).toEqual(intended);
    expect(names.every((name) => /^\d+[a-z]*_[a-z0-9_]+$/.test(name))).toBe(true);
  });

  it("never number past 9 (a two-digit number would sort before 2)", () => {
    expect(names.filter((name) => Number(name.match(/^(\d+)/)?.[1]) > 9)).toEqual([]);
  });
});
