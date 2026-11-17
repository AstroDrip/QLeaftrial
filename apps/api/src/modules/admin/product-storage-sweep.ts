import { prisma } from "../../lib/prisma.js";
import { objectPathUrl, productImageStorageConfig, storageHeaders, storagePathFromPublicUrl } from "./product-image-storage.js";

// Daily tidy-up of the product image store. Removes:
//   - uploads left in products/staging/ by an admin who never finished (older than a day);
//   - product photo files that no product and no review points to any more (older than a day).
// It never touches anything outside products/, never the review photo folder (products/reviews/), never a file the
// database references, and never a file younger than a day (it may belong to a change still in progress).
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DELETES = 200;
const SKIP_FOLDERS = new Set(["reviews"]);

type Entry = { name: string; id: string | null; created_at?: string | null; updated_at?: string | null };

async function list(prefix: string): Promise<Entry[]> {
  const config = productImageStorageConfig();
  const response = await fetch(`${config.baseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`, {
    method: "POST",
    headers: { ...storageHeaders(config.apiKey, config.legacyBearer), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!response.ok) throw new Error(`Storage listing failed with ${response.status}`);
  return (await response.json()) as Entry[];
}

async function remove(path: string): Promise<boolean> {
  const config = productImageStorageConfig();
  const response = await fetch(objectPathUrl(config.baseUrl, config.bucket, path), { method: "DELETE", headers: storageHeaders(config.apiKey, config.legacyBearer) });
  return response.ok;
}

const isFolder = (entry: Entry) => entry.id === null;
const oldEnough = (entry: Entry, now: number) => {
  const time = Date.parse(entry.created_at ?? entry.updated_at ?? "");
  return Number.isFinite(time) && now - time >= MIN_AGE_MS;
};

async function referencedPaths(): Promise<Set<string>> {
  const db = prisma as any;
  const [media, reviews] = await Promise.all([
    db.productMedia.findMany({ select: { url: true } }),
    db.review.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
  ]);
  const urls: string[] = [...media.map((row: { url: string }) => row.url), ...reviews.map((row: { imageUrl: string }) => row.imageUrl)];
  return new Set(urls.map(storagePathFromPublicUrl).filter((path): path is string => Boolean(path)));
}

export type SweepSummary = { configured: boolean; staging: number; unused: number; failed: number };

export async function sweepProductStorage(now = Date.now()): Promise<SweepSummary> {
  const summary: SweepSummary = { configured: true, staging: 0, unused: 0, failed: 0 };
  try {
    productImageStorageConfig();
  } catch {
    return { ...summary, configured: false };
  }
  const referenced = await referencedPaths();
  let budget = MAX_DELETES;
  const consider = async (path: string, entry: Entry, kind: "staging" | "unused") => {
    if (budget <= 0 || referenced.has(path) || !oldEnough(entry, now)) return;
    budget -= 1;
    if (await remove(path)) summary[kind] += 1;
    else summary.failed += 1;
  };

  for (const folder of await list("products/")) {
    if (!isFolder(folder) || SKIP_FOLDERS.has(folder.name)) continue;
    if (folder.name === "staging") {
      for (const upload of await list("products/staging/")) {
        if (!isFolder(upload)) { await consider(`products/staging/${upload.name}`, upload, "staging"); continue; }
        for (const file of await list(`products/staging/${upload.name}/`)) {
          if (!isFolder(file)) await consider(`products/staging/${upload.name}/${file.name}`, file, "staging");
        }
      }
      continue;
    }
    for (const file of await list(`products/${folder.name}/`)) {
      if (!isFolder(file)) await consider(`products/${folder.name}/${file.name}`, file, "unused");
    }
  }
  return summary;
}
