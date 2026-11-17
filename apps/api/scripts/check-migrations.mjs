// Release check, run by the Vercel build: every PostgreSQL migration in this repository must already be applied to
// the production database. Code that needs a column the database does not have yet is not deployed.
//
// It only reads the migration history table (_prisma_migrations), through the normal connection string, and never
// prints the connection string. Outcomes:
//   all applied                  -> exit 0
//   one or more not applied      -> exit 1, listing them (apply them first, then redeploy)
//   database could not be reached -> a warning, exit 0: the build is not blocked by a short database outage, and the
//                                    running API still refuses orders (and /ready answers 503) if the schema is behind.
// Outside a PostgreSQL build (local development, tests) it does nothing.
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (process.env.QLEAVES_DATABASE_PROVIDER !== "postgresql") {
  console.log("Migration check skipped (not a PostgreSQL build).");
  process.exit(0);
}

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Migration check: DATABASE_URL is not set.");
  process.exit(1);
}

const directory = fileURLToPath(new URL("../prisma/postgresql/migrations/", import.meta.url));
const expected = readdirSync(directory).filter((name) => statSync(new URL(name, `file:///${directory.replaceAll("\\", "/")}/`)).isDirectory()).sort();

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000, statement_timeout: 10_000, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
let applied;
try {
  await client.connect();
  const result = await client.query(`select migration_name from "_prisma_migrations" where finished_at is not null and rolled_back_at is null`);
  applied = new Set(result.rows.map((row) => row.migration_name));
} catch (error) {
  console.warn(`WARNING: migration check could not read the database (${error?.code ?? error?.name ?? "error"}). Build continues; check /api/v1/ready after deploying.`);
  process.exit(0);
} finally {
  await client.end().catch(() => undefined);
}

const missing = expected.filter((name) => !applied.has(name));
if (missing.length) {
  console.error(`Migration check FAILED: ${missing.length} migration(s) not applied to the production database:`);
  for (const name of missing) console.error(`  - ${name}`);
  console.error("Apply them (npm run supabase:deploy) before deploying this code.");
  process.exit(1);
}
console.log(`Migration check: all ${expected.length} migrations are applied.`);
