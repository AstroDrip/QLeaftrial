import { prisma } from "../../lib/prisma.js";

const SITE_URL = "https://qleaves.qa";
const STABLE_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/shop", changefreq: "daily", priority: "0.9" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/shipping-returns", changefreq: "monthly", priority: "0.5" },
] as const;

type SitemapProduct = { slug: string; updatedAt: Date };
type SitemapRepository = {
  findMany(args: {
    where: { published: true };
    select: { slug: true; updatedAt: true };
    orderBy: { slug: "asc" };
  }): Promise<SitemapProduct[]>;
};

const productRepository = prisma.product as unknown as SitemapRepository;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stableEntry(page: (typeof STABLE_PAGES)[number]): string {
  return `  <url><loc>${xmlEscape(`${SITE_URL}${page.path}`)}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`;
}

function productEntry(product: SitemapProduct): string {
  return `  <url><loc>${xmlEscape(`${SITE_URL}/plants/${product.slug}`)}</loc><lastmod>${xmlEscape(product.updatedAt.toISOString())}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
}

export async function buildSitemap(): Promise<string> {
  const products = await productRepository.findMany({
    where: { published: true },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...STABLE_PAGES.map(stableEntry),
    ...products.map(productEntry),
    "</urlset>",
    "",
  ].join("\n");
}
