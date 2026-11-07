import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct } from "./helpers";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const valid = {
  customerName: "Mariam Al-Kuwari",
  body: "The monstera arrived healthy and wrapped with care. It has not stopped growing since.",
  rating: 5,
};

describe("customer reviews", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("keeps the admin endpoints behind login", async () => {
    const app = createApp();
    expect((await request(app).get("/api/v1/admin/reviews")).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/reviews").send(valid)).status).toBe(401);
    expect((await request(app).delete("/api/v1/admin/reviews/x")).status).toBe(401);
  });

  it("starts empty and shows only published reviews, in the order the shop set", async () => {
    const agent = await loggedInAgent();
    const empty = await request(createApp()).get("/api/v1/reviews");
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);

    const first = (await agent.post("/api/v1/admin/reviews").send({ ...valid, published: true })).body;
    const second = (await agent.post("/api/v1/admin/reviews").send({ ...valid, customerName: "Noor Hassan", published: true })).body;
    await agent.post("/api/v1/admin/reviews").send({ ...valid, customerName: "Draft Person" });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);
    const publicList = await request(createApp()).get("/api/v1/reviews");
    // The CDN may serve it for a minute, but a browser never reuses its own copy without asking.
    expect(publicList.headers["vercel-cdn-cache-control"]).toContain("s-maxage=60");
    expect(publicList.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(publicList.body.items.map((item: { customerName: string }) => item.customerName)).toEqual(["Mariam Al-Kuwari", "Noor Hassan"]);
    expect(publicList.body.items[0]).not.toHaveProperty("published");

    const moved = await agent.post(`/api/v1/admin/reviews/${second.id}/move`).send({ direction: "up" });
    expect(moved.status).toBe(200);
    expect(moved.body.items.map((item: { customerName: string }) => item.customerName)).toEqual(["Noor Hassan", "Mariam Al-Kuwari", "Draft Person"]);
    const reordered = await request(createApp()).get("/api/v1/reviews");
    expect(reordered.body.items.map((item: { customerName: string }) => item.customerName)).toEqual(["Noor Hassan", "Mariam Al-Kuwari"]);
  });

  it("edits, publishes, unpublishes and deletes, and the public list follows each change", async () => {
    const agent = await loggedInAgent();
    const created = (await agent.post("/api/v1/admin/reviews").send({ ...valid, location: "  West Bay ", label: "" })).body;
    expect(created).toMatchObject({ published: false, location: "West Bay", label: null });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items).toHaveLength(0);

    const published = await agent.patch(`/api/v1/admin/reviews/${created.id}`).send({ published: true, rating: 4, reviewedAt: "2026-10-31" });
    expect(published.body).toMatchObject({ published: true, rating: 4, reviewedAt: "2026-10-31" });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items[0]).toMatchObject({ rating: 4, reviewedAt: "2026-10-31", location: "West Bay" });

    await agent.patch(`/api/v1/admin/reviews/${created.id}`).send({ published: false, location: null });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items).toHaveLength(0);
    expect((await agent.get("/api/v1/admin/reviews")).body.items[0]).toMatchObject({ published: false, location: null });

    expect((await agent.delete(`/api/v1/admin/reviews/${created.id}`)).status).toBe(204);
    expect((await agent.get("/api/v1/admin/reviews")).body.items).toEqual([]);
    expect((await agent.delete(`/api/v1/admin/reviews/${created.id}`)).status).toBe(404);
    expect((await agent.patch("/api/v1/admin/reviews/missing").send({ rating: 3 })).status).toBe(404);
  });

  it("rejects invalid reviews with a readable message", async () => {
    const agent = await loggedInAgent();
    for (const bad of [
      { ...valid, rating: 6 },
      { ...valid, rating: 0 },
      { ...valid, rating: 4.5 },
      { ...valid, customerName: "A" },
      { ...valid, body: "too short" },
      { ...valid, reviewedAt: "2999-01-01" },
      { ...valid, reviewedAt: "2026-02-31" },
      { ...valid, imageDataUrl: "data:text/html;base64,PGI+" },
      { ...valid, surprise: true },
    ]) {
      const response = await agent.post("/api/v1/admin/reviews").send(bad);
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await agent.post("/api/v1/admin/reviews").send({ ...valid, productId: "nope" })).status).toBe(400);
    expect((await agent.post("/api/v1/admin/reviews/x/move").send({ direction: "sideways" })).status).toBe(400);
    expect((await agent.get("/api/v1/admin/reviews")).body.items).toEqual([]);
  });

  it("stores a customer photo, replaces it and removes it", async () => {
    const agent = await loggedInAgent();
    const created = (await agent.post("/api/v1/admin/reviews").send({ ...valid, imageDataUrl: PNG, published: true })).body;
    expect(created.imageUrl).toBe(PNG);
    expect((await request(createApp()).get("/api/v1/reviews")).body.items[0].imageUrl).toBe(PNG);

    const cleared = await agent.patch(`/api/v1/admin/reviews/${created.id}`).send({ removeImage: true });
    expect(cleared.body.imageUrl).toBeNull();
    const conflict = await agent.patch(`/api/v1/admin/reviews/${created.id}`).send({ removeImage: true, imageDataUrl: PNG });
    expect(conflict.status).toBe(400);
  });

  it("links a review to a product only while that product is published", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();
    const created = (await agent.post("/api/v1/admin/reviews").send({ ...valid, productId: product.id, published: true })).body;
    expect(created).toMatchObject({ productId: product.id, productName: "House Plant" });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items[0].product).toMatchObject({ slug: "house-plant", name: "House Plant" });

    await prisma.product.update({ where: { id: product.id }, data: { published: false } });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items[0].product).toBeNull();

    await prisma.product.update({ where: { id: product.id }, data: { published: true } });
    await agent.patch(`/api/v1/admin/reviews/${created.id}`).send({ productId: null });
    expect((await request(createApp()).get("/api/v1/reviews")).body.items[0].product).toBeNull();
  });

  it("keeps the review when its product is deleted", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();
    await agent.post("/api/v1/admin/reviews").send({ ...valid, productId: product.id, published: true });

    await prisma.product.delete({ where: { id: product.id } });

    const items = (await request(createApp()).get("/api/v1/reviews")).body.items;
    expect(items).toHaveLength(1);
    expect(items[0].product).toBeNull();
  });
});
