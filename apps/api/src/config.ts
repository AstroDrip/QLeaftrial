export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const provider = process.env.QLEAVES_DATABASE_PROVIDER;

  if (isProduction) {
    if (provider !== "postgresql") {
      throw new Error(
        "Production requires QLEAVES_DATABASE_PROVIDER=postgresql",
      );
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("Production requires DATABASE_URL");
    }

    if (databaseUrl.trim().startsWith("file:")) {
      throw new Error("SQLite file: URLs are not permitted in production");
    }

    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
        throw new Error("DATABASE_URL must use postgresql: or postgres: protocol");
      }
      if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
        throw new Error("DATABASE_URL must specify a host and database name");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("DATABASE_URL")) {
        throw error;
      }
      throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
    }
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  validate: validateEnvironment,
};

