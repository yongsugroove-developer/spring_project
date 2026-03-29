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
      action: "append-time",
    });

    expect(updatedCount?.isComplete).toBe(true);
    expect(updatedCount?.currentValue).toBe(3);
    expect(updatedCount?.streak).toBe(2);
    expect(updatedTime?.isComplete).toBe(true);
    expect(updatedTime?.currentValue).toBe(2);
    expect(updatedTime?.timeEntries).toHaveLength(2);
  });

  it("removes time entries from time-tracked habits", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T21:00:00+09:00"),
    });

    const updatedTime = await service.upsertHabitCheckin("2026-03-22", "habit-focus", {
      action: "remove-time",
      entryIndex: 0,
    });

    expect(updatedTime?.currentValue).toBe(0);
    expect(updatedTime?.timeEntries).toEqual([]);
    expect(updatedTime?.isComplete).toBe(false);
  });

  it("toggles time habits with a single visible timestamp", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const habit = await service.createHabit({
      name: "운동하기",
      trackingType: "time",
      targetCount: 1,
      color: "#2563eb",
    });

    const logged = await service.upsertHabitCheckin("2026-03-27", habit!.id, {
      completed: true,
    });
    expect(logged?.timeEntries).toHaveLength(1);
    expect(logged?.isComplete).toBe(true);

    const cancelled = await service.upsertHabitCheckin("2026-03-27", habit!.id, {
      completed: false,
    });
    expect(cancelled?.timeEntries).toEqual([]);
    expect(cancelled?.isComplete).toBe(false);
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

  it("auto-adds new habits to mode-default when it already exists", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const firstHabit = await service.createHabit({
      name: "아침 일찍 일어나기",
      trackingType: "binary",
      color: "#16a34a",
    });
    const secondHabit = await service.createHabit({
      name: "운동하기",
      trackingType: "time",
      targetCount: 1,
      color: "#2563eb",
    });

    const modes = await service.listRoutineModes();
    expect(modes.modes).toHaveLength(1);
    expect(modes.modes[0]).toMatchObject({ id: "mode-default" });
    expect(modes.modes[0]?.habits.map((habit) => habit.id)).toEqual([firstHabit?.id, secondHabit?.id]);

    const today = await service.getToday("2026-03-27");
    expect(today.activeMode?.id).toBe("mode-default");
    expect(today.habits.map((habit) => habit.id)).toEqual([firstHabit?.id, secondHabit?.id]);
  });

  it("applies date overrides to routine modes", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const mode = await service.createRoutineMode({
      name: "Weekend mode",
      routineIds: [],
      habitIds: ["habit-water"],
      activeDays: [0, 6],
    });
    expect(mode?.habits.map((habit) => habit.id)).toEqual(["habit-water"]);

    const override = await service.upsertRoutineModeOverride("2026-03-22", {
      modeId: mode?.id,
    });
    expect(override.override?.modeId).toBe(mode?.id);

    const modes = await service.listRoutineModes();
    expect(modes.modes.find((entry) => entry.id === mode?.id)?.reservedDates).toEqual(["2026-03-22"]);

    const today = await service.getToday("2026-03-22");
    expect(today.activeMode?.id).toBe(mode?.id);
    expect(today.habits.map((habit) => habit.id)).toEqual(["habit-water"]);

    const fallbackToday = await service.getToday("2026-03-23");
    expect(fallbackToday.activeMode?.id).toBe("mode-default");
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
