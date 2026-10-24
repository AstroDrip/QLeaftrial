import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { clearRateLimit, consumeRateLimit } from "../src/lib/rate-limit";

const policy = {
  limiter: "test-policy",
  clientKey: "203.0.113.8",
  limit: 2,
  windowMs: 60_000,
  now: 1_000_000,
};

describe("database-backed rate limiting", () => {
  beforeEach(async () => {
    process.env.RATE_LIMIT_SALT = "test-only-rate-limit-salt-32-characters";
    await prisma.rateLimitBucket.deleteMany();
  });

  afterAll(async () => {
    delete process.env.RATE_LIMIT_SALT;
    await prisma.$disconnect();
  });

  it("shares attempts through persisted limiter state", async () => {
    expect(await consumeRateLimit(policy)).toMatchObject({ limited: false });
    expect(await consumeRateLimit(policy)).toMatchObject({ limited: false });
    expect(await consumeRateLimit(policy)).toEqual({ limited: true, retryAfterSeconds: 60 });
  });

  it("never persists a raw client address", async () => {
    await consumeRateLimit(policy);

    const bucket = await prisma.rateLimitBucket.findFirst();
    expect(bucket?.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bucket?.keyHash).not.toBe(policy.clientKey);
    expect(JSON.stringify(bucket)).not.toContain(policy.clientKey);
  });

  it("starts a fresh window after expiry", async () => {
    await consumeRateLimit(policy);
    await consumeRateLimit(policy);

    const decision = await consumeRateLimit({ ...policy, now: policy.now + policy.windowMs });

    expect(decision).toEqual({ limited: false, retryAfterSeconds: 60 });
    expect(await prisma.rateLimitBucket.findFirst()).toMatchObject({ attempts: 1 });
  });

  it("clears only the selected client bucket", async () => {
    await consumeRateLimit(policy);
    await consumeRateLimit({ ...policy, clientKey: "198.51.100.4" });

    await clearRateLimit(policy.limiter, policy.clientKey);

    expect(await prisma.rateLimitBucket.count()).toBe(1);
    expect(await consumeRateLimit(policy)).toMatchObject({ limited: false });
  });

  it("allows exactly the configured number under concurrent requests", async () => {
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit({ ...policy, limit: 10 })),
    );

    expect(decisions.filter((decision) => !decision.limited)).toHaveLength(10);
    expect(decisions.filter((decision) => decision.limited)).toHaveLength(10);
    expect(await prisma.rateLimitBucket.findFirst()).toMatchObject({ attempts: 10 });
  });

  it.each([undefined, "short"])(
    "rejects a missing or weak salt in production (%s)",
    async (configuredSalt) => {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousSalt = process.env.RATE_LIMIT_SALT;
      process.env.NODE_ENV = "production";
      if (configuredSalt === undefined) delete process.env.RATE_LIMIT_SALT;
      else process.env.RATE_LIMIT_SALT = configuredSalt;

      try {
        await expect(consumeRateLimit(policy)).rejects.toThrow("RATE_LIMIT_SALT");
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousSalt === undefined) delete process.env.RATE_LIMIT_SALT;
        else process.env.RATE_LIMIT_SALT = previousSalt;
      }
    },
  );
});
