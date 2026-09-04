import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOrderRateLimit,
  consumeOrderAttempt,
} from "../src/modules/orders/order-rate-limit";

describe("public order rate limit", () => {
  beforeEach(() => clearOrderRateLimit());

  it("allows ten attempts in a fifteen-minute window and blocks the eleventh", () => {
    const startedAt = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(consumeOrderAttempt("203.0.113.10", startedAt).limited).toBe(false);
    }

    const blocked = consumeOrderAttempt("203.0.113.10", startedAt);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBe(900);
  });

  it("starts a fresh window after fifteen minutes", () => {
    const startedAt = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      consumeOrderAttempt("203.0.113.10", startedAt);
    }

    expect(consumeOrderAttempt("203.0.113.10", startedAt + 15 * 60 * 1000).limited).toBe(false);
  });
});
