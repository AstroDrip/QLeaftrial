import { TEST_DATABASE_URL } from "./test-database-path";

process.env.QLEAVES_SQLITE_URL = TEST_DATABASE_URL;

// Prisma reads apps/api/.env when its client starts, which would hand a developer's real email key to the tests.
// Setting these to empty first keeps them empty (a value already present is never replaced), so no test can send
// through a real account. Tests that exercise email set their own fake values.
for (const name of ["EMAIL_PROVIDER_API_KEY", "ORDER_NOTIFICATION_EMAIL", "EMAIL_FROM", "CRON_SECRET", "PUBLIC_SITE_URL"]) process.env[name] = "";
