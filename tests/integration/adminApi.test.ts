import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";
import { createTempPlannerFile } from "../helpers/tempPlanner.js";

describe("admin API", () => {
  it("surfaces auth metadata and keeps admin routes unavailable in json mode", async () => {
    const temp = await createTempPlannerFile();
    const app = createApp({ dataFile: temp.filePath });

    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body.storageDriver).toBe("json");
    expect(health.body.authAvailable).toBe(false);

    const response = await request(app).get("/api/admin/overview");
    expect(response.status).toBe(503);
    expect(response.body.ok).toBe(false);
    expect(response.body.message).toBeTruthy();

    await temp.cleanup();
  });
});
