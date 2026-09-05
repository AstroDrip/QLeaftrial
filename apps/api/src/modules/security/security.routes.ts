import express, { Router } from "express";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { ApiError } from "../../middleware/error-handler.js";
import { parseCspReports } from "./csp-report.js";

const REPORT_LIMIT = 30;
const REPORT_WINDOW_MS = 60_000;

export const securityRouter = Router();

securityRouter.post(
  "/security/csp-report",
  express.text({
    type: ["application/csp-report", "application/reports+json"],
    limit: "16kb",
  }),
  async (request, response) => {
    const clientKey = request.ip || request.socket.remoteAddress || "unknown";
    let decision;
    try {
      decision = await consumeRateLimit({
        limiter: "csp-report",
        clientKey,
        limit: REPORT_LIMIT,
        windowMs: REPORT_WINDOW_MS,
      });
    } catch {
      throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Report service is temporarily unavailable");
    }

    if (decision.limited) {
      response.setHeader("Retry-After", String(decision.retryAfterSeconds));
      response.status(429).end();
      return;
    }

    for (const report of parseCspReports(request.body)) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "csp-report",
        requestId: response.locals.requestId,
        report,
      }));
    }

    response.status(204).end();
  },
);
