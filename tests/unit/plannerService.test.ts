import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPlannerData, createSamplePlannerData } from "../../src/planner/defaultData.js";
import { JsonPlannerRepository } from "../../src/planner/repository.js";
import { PlannerService } from "../../src/planner/service.js";
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

describe("planner service", () => {
  it("returns habits only for the selected home date", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const today = await service.getToday();
    const monday = await service.getToday("2026-03-20");

    expect(today.date).toBe("2026-03-22");
    expect(today.habits.map((habit) => habit.id)).toEqual([
      "habit-water",
      "habit-plan",
      "habit-focus",
    ]);
    expect(monday.habits.map((habit) => habit.id)).toEqual(["habit-water", "habit-plan"]);
  });

  it("updates habit checkins and computes streaks for count and time habits", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const updatedCount = await service.upsertHabitCheckin("2026-03-22", "habit-water", {
      value: 3,
    });
    const updatedTime = await service.upsertHabitCheckin("2026-03-22", "habit-focus", {
      value: 90,
    });

    expect(updatedCount?.isComplete).toBe(true);
    expect(updatedCount?.currentValue).toBe(3);
    expect(updatedCount?.streak).toBe(2);
    expect(updatedTime?.isComplete).toBe(true);
    expect(updatedTime?.currentValue).toBe(90);
  });

  it("reorders habits and persists the new sort order", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    await service.reorderHabits({
      habitIds: ["habit-focus", "habit-water", "habit-plan"],
    });

    const habits = await service.listHabits();
    expect(habits.habits.map((habit) => habit.id)).toEqual([
      "habit-focus",
      "habit-water",
      "habit-plan",
    ]);
  });

  it("creates routines as habit bundles with notification metadata only", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const firstHabit = await service.createHabit({
      name: "아침 스트레칭",
      trackingType: "time",
      targetCount: 10,
      color: "#16a34a",
    });

    const routine = await service.createRoutine({
      name: "아침 루틴",
      emoji: "🌤️",
      habitIds: [firstHabit!.id],
      notificationEnabled: true,
      notificationTime: "07:30",
      notificationWeekdays: [1, 2, 3, 4, 5],
    });

    expect(routine?.habits).toHaveLength(1);
    expect(routine?.notificationEnabled).toBe(true);
    expect(routine?.notificationTime).toBe("07:30");
    expect(routine?.notificationWeekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserves completedAt when editing an already completed task", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-25T09:00:00+09:00"),
    });

    const before = (await service.listTasks()).tasks.find((task) => task.id === "task-receipt")?.completedAt;
    const updated = await service.updateTask("task-receipt", {
      emoji: "✅",
      status: "done",
    });

    expect(updated?.completedAt).toBe(before);
    expect(updated?.emoji).toBe("✅");
  });

  it("aggregates statistics with top habits and task completion", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T12:00:00+09:00"),
    });

    const stats = await service.getStats("month");

    expect(stats.summary.monthlyRate).toBeGreaterThan(0);
    expect(stats.summary.topHabits[0]).toMatchObject({
      name: "오늘 우선순위 쓰기",
    });
    expect(stats.summary.taskCompletion.total).toBeGreaterThan(0);
  });
});
