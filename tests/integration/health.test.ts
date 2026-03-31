import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";

describe("health route", () => {
  it("returns ok", async () => {
    const app = createApp();
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.publicBillingEnabled).toBe(false);
    expect(response.body.installGuidePath).toBe("/install");
  });
});

