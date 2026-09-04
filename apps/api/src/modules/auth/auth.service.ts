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
  findFirst(args: {
    orderBy: { createdAt: "asc" };
    select: { id: true; name: true; passwordHash: true };
  }): Promise<AdminRecord | null>;
};

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
  const admin = await adminRepository.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, passwordHash: true },
  });

  if (!admin || !(await argon2.verify(admin.passwordHash, password))) {
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
