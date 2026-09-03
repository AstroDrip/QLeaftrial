import express, { type Express } from "express";

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  return app;
}
