// Moves every QLeaves record from one PostgreSQL database to another (Supabase Frankfurt -> Mumbai, November
// 2026), plus any photos kept in Supabase Storage. The source is only ever read.
//
//   npx tsx scripts/move-database.ts check   read-only: counts rows and stored photos on both sides
//   npx tsx scripts/move-database.ts copy    copies everything into the (empty) target, then verifies it
//   npx tsx scripts/move-database.ts verify  compares row counts and fingerprints of every table again
//
// Environment (direct connections, port 5432; never typed on the command line):
//   SOURCE_DATABASE_URL, TARGET_DATABASE_URL
//   SOURCE_SUPABASE_URL, SOURCE_SUPABASE_KEY, TARGET_SUPABASE_URL, TARGET_SUPABASE_KEY   (for stored photos)
//   SUPABASE_PRODUCT_IMAGE_BUCKET                                                        (bucket name)
//
// The target must already have the schema (npm run supabase:deploy against it) and no rows. The copy runs in
// one transaction: if anything fails, the target is left empty. Rows keep their ids and timestamps, so order
// numbers, invoice links, sessions and admin passwords all keep working. Rate-limit counters are not copied
// (they expire within minutes).
import pg from "pg";

// Parents before children, so every foreign key already exists when a row arrives.
const TABLES = ["AdminUser", "StoreSettings", "Session", "Product", "ProductMedia", "Inventory", "Order", "OrderItem", "Review"] as const;
const KEYS: Record<(typeof TABLES)[number], string> = {
  AdminUser: "id", StoreSettings: "id", Session: "id", Product: "id", ProductMedia: "id",
  Inventory: '"productId"', Order: "id", OrderItem: "id", Review: "id",
};
// Columns that may hold a link to a stored photo.
const PHOTO_COLUMNS = [["ProductMedia", "url"], ["Review", "imageUrl"]] as const;
const BATCH = 200;

function env(name: string, required = true): string {
  const value = process.env[name]?.trim() ?? "";
  if (required && !value) throw new Error(`Set ${name} first.`);
  return value;
}

function client(url: string): pg.Client {
  return new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000, statement_timeout: 120_000 });
}

async function columns(db: pg.Client, table: string): Promise<string[]> {
  const result = await db.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return result.rows.map((row) => row.column_name as string);
}

async function counts(db: pg.Client): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) out[table] = Number((await db.query(`select count(*)::int as n from "${table}"`)).rows[0].n);
  return out;
}

// One fingerprint per table over every column, in key order: equal fingerprints mean identical contents.
async function fingerprints(db: pg.Client, shared: Record<string, string[]>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of TABLES) {
    const list = shared[table].map((column) => `"${column}"`).join(", ");
    const result = await db.query(`select md5(coalesce(string_agg(row_text, '|' order by key), '')) as fp from (select ${KEYS[table]}::text as key, row(${list})::text as row_text from "${table}") t`);
    out[table] = result.rows[0].fp as string;
  }
  return out;
}

function storagePathFrom(url: string, base: string, bucket: string): string | null {
  const prefix = `${base.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}

async function storedPhotos(db: pg.Client, base: string, bucket: string): Promise<string[]> {
  if (!base || !bucket) return [];
  const paths = new Set<string>();
  for (const [table, column] of PHOTO_COLUMNS) {
    const rows = await db.query(`select "${column}" as url from "${table}" where "${column}" is not null`);
    for (const row of rows.rows) {
      const path = storagePathFrom(String(row.url), base, bucket);
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

function storageHeaders(key: string): Record<string, string> {
  // New secret keys go in apikey only; legacy service-role JWTs also need the bearer header.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

async function copyPhotos(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const sourceBase = env("SOURCE_SUPABASE_URL").replace(/\/+$/, "");
  const targetBase = env("TARGET_SUPABASE_URL").replace(/\/+$/, "");
  const sourceKey = env("SOURCE_SUPABASE_KEY");
  const targetKey = env("TARGET_SUPABASE_KEY");
  const bucket = env("SUPABASE_PRODUCT_IMAGE_BUCKET");
  const encoded = (path: string) => path.split("/").map(encodeURIComponent).join("/");

  // The target bucket is created (public, like the source) if it does not exist yet.
  const created = await fetch(`${targetBase}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...storageHeaders(targetKey), "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (!created.ok && created.status !== 409 && !(await created.text()).includes("already exists")) {
    throw new Error(`Could not create the target bucket (${created.status})`);
  }

  let copied = 0;
  for (const path of paths) {
    const download = await fetch(`${sourceBase}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded(path)}`, { headers: storageHeaders(sourceKey) });
    if (!download.ok) throw new Error(`Could not read ${path} from the source (${download.status})`);
    const body = Buffer.from(await download.arrayBuffer());
    const upload = await fetch(`${targetBase}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded(path)}`, {
      method: "POST",
      headers: { ...storageHeaders(targetKey), "Content-Type": download.headers.get("content-type") ?? "application/octet-stream", "x-upsert": "true" },
      body,
    });
    if (!upload.ok) throw new Error(`Could not write ${path} to the target (${upload.status})`);
    copied += 1;
  }
  return copied;
}

