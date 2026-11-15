// Build step: writes the public catalogue snapshot into the web app's public folder (git-ignored) so the
// deployed storefront has a last-resort copy of the products even before the API first answers.
// It also cuts the homepage bootstrap from it (the data the homepage shows before any request returns).
// It only reads published products. If the database cannot be reached the build carries on: the storefront then
// relies on the live, CDN-cached API for the full catalogue, and the web build embeds the committed homepage
// fallback instead (apps/web/bootstrap/home-fallback.json). The web build fails if it has neither.
import { buildPublicCatalogue, writeCatalogueFile, writeHomeBootstrapFile } from "../src/lib/catalogue.js";
import { prisma } from "../src/lib/prisma.js";

try {
  const catalogue = await buildPublicCatalogue();
  const path = await writeCatalogueFile(catalogue);
  console.log(`Public catalogue snapshot: ${catalogue.productCount} products, version ${catalogue.version} (${path})`);
  const home = await writeHomeBootstrapFile(catalogue);
  console.log(`Homepage bootstrap: ${home.products} products (${home.path})`);
} catch (error) {
  console.warn(`WARNING: public catalogue snapshot and homepage bootstrap NOT generated (${error instanceof Error ? error.name : "unknown error"}). The web build will use the committed homepage fallback.`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
