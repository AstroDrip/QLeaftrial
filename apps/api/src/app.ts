import compression from "compression";
import express, { type Express } from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { apiRouter, siteRouter } from "./routes.js";
import { prisma } from "./lib/prisma.js";
import { requestContext } from "./middleware/request-context.js";

const productRepository = prisma.product as unknown as {
  count(): Promise<number>;
};

export function createApp(): Express {
  const app = express();

  // Production is deployed behind one trusted reverse proxy; local requests
  // use their socket address and cannot spoof X-Forwarded-For.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

  app.use(requestContext);
  app.use(compression({ threshold: 1024 }));
  app.use(siteRouter);
  app.use(express.json({ limit: "3mb" }));
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/api/v1/ready", async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const checkPromise = productRepository.count();
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Database readiness timeout")), 5000);
      });
      await Promise.race([checkPromise, timeoutPromise]);
      response.json({ status: "ready", database: "connected" });
    } catch (error) {
      const requestId = typeof response.locals.requestId === "string"
        ? response.locals.requestId
        : undefined;

      console.error(JSON.stringify({
        level: "error",
        requestId,
        endpoint: "/api/v1/ready",
        error: error instanceof Error ? error.message : String(error),
      }));

      response.status(503).json({
        status: "unavailable",
        database: "disconnected",
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database connection failed",
          ...(requestId ? { requestId } : {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  });
  app.use("/api/v1", apiRouter);
  app.use(errorHandler);

  return app;
}
