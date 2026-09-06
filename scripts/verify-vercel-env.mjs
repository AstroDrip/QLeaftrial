const problems = [];

const rateLimitSalt = process.env.RATE_LIMIT_SALT?.trim();
const placeholderPattern = /(?:replace|change[-_ ]?me|placeholder|example|your[-_ ])/i;

if (!rateLimitSalt || rateLimitSalt.length < 32) {
  problems.push("RATE_LIMIT_SALT must contain at least 32 characters");
} else if (placeholderPattern.test(rateLimitSalt)) {
  problems.push("RATE_LIMIT_SALT must not use a placeholder value");
}

const serverOnlyVariables = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RATE_LIMIT_SALT",
  "QLEAVES_ADMIN_SEED_PASSWORD",
];

for (const variable of serverOnlyVariables) {
  const publicVariable = `VITE_${variable}`;
  if (process.env[publicVariable]?.trim()) {
    problems.push(`${publicVariable} must not be set because it exposes a server-only value`);
  }
}

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
    if (!parsed.username || !parsed.password) {
      problems.push("DATABASE_URL must include a database username and password");
    } else if (placeholderPattern.test(parsed.username) || placeholderPattern.test(parsed.password)) {
      problems.push("DATABASE_URL must not contain placeholder credentials");
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
