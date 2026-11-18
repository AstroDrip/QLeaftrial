// Measures the public catalogue snapshot and the homepage's built-in data for a large shop:
//
//   npx tsx scripts/measure-catalogue.ts [products]     (default 500, each with 3 photos in 2 sizes)
//
// Uses a throwaway SQLite database (deleted afterwards) filled with realistic made-up products: English and Arabic
// descriptions, care and size details, Supabase-style photo links. Nothing else is touched.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const count = Number(process.argv[2] ?? 500);
const directory = mkdtempSync(join(tmpdir(), "qleaves-measure-"));
const url = `file:${join(directory, "measure.db").replaceAll("\\", "/")}`;
Object.assign(process.env, { QLEAVES_DATABASE_PROVIDER: "sqlite", QLEAVES_SQLITE_URL: url, EMAIL_PROVIDER_API_KEY: "", NODE_ENV: "development" });
const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const run = (args: string[], input?: string) => execFileSync(process.execPath, ["scripts/prisma.mjs", ...args], { cwd: apiRoot, input, encoding: "utf8" });
run(["db", "execute", "--url", url, "--stdin"], run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"]));

const { prisma } = await import("../src/lib/prisma.js");
const { buildPublicCatalogue } = await import("../src/lib/catalogue.js");
const { buildHomeBootstrap } = await import("../src/lib/home-bootstrap.js");
const db = prisma as any;
const storage = "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/product-images/products";
const categories = ["Indoor Plants", "Table Top Plants", "Outdoor Plants", "Gift Plants"];
for (let index = 0; index < count; index += 1) {
  const slug = `measured-plant-${index}`;
  const media = Array.from({ length: 3 }, (_, photo) => {
    const key = crypto.randomUUID();
    return [
      { url: `${storage}/${slug}/catalog-${crypto.randomUUID()}.webp`, altText: `Measured plant ${index} photo ${photo + 1}`, purpose: "catalog", sortOrder: photo * 2, width: 640, height: 800, photoKey: key, contentHash: "a".repeat(64) },
      { url: `${storage}/${slug}/detail-${crypto.randomUUID()}.webp`, altText: `Measured plant ${index} photo ${photo + 1}`, purpose: "detail", sortOrder: photo * 2 + 1, width: 1400, height: 1750, photoKey: key, contentHash: "a".repeat(64) },
    ];
  }).flat();
  await db.product.create({
    data: {
      slug, sku: `M-${index}`, name: `Measured Plant ${index}`, nameAr: `نبتة القياس ${index}`,
      description: "A leafy plant with glossy leaves that likes bright, indirect light and a weekly drink. ".repeat(5),
      descriptionAr: "نبتة ورقية بأوراق لامعة تحب الضوء الساطع غير المباشر وريًا أسبوعيًا. ".repeat(5),
      category: categories[index % 4], categoryAr: "نباتات داخلية", light: "Bright indirect", lightAr: "إضاءة ساطعة غير مباشرة",
      watering: "When the top soil is dry", wateringAr: "عندما تجف الطبقة العليا من التربة", humidity: "Average", soil: "Free-draining mix",
      temperature: "18 to 30 °C", careLevel: "easy", placement: "indoor", heightCm: 60, sizeNote: "Medium floor plant",
      scientificName: "Plantus measuredus", searchAliases: "measure, test", priceQar: 50 + index, costPrice: 20, published: true, featured: index % 25 === 0,
      inventory: { create: { quantity: 10 } }, media: { create: media },
    },
  });
}

const catalogue = await buildPublicCatalogue();
const bootstrap = buildHomeBootstrap(catalogue as Parameters<typeof buildHomeBootstrap>[0]);
const size = (label: string, value: unknown) => {
  const text = JSON.stringify(value);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  console.log(`${label}: raw ${kb(Buffer.byteLength(text))}, gzip ${kb(gzipSync(text).length)}, brotli ${kb(brotliCompressSync(text).length)}`);
};
console.log(`${catalogue.products.length} products, ${catalogue.products.reduce((sum, product) => sum + product.media.length, 0)} photo files`);
size("Catalogue snapshot (catalogue.json)", catalogue);
size(`Homepage built-in data (${bootstrap.products.length} products)`, bootstrap);
await prisma.$disconnect();
rmSync(directory, { recursive: true, force: true });
