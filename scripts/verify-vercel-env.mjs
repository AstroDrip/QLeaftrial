const problems = [];

if (process.env.QLEAVES_DATABASE_PROVIDER !== "postgresql") {
  problems.push("QLEAVES_DATABASE_PROVIDER must be set to postgresql");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  problems.push("DATABASE_URL must be set");
} else if (!databaseUrl.startsWith("postgresql://")) {
  problems.push("DATABASE_URL must use postgresql://");
} else {
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
      problems.push("DATABASE_URL must include a database host and name");
    }
  } catch {
    problems.push("DATABASE_URL must be a valid PostgreSQL URL");
  }
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
if (!supabaseUrl) {
  problems.push("SUPABASE_URL must be set");
} else {
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname) {
      problems.push("SUPABASE_URL must be a valid https:// URL");
    }
  } catch {
    problems.push("SUPABASE_URL must be a valid https:// URL");
  }
}

if (!process.env.SUPABASE_PRODUCT_IMAGE_BUCKET?.trim()) {
  problems.push("SUPABASE_PRODUCT_IMAGE_BUCKET must be set");
}

if (
  !process.env.SUPABASE_SECRET_KEY?.trim() &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
) {
  problems.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set");
}

if (problems.length) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  process.exit(1);
}

console.log("Vercel runtime environment check passed");
