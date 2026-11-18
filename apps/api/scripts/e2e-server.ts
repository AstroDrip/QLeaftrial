// The API for the browser journeys (apps/web/e2e), on its own port with its own throwaway SQLite database.
//
//   npx tsx scripts/e2e-server.ts        (Playwright starts it; port 3100)
//
// Safe by construction: it never reads apps/api/.env, every secret it needs is a fake test value, and every request
// the server would make to the outside world is answered here instead:
//   - email (Resend): the request hangs until the server's own timeout, like a slow provider; nothing is sent;
//   - photo storage (Supabase Storage): a small in-memory stand-in on this same port, so real uploads work;
//   - anything else outside this computer: refused.
// The database is rebuilt from the schema at every start and filled with the development catalogue, about a hundred
// extra test plants (some with three photos, care details, outdoor sizes) and thirty test orders.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";

const PORT = Number(process.env.E2E_API_PORT ?? 3100);
const apiRoot = fileURLToPath(new URL("..", import.meta.url));
const databaseFile = fileURLToPath(new URL("../prisma/e2e.db", import.meta.url));
const databaseUrl = `file:${databaseFile.replaceAll("\\", "/")}`;

// Fake values first: Prisma copies apps/api/.env into the environment only for names that are not set yet.
Object.assign(process.env, {
  NODE_ENV: "development",
  QLEAVES_DATABASE_PROVIDER: "sqlite",
  QLEAVES_SQLITE_URL: databaseUrl,
  EMAIL_PROVIDER_API_KEY: "re_test_e2e_not_a_real_key",
  ORDER_NOTIFICATION_EMAIL: "orders@example.test",
  EMAIL_FROM: "QLeaves Test <test@example.test>",
  CRON_SECRET: "e2e-cron-secret-not-real-0000",
  PUBLIC_SITE_URL: "http://127.0.0.1:4173",
  SUPABASE_URL: `http://127.0.0.1:${PORT}`,
  SUPABASE_SECRET_KEY: "e2e-fake-storage-key",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_PRODUCT_IMAGE_BUCKET: "e2e-photos",
  RATE_LIMIT_SALT: "e2e-rate-limit-salt-not-real",
  DATABASE_URL: "",
});

// Outgoing requests: storage to the stand-in below, email hangs (until the caller gives up), the rest refused.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return realFetch(input, init);
  if (url.hostname === "api.resend.com") {
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (signal?.aborted) fail(); else signal?.addEventListener("abort", fail, { once: true });
    });
  }
  return new Response("Blocked in the e2e server", { status: 503 });
}) as typeof fetch;

// The database: an empty schema, then the development catalogue and the test data.
rmSync(databaseFile, { force: true });
rmSync(`${databaseFile}-journal`, { force: true });
const run = (args: string[], input?: string) => execFileSync(process.execPath, ["scripts/prisma.mjs", ...args], { cwd: apiRoot, input, encoding: "utf8" });
run(["db", "execute", "--url", databaseUrl, "--stdin"], run(["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"]));

const { prisma } = await import("../src/lib/prisma.js");
const { seedDatabase } = await import("../prisma/seed.js");
const { E2E_PHOTOS, e2eOrders, e2eProducts } = await import("./e2e-data.js");
await seedDatabase();
const db = prisma as any;
for (const product of e2eProducts()) {
  const { media, stock, ...data } = product;
  await db.product.create({ data: { ...data, inventory: { create: { quantity: stock } }, media: { create: media } } });
}
const products = await db.product.findMany({ where: { published: true, priceQar: { gt: 0 } }, select: { id: true, name: true, sku: true, priceQar: true }, orderBy: { slug: "asc" }, take: 5 });
for (const order of e2eOrders(products)) await db.order.create({ data: order });
console.log(`e2e data: ${await db.product.count()} products, ${await db.order.count()} orders, ${E2E_PHOTOS.length} photo files`);

// The photo storage stand-in (only the calls the API and the admin page make).
const objects = new Map<string, { type: string; bytes: Buffer }>();
const storage = express.Router();
storage.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (request.method === "OPTIONS") return void response.status(204).end();
  next();
});
const objectPath = (request: express.Request, prefix: string) => decodeURIComponent(request.path.slice(prefix.length));
storage.post(/^\/storage\/v1\/object\/upload\/sign\/.+/, (request, response) => {
  const path = objectPath(request, "/storage/v1/object/upload/sign/");
  response.json({ url: `/object/upload/sign/${path}?token=e2e-${Date.now()}` });
});
// The admin page sends the file inside a multipart form (as Supabase accepts it): keep the file part only.
function filePart(body: Buffer, contentType: string): { type: string; bytes: Buffer } {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  if (!contentType.startsWith("multipart/form-data") || !boundary) return { type: contentType || "application/octet-stream", bytes: body };
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const part = body.subarray(start + delimiter.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, split).toString("utf8");
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim();
    if (type) return { type, bytes: Buffer.from(part.subarray(split + 4)) };
    start = next;
  }
  return { type: "application/octet-stream", bytes: Buffer.alloc(0) };
}
storage.put(/^\/storage\/v1\/object\/upload\/sign\/.+/, express.raw({ type: () => true, limit: "25mb" }), (request, response) => {
  objects.set(objectPath(request, "/storage/v1/object/upload/sign/"), filePart(request.body as Buffer, request.get("content-type") ?? ""));
  response.json({ Key: objectPath(request, "/storage/v1/object/upload/sign/") });
});
storage.get(/^\/storage\/v1\/object\/public\/.+/, (request, response) => {
  const found = objects.get(objectPath(request, "/storage/v1/object/public/"));
  if (!found) return void response.status(404).end();
  response.type(found.type).send(found.bytes);
});
storage.get(/^\/storage\/v1\/object\/.+/, (request, response) => {
  const found = objects.get(objectPath(request, "/storage/v1/object/"));
  if (!found) return void response.status(404).json({ error: "not_found" });
  response.type(found.type).send(found.bytes);
});
storage.post(/^\/storage\/v1\/object\/(?!list\/).+/, express.raw({ type: () => true, limit: "25mb" }), (request, response) => {
  objects.set(objectPath(request, "/storage/v1/object/"), { type: request.get("content-type") ?? "application/octet-stream", bytes: request.body as Buffer });
  response.json({ Key: objectPath(request, "/storage/v1/object/") });
});
storage.delete(/^\/storage\/v1\/object\/.+/, (request, response) => {
  objects.delete(objectPath(request, "/storage/v1/object/"));
  response.json({});
});

const { createApp } = await import("../src/app.js");
const app = express();
app.use(storage);
app.use(createApp());
app.listen(PORT, "127.0.0.1", () => console.log(`QLeaves e2e API on http://127.0.0.1:${PORT}`));
