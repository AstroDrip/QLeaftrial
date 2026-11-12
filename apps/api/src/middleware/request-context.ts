import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const TRUSTED_REQUEST_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function requestIdFor(value: unknown): string {
  return typeof value === "string" && TRUSTED_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}

// One structured line per API request: id, route, status, duration and (for failures) the error category.
// No query strings, bodies, cookies or headers are logged, so nothing personal or secret ends up in logs.
const logRequests = process.env.NODE_ENV !== "test";

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = requestIdFor(request.get("X-Request-Id"));
  response.locals.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  if (logRequests && request.path.startsWith("/api/")) {
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
      const line = {
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        event: "request",
        requestId,
        method: request.method,
        endpoint: request.route?.path ? `${request.baseUrl}${request.route.path}` : request.path,
        status: response.statusCode,
        durationMs,
        ...(response.statusCode >= 400 && typeof response.locals.errorCategory === "string" ? { category: response.locals.errorCategory } : {}),
      };
      console.log(JSON.stringify(line));
    });
  }
  next();
};
