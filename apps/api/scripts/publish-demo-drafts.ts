// Publishes the catalogue drafts imported from the client's photos with a flat demo price and demo stock,
// so the storefront can be reviewed with every product live. Requested by the shop on 12 November 2026;
// real prices and stock are to be set in admin afterwards.
//
// Only touches drafts created by the catalogue import (SKU QL-... or HB-DRAFT-...) that are still
// unpublished and priced at 0, so a product the shop has already priced or published is never changed.
// Their "needs review" flags stay on, so admin still shows what to check. Safe to run more than once.
//
//   npx tsx scripts/publish-demo-drafts.ts            (uses the configured database)
import { prisma } from "../src/lib/prisma.js";

export const DEMO_PRICE_QAR = 99;
export const DEMO_STOCK = 10;

export async function publishDemoDrafts(): Promise<{ published: number; skipped: number }> {
  const drafts = await prisma.product.findMany({
    where: { published: false, priceQar: 0, OR: [{ sku: { startsWith: "QL-" } }, { sku: { startsWith: "HB-DRAFT-" } }] },
    select: { id: true, inventory: { select: { quantity: true } } },
  });
  for (const draft of drafts) {
    await prisma.$transaction([
      prisma.product.update({ where: { id: draft.id }, data: { priceQar: DEMO_PRICE_QAR, published: true } }),
      prisma.inventory.upsert({
        where: { productId: draft.id },
        create: { productId: draft.id, quantity: DEMO_STOCK },
        // Never lower a count the shop has already entered.
        update: { quantity: Math.max(draft.inventory?.quantity ?? 0, DEMO_STOCK) },
      }),
    ]);
  }
  const remaining = await prisma.product.count({ where: { published: false } });
  return { published: drafts.length, skipped: remaining };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop()!)) {
  publishDemoDrafts()
    .then((result) => console.log(`Demo publish: ${JSON.stringify(result)}`))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
