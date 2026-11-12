// Build step: writes the public catalogue snapshot into the web app's public folder (git-ignored) so the
// deployed storefront has a last-resort copy of the products even before the API first answers.
// It only reads published products. If the database cannot be reached the build carries on without a
// snapshot (the storefront then relies on the live, CDN-cached API), rather than failing the deploy.
import { buildPublicCatalogue, writeCatalogueFile } from "../src/lib/catalogue.js";
import { prisma } from "../src/lib/prisma.js";

try {
  const catalogue = await buildPublicCatalogue();
  const path = await writeCatalogueFile(catalogue);
  console.log(`Public catalogue snapshot: ${catalogue.productCount} products, version ${catalogue.version} (${path})`);
} catch (error) {
  console.warn(`Public catalogue snapshot skipped: ${error instanceof Error ? error.name : "unknown error"}`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
