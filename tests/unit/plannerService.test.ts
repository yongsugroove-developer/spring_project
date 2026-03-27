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
  it("resolves weekday and weekend assignments through routine sets", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const today = await service.getToday();

    expect(today.assignment.baseSetName).toBe("Weekend");
    expect(today.routines.map((routine) => routine.name)).toEqual(["Weekend Reset", "Focus Sprint"]);
  });

  it("returns a selected date when getToday is called with an explicit date", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const monday = await service.getToday("2026-03-23");

    expect(monday.date).toBe("2026-03-23");
    expect(monday.assignment.baseSetName).toBe("Weekday");
    expect(monday.routines.map((routine) => routine.name)).toEqual(["Weekday Launch"]);
    expect(monday.todos.dueToday).toEqual([]);
  });

  it("rejects invalid explicit dates in getToday", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    await expect(service.getToday("2026-03-99")).rejects.toThrow("date must use YYYY-MM-DD format");
  });

  it("stores itemProgress for count and time items and clamps progress to the target", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T09:00:00+09:00"),
    });

    const updated = await service.upsertCheckin("2026-03-22", "routine-weekend", {
      itemProgress: {
        "item-laundry": 1,
        "item-walk": 99,
      },
    });

    expect(updated?.progress.completedUnits).toBe(3);
    expect(updated?.progress.targetUnits).toBe(3);
    expect(updated?.items.find((item) => item.id === "item-walk")?.currentCount).toBe(2);

    const timed = await service.upsertCheckin("2026-03-22", "routine-focus", {
      itemProgress: {
        "item-focus": 999,
      },
    });

    expect(timed?.progress.completedUnits).toBe(90);
    expect(timed?.progress.targetUnits).toBe(90);
    expect(timed?.items.find((item) => item.id === "item-focus")?.trackingType).toBe("time");
    expect(timed?.items.find((item) => item.id === "item-focus")?.currentCount).toBe(90);
  });

  it("applies date overrides ahead of base assignment rules", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T12:00:00+09:00"),
    });

    await service.upsertOverride("2026-03-23", {
      setId: "set-weekday",
      includeRoutineIds: ["routine-weekend"],
      excludeRoutineIds: ["routine-weekday"],
    });

    const sunday = await service.getCheckins("2026-03-23");

    expect(sunday.assignment.baseSetId).toBe("set-weekday");
    expect(sunday.assignment.activeRoutineIds).toEqual(["routine-weekend"]);
  });

  it("marks include-only overrides as override sources and rejects overlapping override routines", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T12:00:00+09:00"),
    });

    const saturday = await service.getCheckins("2026-03-22");

    expect(saturday.assignment.source).toBe("override");
    expect(saturday.assignment.activeRoutineIds).toEqual(["routine-weekend", "routine-focus"]);

    await expect(
      service.upsertOverride("2026-03-23", {
        includeRoutineIds: ["routine-focus"],
        excludeRoutineIds: ["routine-focus"],
      }),
    ).rejects.toThrow("same routine");
  });

  it("preserves completedAt when editing an already completed todo", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-25T09:00:00+09:00"),
    });

    const before = (await service.listTodos()).todos.find((todo) => todo.id === "todo-receipt")?.completedAt;
    const updated = await service.updateTodo("todo-receipt", {
      emoji: "✅",
      status: "done",
    });

    expect(updated?.completedAt).toBe(before);
    expect(updated?.emoji).toBe("✅");
  });

  it("aggregates statistics using partial count progress", async () => {
    const temp = await createTempPlannerFile(createSamplePlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-22T12:00:00+09:00"),
    });

    const stats = await service.getStats("month");

    expect(stats.summary.monthlyRate).toBeGreaterThan(0.5);
    expect(stats.summary.monthlyRate).toBeLessThan(1);
    expect(stats.summary.topRoutines[0]).toMatchObject({
      name: "Weekday Launch",
    });
  });

  it("creates reusable task templates and links them when creating routines", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
    cleanups.push(temp.cleanup);
    const service = new PlannerService(new JsonPlannerRepository(temp.filePath), {
      now: () => new Date("2026-03-27T09:00:00+09:00"),
    });

    const template = await service.createRoutineTaskTemplate({
      title: "Morning stretch",
      trackingType: "time",
      targetCount: 10,
    });
    const routine = await service.createRoutine({
      name: "Morning reset",
      emoji: "🌤️",
      color: "#16a34a",
      taskTemplateIds: [template.id],
    });

    expect(routine?.items).toHaveLength(1);
    expect(routine?.items[0]).toMatchObject({
      templateId: template.id,
      title: "Morning stretch",
      trackingType: "time",
      targetCount: 10,
    });
  });
});
