import { z } from "zod";

// Admin lists come in pages of 25, 50 or 100. Without a page number an endpoint answers as before (everything),
// which the product and order pickers still use.
export const PAGE_SIZES = [25, 50, 100] as const;

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(100).optional(),
);

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(100_000),
  pageSize: z.coerce.number().int().refine((value) => (PAGE_SIZES as readonly number[]).includes(value)).default(25),
  q: optionalText,
});

export type Page<T> = { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number };

export function pageOf<T>(items: T[], page: number, pageSize: number, totalItems: number): Page<T> {
  return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
}

export const skipFor = (page: number, pageSize: number) => (page - 1) * pageSize;

/** A case-insensitive "contains" filter (PostgreSQL needs the mode; SQLite's LIKE already ignores case). */
export function containsText(value: string): { contains: string; mode?: "insensitive" } {
  return process.env.QLEAVES_DATABASE_PROVIDER === "postgresql" ? { contains: value, mode: "insensitive" } : { contains: value };
}

/** Start of a Qatar calendar day (UTC+3, no daylight saving) as a UTC instant. */
export function qatarDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export function qatarDayOf(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
