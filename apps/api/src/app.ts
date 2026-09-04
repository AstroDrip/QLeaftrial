import express, { type Express } from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes.js";

export function createApp(): Express {
  const app = express();

  // Production is deployed behind one trusted reverse proxy; local requests
  // use their socket address and cannot spoof X-Forwarded-For.
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

  app.use(express.json());
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.use("/api/v1", apiRouter);
  app.use(errorHandler);

  return app;
}
