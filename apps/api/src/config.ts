// Local server settings. The database environment is checked where the client is created
// (lib/prisma.ts), so there is exactly one place that decides between PostgreSQL and SQLite.
export const config = {
  port: Number(process.env.PORT ?? 3000),
};
