import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { clearLoginAttempts } from "../src/modules/auth/login-rate-limit";

describe("password-only admin authentication", () => {
  beforeEach(async () => {
    clearLoginAttempts();
    await prisma.session.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
    await seedDatabase();
  });

  afterAll(() => prisma.$disconnect());

  it("logs in with only a password and never exposes credentials", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ password: "taimuomar" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authenticated: true,
      admin: { name: "QLeaves Development Admin" },
    });
    expect(JSON.stringify(response.body)).not.toContain("taimuomar");
    expect(JSON.stringify(response.body)).not.toContain("admin@qleaves.local");
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "Path=/; HttpOnly; SameSite=Lax",
    );
  });

  it("rejects an incorrect password with the public error shape", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ password: "incorrect" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      },
    });
  });

  it("requires a live session and invalidates it on logout", async () => {
    const anonymous = await request(createApp()).get("/api/v1/auth/session");
    expect(anonymous.status).toBe(401);

    const agent = request.agent(createApp());
    const login = await agent
      .post("/api/v1/auth/login")
      .send({ password: "taimuomar" });
    expect(login.status).toBe(200);

    const authenticated = await agent.get("/api/v1/auth/session");
    expect(authenticated.status).toBe(200);
    expect(authenticated.body).toEqual({
      authenticated: true,
      admin: { name: "QLeaves Development Admin" },
    });

    const logout = await agent.post("/api/v1/auth/logout");
    expect(logout.status).toBe(204);
    expect(logout.headers["set-cookie"]?.[0]).toContain(
      "qleaves_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );

    const expired = await agent.get("/api/v1/auth/session");
    expect(expired.status).toBe(401);
  });

  it("throttles repeated incorrect password attempts", async () => {
    const app = createApp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(app).post("/api/v1/auth/login").send({ password: "incorrect" })).status).toBe(401);
    }
    const throttled = await request(app).post("/api/v1/auth/login").send({ password: "incorrect" });
    expect(throttled.status).toBe(429);
    expect(throttled.body.error.code).toBe("TOO_MANY_LOGIN_ATTEMPTS");
  });
});
