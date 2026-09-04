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

if (problems.length) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  process.exit(1);
}

console.log("Vercel runtime environment check passed");
