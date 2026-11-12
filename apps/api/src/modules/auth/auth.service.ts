import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

type AdminRecord = {
  id: string;
  name: string;
  passwordHash: string;
};

type SessionRecord = {
  tokenHash: string;
  expiresAt: Date;
  adminUser: { name: string };
};

type AdminRepository = {
  findMany(args: {
    orderBy: { createdAt: "asc" };
    select: { id: true; name: true; passwordHash: true };
    take: number;
  }): Promise<AdminRecord[]>;
};

// The shop has a handful of admin accounts at most; a password-only login checks each of them.
const MAX_ADMIN_ACCOUNTS = 10;

type SessionRepository = {
  create(args: {
    data: {
      tokenHash: string;
      adminUserId: string;
      expiresAt: Date;
    };
  }): Promise<unknown>;
  findUnique(args: {
    where: { tokenHash: string };
    select: {
      tokenHash: true;
      expiresAt: true;
      adminUser: { select: { name: true } };
    };
  }): Promise<SessionRecord | null>;
  deleteMany(args: { where: { tokenHash?: string; expiresAt?: { lte: Date } } }): Promise<unknown>;
};

const adminRepository = prisma.adminUser as unknown as AdminRepository;
const sessionRepository = prisma.session as unknown as SessionRepository;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticatePassword(password: string): Promise<{
  token: string;
  admin: { name: string };
} | null> {
  // Every admin account is checked, not only the oldest: with two accounts (for example one re-seeded with a
  // new password) the newer password must work too. Database errors propagate and become a 503, never
  // an "Invalid credentials" answer.
  const admins = await adminRepository.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, passwordHash: true },
    take: MAX_ADMIN_ACCOUNTS,
  });

  let admin: AdminRecord | null = null;
  for (const candidate of admins) {
    if (await argon2.verify(candidate.passwordHash, password)) { admin = candidate; break; }
  }
  if (!admin) {
    return null;
  }

  await sessionRepository.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const token = randomBytes(32).toString("base64url");
  await sessionRepository.create({
    data: {
      tokenHash: hashToken(token),
      adminUserId: admin.id,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });

  return { token, admin: { name: admin.name } };
}

export async function sessionForToken(token: string | null): Promise<{
  name: string;
} | null> {
  if (!token) return null;

  const session = await sessionRepository.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      tokenHash: true,
      expiresAt: true,
      adminUser: { select: { name: true } },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await sessionRepository.deleteMany({ where: { tokenHash: session.tokenHash } });
    return null;
  }

  return session.adminUser;
}

export async function deleteSession(token: string | null): Promise<void> {
  if (!token) return;
  await sessionRepository.deleteMany({ where: { tokenHash: hashToken(token) } });
}
