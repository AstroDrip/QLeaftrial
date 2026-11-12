// Read-only check of the live PostgreSQL schema before switching production to versioned migrations.
// It asks Prisma what SQL would turn the live database into prisma/postgresql/schema.prisma and prints it.
// Nothing is changed. Needs DIRECT_URL in the environment (never pass it on the command line).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("Set DIRECT_URL (the Supabase direct connection, port 5432) in this terminal first.");
  process.exit(1);
}

const wrapper = fileURLToPath(new URL("./prisma.mjs", import.meta.url));
const schema = fileURLToPath(new URL("../prisma/postgresql/schema.prisma", import.meta.url));
const result = spawnSync(process.execPath, [wrapper, "migrate", "diff", "--from-url", directUrl, "--to-schema-datamodel", schema, "--script"], {
  encoding: "utf8",
  env: process.env,
});
if (result.status !== 0) {
  console.error((result.stderr || "Prisma could not read the live schema.").replaceAll(directUrl, "<DIRECT_URL>"));
  process.exit(1);
}

const statements = result.stdout.split(";").map((part) => part.replace(/--.*$/gm, "").trim()).filter(Boolean);
const expected = (statement) => /"idempotencyKey"|Order_idempotencyKey_key/.test(statement);
const unexpected = statements.filter((statement) => !expected(statement));

console.log(result.stdout.trim() || "(no differences)");
console.log("");
if (unexpected.length === 0) {
  console.log("RESULT: the live database matches the baseline (0_init). Next: npm run supabase:baseline, then npm run supabase:deploy.");
} else if (unexpected.every((statement) => /^(CREATE|ALTER TABLE "public"\."Review" ADD CONSTRAINT)/.test(statement))) {
  console.log("RESULT: the live database is missing some tables or indexes that 0_init expects (shown above, additive only).");
  console.log("Do not baseline yet. Send these lines to your developer.");
  process.exitCode = 2;
} else {
  console.log("RESULT: the live database differs from the baseline in ways that are not purely additive. Stop and send this output to your developer.");
  process.exitCode = 3;
}
