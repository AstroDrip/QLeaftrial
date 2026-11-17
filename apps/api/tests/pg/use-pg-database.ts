import { randomUUID } from "node:crypto";
import { PG_TEST_URL } from "./global-setup";

// Every module in this run talks to the throwaway PostgreSQL started by global-setup.ts, with a pool large enough for
// orders to really run at the same time. Email and other outside services are switched off.
process.env.QLEAVES_DATABASE_PROVIDER = "postgresql";
process.env.DATABASE_URL = PG_TEST_URL;
process.env.DIRECT_URL = PG_TEST_URL;
process.env.DB_POOL_MAX = "5";
// The seed requires its own admin password for PostgreSQL (never the development one). This throwaway database gets a
// random one for the run, and the test helpers log in with it.
process.env.QLEAVES_ADMIN_SEED_PASSWORD ||= `pg-test-${randomUUID()}`;
for (const name of ["EMAIL_PROVIDER_API_KEY", "ORDER_NOTIFICATION_EMAIL", "EMAIL_FROM", "CRON_SECRET", "PUBLIC_SITE_URL", "GOOGLE_SHEETS_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]) process.env[name] = "";
