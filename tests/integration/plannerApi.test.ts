import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";
import { createTempPlannerFile } from "../helpers/tempPlanner.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop();
    if (cleanup) {
      await cleanup();
    }
  }
});

describe("planner API", () => {
  it("supports routine sets, assignments, and date overrides", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const createRoutine = await request(app).post("/api/routines").send({
      name: "Sunday Special",
      color: "#7c3aed",
    });
    expect(createRoutine.status).toBe(201);
    const routineId = createRoutine.body.routine.id as string;

    const createSet = await request(app).post("/api/routine-sets").send({
      name: "Special Sunday",
      routineIds: [routineId],
    });
    expect(createSet.status).toBe(201);
    const setId = createSet.body.routineSet.id as string;

    const assignments = await request(app).put("/api/assignments").send({
      assignments: [
        { ruleType: "weekday", setId: "set-weekday" },
        { ruleType: "weekend", setId: setId },
      ],
    });
    expect(assignments.status).toBe(200);

    const override = await request(app).put("/api/overrides/2026-03-22").send({
      includeRoutineIds: ["routine-focus"],
      excludeRoutineIds: [],
      setId: setId,
    });
    expect(override.status).toBe(200);
    expect(override.body.resolvedAssignment.baseSetId).toBe(setId);

    const today = await request(app).get("/api/today");
    expect(today.status).toBe(200);
    expect(today.body.assignment.baseSetId).toBe(setId);
  });

  it("supports count-based and time-based checkins and updated statistics", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const checkin = await request(app)
      .put("/api/checkins/2026-03-22/routines/routine-weekend")
      .send({
        itemProgress: {
          "item-laundry": 1,
          "item-walk": 2,
        },
      });
    expect(checkin.status).toBe(200);
    expect(checkin.body.routine.progress.rate).toBe(1);

    const calendar = await request(app).get("/api/calendar").query({ month: "2026-03" });
    expect(calendar.status).toBe(200);
    expect(calendar.body.days.find((day: { date: string }) => day.date === "2026-03-22")).toBeTruthy();

    const stats = await request(app).get("/api/stats").query({ range: "month" });
    expect(stats.status).toBe(200);
    expect(stats.body.summary.monthlyRate).toBeGreaterThan(0);

    const timeItem = await request(app)
      .post("/api/routines/routine-weekend/items")
      .send({
        title: "Read quietly",
        trackingType: "time",
        targetCount: 30,
      });

    expect(timeItem.status).toBe(201);
    expect(timeItem.body.item.trackingType).toBe("time");
  });

  it("returns localized JSON for unknown API routes", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const response = await request(app)
      .get("/api/does-not-exist")
      .set("Accept-Language", "en-US");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      message: "API route not found",
    });
  });
});
