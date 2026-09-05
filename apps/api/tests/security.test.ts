import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { clearRateLimit } from "../src/lib/rate-limit";

describe("CSP report ingestion", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearRateLimit("csp-report");
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  it("accepts a bounded legacy report and removes secrets from URIs", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await request(createApp())
      .post("/api/v1/security/csp-report")
      .set("Content-Type", "application/csp-report")
      .set("X-Request-Id", "csp_report-1")
      .send(JSON.stringify({
        "csp-report": {
          "document-uri": "https://qleaves.qa/shop?customer=aisha#cart",
          "blocked-uri": "https://cdn.example/x.js?token=secret#fragment",
          "effective-directive": "script-src-elem",
          disposition: "report",
          "status-code": 200,
          ignored: "must-not-be-logged",
        },
      }));

    expect(response.status).toBe(204);
    const logLine = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(logLine)).toMatchObject({
      event: "csp-report",
      requestId: "csp_report-1",
      report: {
        documentUri: "https://qleaves.qa/shop",
        blockedUri: "https://cdn.example/x.js",
        effectiveDirective: "script-src-elem",
        disposition: "report",
        statusCode: 200,
      },
    });
    expect(logLine).not.toContain("customer=aisha");
    expect(logLine).not.toContain("token=secret");
    expect(logLine).not.toContain("must-not-be-logged");
  });

  it("accepts Reporting API arrays", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await request(createApp())
      .post("/api/v1/security/csp-report")
      .set("Content-Type", "application/reports+json")
      .send(JSON.stringify([{
        type: "csp-violation",
        body: {
          documentURL: "https://qleaves.qa/",
          blockedURL: "https://bad.example/script.js?private=yes",
          effectiveDirective: "script-src-elem",
          disposition: "report",
          statusCode: 200,
        },
      }]));

    expect(response.status).toBe(204);
    expect(String(log.mock.calls[0]?.[0])).not.toContain("private=yes");
  });

  it("rejects reports larger than 16 KiB", async () => {
    const response = await request(createApp())
      .post("/api/v1/security/csp-report")
      .set("Content-Type", "application/csp-report")
      .send("x".repeat(16 * 1024 + 1));

    expect(response.status).toBe(413);
  });
});
