import { describe, expect, it } from "vitest";
import { ApiClientError, errorFromResponse } from "./api-error";

describe("API client errors", () => {
  it("includes a support reference for unexpected server failures", async () => {
    const error = await errorFromResponse(new Response(JSON.stringify({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
        requestId: "support_123",
      },
    }), { status: 500, headers: { "Content-Type": "application/json" } }));

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.message).toBe("An unexpected error occurred Reference: support_123");
    expect(error.requestId).toBe("support_123");
  });

  it("does not expose a reference for expected validation failures", async () => {
    const error = await errorFromResponse(new Response(JSON.stringify({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid order details",
        requestId: "internal_456",
      },
    }), { status: 400, headers: { "Content-Type": "application/json" } }));

    expect(error.message).toBe("Invalid order details");
    expect(error.requestId).toBeUndefined();
  });
});
