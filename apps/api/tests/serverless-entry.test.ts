import request from "supertest";
import { describe, expect, it } from "vitest";
import serverlessApp from "../../../api/index";

 describe("Vercel serverless entry", () => {
  it("exports the existing Express app and handles the public health route", async () => {
    expect(typeof serverlessApp).toBe("function");
    const response = await request(serverlessApp).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
