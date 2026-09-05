import { Router } from "express";
import { buildSitemap } from "./sitemap.service.js";

export const sitemapRouter = Router();

sitemapRouter.get("/sitemap.xml", async (request, response) => {
  response.type("application/xml");
  try {
    const sitemap = await buildSitemap();
    response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    response.send(sitemap);
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    console.error(JSON.stringify({
      level: "error",
      event: "sitemap-generation-failed",
      requestId: response.locals.requestId,
      method: request.method,
      pathname: request.path,
      error: {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      },
    }));
    response.status(503).send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Sitemap temporarily unavailable</error>',
    );
  }
});
