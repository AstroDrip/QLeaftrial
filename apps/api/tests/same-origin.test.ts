import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct } from "./helpers";

// Admin changes only from the QLeaves site: a page on another site cannot use the admin's cookie to change things.
describe("same-origin check on admin and sign-in changes", () => {
  const environment = process.env.NODE_ENV;
  beforeEach(resetDatabase);
  afterEach(() => { process.env.NODE_ENV = environment; });
  afterAll(() => prisma.$disconnect());

  it("refuses an admin change sent from another site, and allows the QLeaves site, localhost in development and scripts", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();
    const patch = (headers: Record<string, string>) => {
      let call = agent.patch(`/api/v1/admin/products/${product.id}`);
      for (const [key, value] of Object.entries(headers)) call = call.set(key, value);
      return call.send({ stock: 3 });
    };

    const foreign = await patch({ Origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("FORBIDDEN_ORIGIN");
    expect((await patch({ Referer: "https://evil.example/page" })).status).toBe(403);
    expect((await patch({ Origin: "null" })).status).toBe(403);

    expect((await patch({ Origin: "https://qleaves.qa" })).status).toBe(200);
    expect((await patch({ Origin: "http://localhost:5173" })).status).toBe(200);
    expect((await patch({})).status).toBe(200);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity).toBe(3);
  });

  it("does not trust localhost in production, but trusts the site's own host", async () => {
    process.env.NODE_ENV = "production";
    const app = createApp();
    const fromLocalhost = await request(app).post("/api/v1/auth/logout").set("Origin", "http://localhost:5173").set("Host", "qleaves.qa");
    expect(fromLocalhost.status).toBe(403);
    const ownHost = await request(app).post("/api/v1/auth/logout").set("Origin", "https://preview-abc.vercel.app").set("X-Forwarded-Host", "preview-abc.vercel.app");
    expect(ownHost.status).not.toBe(403);
  });

  it("leaves reading and public routes alone", async () => {
    const product = await seededProduct("snake-plant");
    expect((await request(createApp()).get(`/api/v1/products/${product.slug}`).set("Origin", "https://evil.example")).status).toBe(200);
    const agent = await loggedInAgent();
    expect((await agent.get("/api/v1/admin/products").set("Origin", "https://evil.example")).status).toBe(200);
  });
});
