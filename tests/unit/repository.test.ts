import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPlannerData } from "../../src/planner/defaultData.js";
import { JsonPlannerRepository } from "../../src/planner/repository.js";
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

describe("json planner repository", () => {
  it("reads seeded planner data", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const repository = new JsonPlannerRepository(temp.filePath);

    const data = await repository.read();

    expect(data.routines).toHaveLength(3);
    expect(data.routineSets).toHaveLength(2);
    expect(data.todos).toHaveLength(3);
  });

  it("writes planner data updates", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const repository = new JsonPlannerRepository(temp.filePath);
    const data = createDefaultPlannerData();

    data.todos.push({
      id: "todo-new",
      title: "Write release note",
      emoji: "📝",
      note: null,
      dueDate: "2026-03-25",
      status: "pending",
      completedAt: null,
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });
    await repository.write(data);

    const nextData = await repository.read();
    expect(nextData.todos.at(-1)?.title).toBe("Write release note");
  });

  it("migrates legacy planner data into routine-set and itemProgress structures", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "my-planner-legacy-"));
    const filePath = path.join(directory, "planner-data.json");
    cleanups.push(async () => rm(directory, { recursive: true, force: true }));

    await writeFile(
      filePath,
      JSON.stringify(
        {
          routines: [
            {
              id: "routine-legacy",
              name: "Legacy Routine",
              color: "#f97316",
              activeDays: [1, 2, 3, 4, 5],
              startTime: "07:30",
              isArchived: false,
              createdAt: "2026-03-20T07:00:00.000Z",
              updatedAt: "2026-03-20T07:00:00.000Z",
            },
          ],
          routineItems: [
            {
              id: "item-legacy",
              routineId: "routine-legacy",
              title: "Drink water",
              sortOrder: 1,
              isActive: true,
            },
          ],
          routineCheckins: [
            {
              date: "2026-03-22",
              routineId: "routine-legacy",
              completedItemIds: ["item-legacy"],
              updatedAt: "2026-03-22T08:00:00.000Z",
            },
          ],
          todos: [
            {
              id: "todo-legacy",
              title: "Legacy todo",
              status: "pending",
              createdAt: "2026-03-22T08:00:00.000Z",
              updatedAt: "2026-03-22T08:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const repository = new JsonPlannerRepository(filePath);
    const data = await repository.read();

    expect(data.routineSets).toHaveLength(2);
    expect(data.routineAssignmentRules).toHaveLength(2);
    expect(data.routineDateOverrides).toEqual([]);
    expect(data.routines[0]).not.toHaveProperty("startTime");
    expect(data.routines[0].emoji).toBeNull();
    expect(data.routineItems[0].trackingType).toBe("binary");
    expect(data.routineItems[0].targetCount).toBe(1);
    expect(data.routineCheckins[0].itemProgress).toEqual({ "item-legacy": 1 });
    expect(data.todos[0]).toMatchObject({
      title: "Legacy todo",
      emoji: null,
      status: "pending",
    });
  });
});
