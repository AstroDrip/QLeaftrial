import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/error-handler";
import { requestContext } from "../src/middleware/request-context";

describe("safe request diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("correlates a generic error without logging request data", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.use(requestContext);
    app.get("/api/v1/test-error", (_request, _response, next) => {
      next(new Error("database temporarily unavailable"));
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/api/v1/test-error?email=customer@example.com")
      .set("X-Request-Id", "support_123")
      .set("Cookie", "qleaves_admin=secret-session");

    expect(response.status).toBe(500);
    expect(response.headers["x-request-id"]).toBe("support_123");
    expect(response.body.error).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId: "support_123",
    });

    const logLine = String(errorLog.mock.calls[0]?.[0]);
    expect(() => JSON.parse(logLine)).not.toThrow();
    expect(JSON.parse(logLine)).toMatchObject({
      level: "error",
      requestId: "support_123",
      method: "GET",
      pathname: "/api/v1/test-error",
      error: {
        name: "Error",
        message: "database temporarily unavailable",
      },
    });
    expect(logLine).not.toContain("customer@example.com");
    expect(logLine).not.toContain("secret-session");
  });
});
