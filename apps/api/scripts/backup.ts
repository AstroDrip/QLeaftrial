// QLeaves database backup and restore drill (stage 9). Free, no PostgreSQL tools needed.
//
//   npx tsx scripts/backup.ts export <file.json.gz>   read-only: one consistent snapshot of every table
//   npx tsx scripts/backup.ts drill  <file.json.gz>   restores the file into a throwaway local PostgreSQL (with all
//                                                      migrations) and checks every table against the backup
//
// Environment for export (direct connection, port 5432, never typed on the command line): BACKUP_DATABASE_URL.
// The backup holds customer details (names, phones, addresses): keep the file somewhere private.
//
// PostgreSQL itself turns each table into JSON (jsonb_agg) and back (jsonb_populate_recordset), so dates, numbers,
// enums and JSON columns come back exactly. Each table also gets a fingerprint (md5 over all its rows); the drill
// passes only when every restored table has the same number of rows and the same fingerprint.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import pg from "pg";

export type Backup = {
  format: "qleaves-backup-1";
  createdAt: string;
  source: string;
  tables: Record<string, { rows: number; fingerprint: string; data: unknown[] }>;
};

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

export async function tableNames(db: pg.Client): Promise<string[]> {
  const result = await db.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name");
  return result.rows.map((row) => row.table_name as string);
}

/** Rows and an order-independent fingerprint of one table's full contents. */
export async function describeTable(db: pg.Client, table: string): Promise<{ rows: number; fingerprint: string }> {
  const result = await db.query(`select count(*)::int as rows, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as fingerprint from ${quote(table)} t`);
  return { rows: result.rows[0].rows as number, fingerprint: result.rows[0].fingerprint as string };
}

/** Reads every table in one read-only snapshot, so the backup is consistent even while orders arrive. */
export async function exportBackup(url: string): Promise<Backup> {
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000, statement_timeout: 300_000 });
  await db.connect();
  try {
    await db.query("begin transaction isolation level repeatable read read only");
    const tables: Backup["tables"] = {};
    for (const table of await tableNames(db)) {
      const data = (await db.query(`select coalesce(jsonb_agg(t), '[]'::jsonb) as data from ${quote(table)} t`)).rows[0].data as unknown[];
      tables[table] = { ...(await describeTable(db, table)), data };
    }
    await db.query("commit");
    let source = "?";
    try { source = new URL(url).hostname; } catch { /* keep "?" */ }
    return { format: "qleaves-backup-1", createdAt: new Date().toISOString(), source, tables };
  } finally {
    await db.end();
  }
}

/** Loads a backup into an empty database that already has the schema, then compares every table. */
export async function restoreInto(url: string, backup: Backup): Promise<{ ok: boolean; problems: string[]; rows: number }> {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const problems: string[] = [];
  try {
    const existing = await tableNames(db);
    await db.query("begin");
    // Foreign keys are checked by the source database already; switching them off here lets tables load in any order.
    await db.query("set local session_replication_role = replica");
    for (const [table, content] of Object.entries(backup.tables)) {
      if (!existing.includes(table)) { problems.push(`${table}: missing in the restored schema`); continue; }
      await db.query(`delete from ${quote(table)}`);
      for (let start = 0; start < content.data.length; start += 500) {
        await db.query(`insert into ${quote(table)} select * from jsonb_populate_recordset(null::${quote(table)}, $1::jsonb)`, [JSON.stringify(content.data.slice(start, start + 500))]);
      }
    }
    await db.query("commit");
    let rows = 0;
    for (const [table, content] of Object.entries(backup.tables)) {
      if (!existing.includes(table)) continue;
      const restored = await describeTable(db, table);
      rows += restored.rows;
      if (restored.rows !== content.rows) problems.push(`${table}: ${restored.rows} rows restored, ${content.rows} in the backup`);
      else if (restored.fingerprint !== content.fingerprint) problems.push(`${table}: contents differ from the backup`);
    }
    return { ok: problems.length === 0, problems, rows };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

export const writeBackup = (file: string, backup: Backup) => writeFileSync(file, gzipSync(JSON.stringify(backup)));
export function readBackup(file: string): Backup {
  const backup = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as Backup;
  if (backup.format !== "qleaves-backup-1") throw new Error("This is not a QLeaves backup file.");
  return backup;
}

/** Restore drill: a throwaway PostgreSQL on this computer, the repository's migrations, the backup, the checks. */
async function drill(file: string): Promise<void> {
  const backup = readBackup(file);
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const directory = mkdtempSync(join(tmpdir(), "qleaves-restore-drill-"));
  const port = 54339;
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/qleaves_restore`;
  const server = new EmbeddedPostgres({ databaseDir: join(directory, "data"), user: "postgres", password: "postgres", port, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => undefined });
  try {
    await server.initialise();
    await server.start();
    await server.createDatabase("qleaves_restore");
    const apiRoot = fileURLToPath(new URL("..", import.meta.url));
    execFileSync(process.execPath, ["scripts/prisma.mjs", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"], {
      cwd: apiRoot, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: "pipe",
    });
    const result = await restoreInto(url, backup);
    console.log(`Backup of ${backup.source} taken ${backup.createdAt}: ${Object.keys(backup.tables).length} tables, ${result.rows} rows restored.`);
    for (const [table, content] of Object.entries(backup.tables)) console.log(`  ${table}: ${content.rows}`);
    if (result.ok) console.log("RESULT: SUCCESS - every table was restored and matches the backup exactly.");
    else { console.log(`RESULT: PROBLEMS\n  ${result.problems.join("\n  ")}`); process.exitCode = 3; }
  } finally {
    await server.stop().catch(() => undefined);
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [mode, file] = process.argv.slice(2);
  if (!file || (mode !== "export" && mode !== "drill")) throw new Error("Use: backup.ts export <file.json.gz> | drill <file.json.gz>");
  if (mode === "export") {
    const url = process.env.BACKUP_DATABASE_URL?.trim();
    if (!url) throw new Error("Set BACKUP_DATABASE_URL first.");
    const backup = await exportBackup(url);
    writeBackup(file, backup);
    const rows = Object.values(backup.tables).reduce((sum, table) => sum + table.rows, 0);
    console.log(`RESULT: SUCCESS - ${Object.keys(backup.tables).length} tables, ${rows} rows saved to ${file}`);
  } else {
    await drill(file);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(`RESULT: FAILED - ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
}
