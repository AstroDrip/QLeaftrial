import { fileURLToPath } from "node:url";

// Separate from prisma/dev.db, which holds the developer's local admin and catalogue.
export const TEST_DATABASE_FILE = fileURLToPath(new URL("../prisma/test.db", import.meta.url));
export const TEST_DATABASE_URL = `file:${TEST_DATABASE_FILE.replaceAll("\\", "/")}`;
