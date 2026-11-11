import { buildPublicCatalogue } from "../src/lib/catalogue.js";
import { writeCatalogueFile } from "../src/lib/catalogue.js";

const catalogue = await buildPublicCatalogue();
const publishedUrl = await writeCatalogueFile(catalogue);

console.log(
  `Published public catalogue: ${catalogue.productCount} products, version ${catalogue.version} (${publishedUrl})`,
);
