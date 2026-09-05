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
  app.use(siteRouter);
  app.use(express.json({ limit: "3mb" }));
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/api/v1/ready", async (_request, response, next) => {
    try {
      await productRepository.count();
      response.setHeader("Cache-Control", "no-store");
      response.json({ status: "ready", database: "connected" });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/v1", apiRouter);
  app.use(errorHandler);

  return app;
}
