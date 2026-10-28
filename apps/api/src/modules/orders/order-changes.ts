// What the shop changed when it accepted an edited pending order. Stored as JSON on the order so the
// customer notification can describe the changes later.
export type OrderChange =
  | { type: "removed"; name: string; quantity: number }
  | { type: "quantity"; name: string; from: number; to: number }
  | { type: "replaced"; from: string; to: string; quantity: number };

export function parseOrderChanges(raw: string | null | undefined): OrderChange[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as OrderChange[]) : [];
  } catch {
    return [];
  }
}
