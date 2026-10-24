import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOrderRateLimit,
  consumeOrderAttempt,
} from "../src/modules/orders/order-rate-limit";

describe("public order rate limit", () => {
  beforeEach(async () => clearOrderRateLimit());

  it("allows ten attempts in a fifteen-minute window and blocks the eleventh", async () => {
    const startedAt = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await consumeOrderAttempt("203.0.113.10", startedAt)).limited).toBe(false);
    }

    const blocked = await consumeOrderAttempt("203.0.113.10", startedAt);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBe(900);
  });

  it("starts a fresh window after fifteen minutes", async () => {
    const startedAt = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await consumeOrderAttempt("203.0.113.10", startedAt);
    }

    expect(
      (await consumeOrderAttempt("203.0.113.10", startedAt + 15 * 60 * 1000)).limited,
    ).toBe(false);
  });

  it("keeps an active limit after the server module is restarted", async () => {
    const startedAt = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await consumeOrderAttempt("203.0.113.10", startedAt)).limited).toBe(false);
    }

    vi.resetModules();
    const restartedLimiter = await import("../src/modules/orders/order-rate-limit");

    expect(
      (await restartedLimiter.consumeOrderAttempt("203.0.113.10", startedAt)).limited,
    ).toBe(true);
  });
});
