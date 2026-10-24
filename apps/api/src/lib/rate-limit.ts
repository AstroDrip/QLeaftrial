import { createHmac } from "node:crypto";
import { prisma } from "./prisma.js";

export type RateLimitDecision = { limited: boolean; retryAfterSeconds: number };

type RateLimitInput = {
  limiter: string;
  clientKey: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type Bucket = { attempts: number; expiresAt: Date };
type BucketRepository = {
  findUnique(args: { where: { limiter_keyHash: { limiter: string; keyHash: string } } }): Promise<Bucket | null>;
  upsert(args: {
    where: { limiter_keyHash: { limiter: string; keyHash: string } };
    create: { limiter: string; keyHash: string; attempts: number; expiresAt: Date };
    update: { attempts: number; expiresAt?: Date };
  }): Promise<Bucket>;
  deleteMany(args: { where: { limiter?: string; keyHash?: string; expiresAt?: { lte: Date } } }): Promise<unknown>;
};
type TransactionClient = { rateLimitBucket: BucketRepository };
type TransactionHost = {
  $transaction<T>(
    callback: (client: TransactionClient) => Promise<T>,
    options?: { isolationLevel?: "Serializable" },
  ): Promise<T>;
  rateLimitBucket: BucketRepository;
};

const database = prisma as unknown as TransactionHost;
const TEST_SALT = "qleaves-test-rate-limit-salt-32-bytes";
const MINIMUM_PRODUCTION_SALT_LENGTH = 32;
const transactionTails = new Map<string, Promise<void>>();

function salt(): string {
  const value = process.env.RATE_LIMIT_SALT?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!value || value.length < MINIMUM_PRODUCTION_SALT_LENGTH) {
      throw new Error(
        `RATE_LIMIT_SALT must contain at least ${MINIMUM_PRODUCTION_SALT_LENGTH} characters in production`,
      );
    }
    return value;
  }
  if (value) return value;
  return TEST_SALT;
}

function hashKey(limiter: string, clientKey: string): string {
  return createHmac("sha256", salt())
    .update(`${limiter}\0${clientKey.trim().toLowerCase()}`)
    .digest("hex");
}

function validateInput(input: RateLimitInput): void {
  if (!input.limiter.trim() || !input.clientKey.trim()) {
    throw new Error("Rate-limit names and client keys must not be empty");
  }
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("Rate-limit limits must be positive integers");
  }
  if (!Number.isInteger(input.windowMs) || input.windowMs < 1) {
    throw new Error("Rate-limit windows must be positive integers");
  }
}

async function withKeyLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = transactionTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  transactionTails.set(key, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (transactionTails.get(key) === tail) transactionTails.delete(key);
  }
}

function retryableTransactionConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2034",
  );
}

async function serializableTransaction<T>(
  callback: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await database.$transaction(callback, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt >= 4 || !retryableTransactionConflict(error)) throw error;
    }
  }
}

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  validateInput(input);
  const now = new Date(input.now ?? Date.now());
  const expiresAt = new Date(now.getTime() + input.windowMs);
  const keyHash = hashKey(input.limiter, input.clientKey);
  const where = { limiter_keyHash: { limiter: input.limiter, keyHash } };

  return withKeyLock(`${input.limiter}:${keyHash}`, () =>
    serializableTransaction(async (client) => {
      const existing = await client.rateLimitBucket.findUnique({ where });
      const active = Boolean(existing && existing.expiresAt > now);
      const attempts = active ? existing!.attempts : 0;
      const windowEnd = active ? existing!.expiresAt : expiresAt;
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));

      if (attempts >= input.limit) return { limited: true, retryAfterSeconds };

      await client.rateLimitBucket.upsert({
        where,
        create: { limiter: input.limiter, keyHash, attempts: 1, expiresAt },
        update: active ? { attempts: attempts + 1 } : { attempts: 1, expiresAt },
      });
      return { limited: false, retryAfterSeconds };
    }),
  );
}

export async function inspectRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
  validateInput(input);
  const now = new Date(input.now ?? Date.now());
  const keyHash = hashKey(input.limiter, input.clientKey);
  const existing = await database.rateLimitBucket.findUnique({
    where: { limiter_keyHash: { limiter: input.limiter, keyHash } },
  });

  if (!existing || existing.expiresAt <= now || existing.attempts < input.limit) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

export async function clearRateLimit(limiter: string, clientKey?: string): Promise<void> {
  await database.rateLimitBucket.deleteMany({
    where: clientKey ? { limiter, keyHash: hashKey(limiter, clientKey) } : { limiter },
  });
}
