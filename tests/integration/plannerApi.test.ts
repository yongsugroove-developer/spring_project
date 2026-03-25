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
      emoji: "☀️",
      color: "#7c3aed",
    });
    expect(createRoutine.status).toBe(201);
    expect(createRoutine.body.routine.emoji).toBe("☀️");
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

  it("accepts checkins for an existing routine even when it is not in the resolved set for that date", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const response = await request(app)
      .put("/api/checkins/2026-03-22/routines/routine-weekday")
      .send({
        itemProgress: {
          "item-plan": 1,
          "item-water": 2,
          "item-inbox": 1,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.routine.id).toBe("routine-weekday");
    expect(response.body.routine.progress.completedItemCount).toBe(2);
  });

  it("rejects overlapping include and exclude overrides", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const response = await request(app).put("/api/overrides/2026-03-22").send({
      includeRoutineIds: ["routine-focus"],
      excludeRoutineIds: ["routine-focus"],
    });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
  });

  it("round-trips emoji fields for routines and todos", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const createRoutine = await request(app).post("/api/routines").send({
      name: "Inbox Zero",
      emoji: "📥",
      color: "#4f46e5",
    });
    expect(createRoutine.status).toBe(201);
    expect(createRoutine.body.routine).toMatchObject({
      name: "Inbox Zero",
      emoji: "📥",
    });

    const routineId = createRoutine.body.routine.id as string;
    const updateRoutine = await request(app).patch(`/api/routines/${routineId}`).send({
      emoji: "⚡",
    });
    expect(updateRoutine.status).toBe(200);
    expect(updateRoutine.body.routine.emoji).toBe("⚡");

    const createTodo = await request(app).post("/api/todos").send({
      title: "Plan next sprint",
      emoji: "📝",
      dueDate: "2026-03-23",
    });
    expect(createTodo.status).toBe(201);
    expect(createTodo.body.todo.emoji).toBe("📝");

    const todoId = createTodo.body.todo.id as string;
    const updateTodo = await request(app).patch(`/api/todos/${todoId}`).send({
      emoji: "✅",
      status: "done",
    });
    expect(updateTodo.status).toBe(200);
    expect(updateTodo.body.todo).toMatchObject({
      emoji: "✅",
      status: "done",
    });
    const completedAt = updateTodo.body.todo.completedAt as string;

    const updateTodoAgain = await request(app).patch(`/api/todos/${todoId}`).send({
      emoji: "🎉",
      status: "done",
    });
    expect(updateTodoAgain.status).toBe(200);
    expect(updateTodoAgain.body.todo.completedAt).toBe(completedAt);
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
