import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const TRUSTED_REQUEST_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function requestIdFor(value: unknown): string {
  return typeof value === "string" && TRUSTED_REQUEST_ID.test(value)
    ? value
    : randomUUID();
}

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = requestIdFor(request.get("X-Request-Id"));
  response.locals.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
};
