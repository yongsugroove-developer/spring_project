import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPlannerData } from "../../src/planner/defaultData.js";
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
    const temp = await createTempPlannerFile(createDefaultPlannerData());
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

  it("aggregates statistics using partial count progress", async () => {
    const temp = await createTempPlannerFile(createDefaultPlannerData());
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
});
