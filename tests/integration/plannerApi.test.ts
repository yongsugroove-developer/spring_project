import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPlannerData } from "../../src/planner/defaultData.js";
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
  it("returns habits-only today payloads and accepts explicit dates", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const today = await request(app).get("/api/today");
    expect(today.status).toBe(200);
    expect(today.body.date).toBe("2026-03-22");
    expect(today.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      "habit-water",
      "habit-plan",
      "habit-focus",
    ]);
    expect(today.body.summary.totalHabits).toBe(3);
    expect(today.body.todos).toBeUndefined();

    const selectedDate = await request(app).get("/api/today").query({ date: "2026-03-20" });
    expect(selectedDate.status).toBe(200);
    expect(selectedDate.body.date).toBe("2026-03-20");
    expect(selectedDate.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      "habit-water",
      "habit-plan",
    ]);

    const invalidDate = await request(app).get("/api/today").query({ date: "2026-03-99" });
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.ok).toBe(false);
  });

  it("supports habit CRUD, reorder, and checkin updates", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const createHabit = await request(app).post("/api/habits").send({
      name: "Morning stretch",
      emoji: "🤸",
      color: "#16a34a",
      tag: "건강",
      trackingType: "time",
      targetCount: 1,
      startDate: "2026-03-27",
    });
    expect(createHabit.status).toBe(201);
    expect(createHabit.body.habit).toMatchObject({
      name: "Morning stretch",
      emoji: "🤸",
      tag: "건강",
      trackingType: "time",
      targetCount: 1,
    });

    const habitId = createHabit.body.habit.id as string;

    const updateCheckin = await request(app)
      .put(`/api/habit-checkins/2026-03-27/habits/${habitId}`)
      .send({ action: "append-time" });
    expect(updateCheckin.status).toBe(200);
    expect(updateCheckin.body.habit.isComplete).toBe(true);

    const cancelCheckin = await request(app)
      .put(`/api/habit-checkins/2026-03-27/habits/${habitId}`)
      .send({ completed: false });
    expect(cancelCheckin.status).toBe(200);
    expect(cancelCheckin.body.habit.timeEntries).toEqual([]);
    expect(cancelCheckin.body.habit.isComplete).toBe(false);

    const secondHabit = await request(app).post("/api/habits").send({
      name: "Drink water",
      trackingType: "count",
      targetCount: 3,
      color: "#0ea5e9",
    });
    const secondHabitId = secondHabit.body.habit.id as string;

    const todayAfterCreate = await request(app).get("/api/today");
    expect(todayAfterCreate.status).toBe(200);
    expect(todayAfterCreate.body.activeMode).toMatchObject({ id: "mode-default" });
    expect(todayAfterCreate.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      habitId,
      secondHabitId,
    ]);

    const reorder = await request(app).post("/api/habits/reorder").send({
      habitIds: [secondHabitId, habitId],
    });
    expect(reorder.status).toBe(200);
    expect(reorder.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      secondHabitId,
      habitId,
    ]);

    const listHabits = await request(app).get("/api/habits");
    expect(listHabits.status).toBe(200);
    expect(listHabits.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      secondHabitId,
      habitId,
    ]);
  });

  it("supports routine bundles with notification metadata", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const createRoutine = await request(app).post("/api/routines").send({
      name: "Morning reset",
      emoji: "🌤️",
      color: "#f97316",
      habitIds: ["habit-water", "habit-plan"],
      notificationEnabled: true,
      notificationTime: "07:30",
      notificationWeekdays: [1, 2, 3, 4, 5],
    });
    expect(createRoutine.status).toBe(201);
    expect(createRoutine.body.routine.habits).toHaveLength(2);
    expect(createRoutine.body.routine.notificationEnabled).toBe(true);

    const routineId = createRoutine.body.routine.id as string;
    const updateRoutine = await request(app).patch(`/api/routines/${routineId}`).send({
      emoji: "☀️",
      habitIds: ["habit-focus"],
      notificationEnabled: false,
    });
    expect(updateRoutine.status).toBe(200);
    expect(updateRoutine.body.routine.emoji).toBe("☀️");
    expect(updateRoutine.body.routine.habits).toHaveLength(1);
    expect(updateRoutine.body.routine.notificationEnabled).toBe(false);
  });

  it("supports routine mode CRUD and date overrides", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const createMode = await request(app).post("/api/routine-modes").send({
      name: "Weekend mode",
      routineIds: [],
      habitIds: ["habit-water"],
      activeDays: [0, 6],
    });
    expect(createMode.status).toBe(201);
    expect(createMode.body.mode.habits.map((habit: { id: string }) => habit.id)).toEqual([
      "habit-water",
    ]);

    const modeId = createMode.body.mode.id as string;
    const updateOverride = await request(app)
      .put("/api/routine-mode-overrides/2026-03-22")
      .send({ modeId });
    expect(updateOverride.status).toBe(200);
    expect(updateOverride.body.override.modeId).toBe(modeId);

    const modes = await request(app).get("/api/routine-modes");
    expect(modes.status).toBe(200);
    expect(modes.body.modes.find((entry: { id: string }) => entry.id === modeId)?.reservedDates).toEqual([
      "2026-03-22",
    ]);

    const today = await request(app).get("/api/today").query({ date: "2026-03-22" });
    expect(today.status).toBe(200);
    expect(today.body.activeMode).toMatchObject({ id: modeId, name: "Weekend mode" });
    expect(today.body.habits.map((habit: { id: string }) => habit.id)).toEqual(["habit-water"]);

    const deleteMode = await request(app).delete(`/api/routine-modes/${modeId}`);
    expect(deleteMode.status).toBe(204);

    const restoredToday = await request(app).get("/api/today").query({ date: "2026-03-22" });
    expect(restoredToday.status).toBe(200);
    expect(restoredToday.body.activeMode).toMatchObject({ id: "mode-default" });
    expect(restoredToday.body.habits.map((habit: { id: string }) => habit.id)).toEqual([
      "habit-water",
      "habit-plan",
      "habit-focus",
    ]);
  });

  it("round-trips emoji fields for habits and tasks", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const createHabit = await request(app).post("/api/habits").send({
      name: "Inbox Zero",
      emoji: "🧼",
      color: "#4f46e5",
      trackingType: "binary",
    });
    expect(createHabit.status).toBe(201);
    expect(createHabit.body.habit.emoji).toBe("🧼");

    const habitId = createHabit.body.habit.id as string;
    const updateHabit = await request(app).patch(`/api/habits/${habitId}`).send({
      emoji: "🧘‍♀️",
    });
    expect(updateHabit.status).toBe(200);
    expect(updateHabit.body.habit.emoji).toBe("🧘‍♀️");

    const createTask = await request(app).post("/api/tasks").send({
      title: "Plan next sprint",
      emoji: "🏳️‍🌈",
      dueDate: "2026-03-23",
    });
    expect(createTask.status).toBe(201);
    expect(createTask.body.task.emoji).toBe("🏳️‍🌈");

    const taskId = createTask.body.task.id as string;
    const updateTask = await request(app).patch(`/api/tasks/${taskId}`).send({
      emoji: "🏴‍☠️",
      status: "done",
    });
    expect(updateTask.status).toBe(200);
    expect(updateTask.body.task.emoji).toBe("🏴‍☠️");
    const completedAt = updateTask.body.task.completedAt as string;

    const updateTaskAgain = await request(app).patch(`/api/tasks/${taskId}`).send({
      emoji: "🚀",
      status: "done",
    });
    expect(updateTaskAgain.status).toBe(200);
    expect(updateTaskAgain.body.task.completedAt).toBe(completedAt);
  });

  it("returns empty planner collections for a new empty store", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const app = createApp({
      dataFile: temp.filePath,
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const [today, habits, routines, tasks] = await Promise.all([
      request(app).get("/api/today"),
      request(app).get("/api/habits"),
      request(app).get("/api/routines"),
      request(app).get("/api/tasks"),
    ]);

    expect(today.status).toBe(200);
    expect(today.body.habits).toEqual([]);
    expect(today.body.summary).toMatchObject({
      completedHabits: 0,
      totalHabits: 0,
      remainingHabits: 0,
    });
    expect(habits.body.habits).toEqual([]);
    expect(routines.body.routines).toEqual([]);
    expect(tasks.body.tasks).toEqual([]);
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