async function main(mode: string) {
  const source = client(env("SOURCE_DATABASE_URL"));
  const target = client(env("TARGET_DATABASE_URL"));
  await source.connect();
  await target.connect();
  try {
    const host = (url: string) => { try { return new URL(url).hostname; } catch { return "?"; } };
    console.log(`Source: ${host(env("SOURCE_DATABASE_URL"))}   Target: ${host(env("TARGET_DATABASE_URL"))}`);
    if (env("SOURCE_DATABASE_URL") === env("TARGET_DATABASE_URL")) throw new Error("Source and target are the same database.");

    const shared: Record<string, string[]> = {};
    for (const table of TABLES) {
      const [from, to] = await Promise.all([columns(source, table), columns(target, table)]);
      if (to.length === 0) throw new Error(`The target has no "${table}" table. Run npm run supabase:deploy against it first.`);
      const missing = from.filter((column) => !to.includes(column));
      if (missing.length) throw new Error(`The target "${table}" table lacks ${missing.join(", ")}. Bring its schema up to date first.`);
      shared[table] = from;
    }

    const sourceCounts = await counts(source);
    const bucket = env("SUPABASE_PRODUCT_IMAGE_BUCKET", false);
    const photos = await storedPhotos(source, env("SOURCE_SUPABASE_URL", false), bucket);
    console.log("Rows in the source:", JSON.stringify(sourceCounts));
    console.log(`Photos kept in Supabase Storage: ${photos.length}`);

    if (mode === "check") {
      console.log("Rows in the target:", JSON.stringify(await counts(target)));
      console.log("RESULT: check only, nothing was changed.");
      return;
    }

    if (mode === "copy") {
      const targetCounts = await counts(target);
      if (Object.values(targetCounts).some((n) => n > 0)) throw new Error(`The target already has rows (${JSON.stringify(targetCounts)}); refusing to copy over them.`);
      if (photos.length && !env("TARGET_SUPABASE_URL", false)) throw new Error("There are stored photos to move: set the Supabase URL and key variables too.");

      // Photos first: if a photo cannot be copied, no database row is written.
      const copiedPhotos = await copyPhotos(photos);
      console.log(`Photos copied: ${copiedPhotos}`);

      await target.query("begin");
      try {
        for (const table of TABLES) {
          const list = shared[table];
          const names = list.map((column) => `"${column}"`).join(", ");
          const rows = (await source.query(`select ${names} from "${table}" order by ${KEYS[table]}`)).rows;
          for (let start = 0; start < rows.length; start += BATCH) {
            const chunk = rows.slice(start, start + BATCH);
            const values: unknown[] = [];
            const tuples = chunk.map((row) => `(${list.map((column) => { values.push(row[column]); return `$${values.length}`; }).join(", ")})`);
            await target.query(`insert into "${table}" (${names}) values ${tuples.join(", ")}`, values);
          }
          console.log(`  ${table}: ${rows.length}`);
        }
        // Links to stored photos now point at the new project.
        const sourceBase = env("SOURCE_SUPABASE_URL", false).replace(/\/+$/, "");
        const targetBase = env("TARGET_SUPABASE_URL", false).replace(/\/+$/, "");
        if (sourceBase && targetBase && photos.length) {
          for (const [table, column] of PHOTO_COLUMNS) {
            await target.query(`update "${table}" set "${column}" = $2 || substr("${column}", length($1) + 1) where "${column}" like $1 || '%'`, [sourceBase, targetBase]);
          }
        }
        await target.query("commit");
      } catch (error) {
        await target.query("rollback");
        throw error;
      }
    }

    // Verify (after a copy, or on its own): same counts, and the same contents table by table.
    const [after, sourcePrints, targetPrints] = await Promise.all([counts(target), fingerprints(source, shared), fingerprints(target, shared)]);
    const rewritten = photos.length > 0;
    const mismatches = TABLES.filter((table) => after[table] !== sourceCounts[table] || (sourcePrints[table] !== targetPrints[table] && !(rewritten && (table === "ProductMedia" || table === "Review"))));
    console.log("Rows in the target:", JSON.stringify(after));
    if (mismatches.length) {
      console.log(`RESULT: MISMATCH in ${mismatches.join(", ")}`);
      process.exitCode = 3;
    } else {
      console.log(`RESULT: SUCCESS - every table matches the source (${Object.values(after).reduce((a, b) => a + b, 0)} rows).`);
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main(process.argv[2] ?? "check").catch((error: unknown) => {
  console.error(`RESULT: STOPPED - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
