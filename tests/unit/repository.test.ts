import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPlannerData, createSamplePlannerData } from "../../src/planner/defaultData.js";
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

    expect(data.habits).toHaveLength(3);
    expect(data.routines).toHaveLength(2);
    expect(data.tasks).toHaveLength(3);
  });

  it("writes planner data updates", async () => {
    const temp = await createTempPlannerFile();
    cleanups.push(temp.cleanup);
    const repository = new JsonPlannerRepository(temp.filePath);
    const data = createSamplePlannerData();

    data.tasks.push({
      id: "task-new",
      title: "출시 노트 쓰기",
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
    expect(nextData.tasks.at(-1)?.title).toBe("출시 노트 쓰기");
  });

  it("migrates legacy routine/template/todo data into habits, routines, and tasks", async () => {
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
              emoji: "🌅",
              color: "#f97316",
              createdAt: "2026-03-20T07:00:00.000Z",
              updatedAt: "2026-03-20T07:00:00.000Z",
            },
          ],
          routineTaskTemplates: [
            {
              id: "template-bonus",
              title: "Bonus habit",
              trackingType: "count",
              targetCount: 2,
              createdAt: "2026-03-20T07:00:00.000Z",
              updatedAt: "2026-03-20T07:00:00.000Z",
            },
          ],
          routineItems: [
            {
              id: "item-legacy",
              routineId: "routine-legacy",
              title: "Drink water",
              trackingType: "binary",
              sortOrder: 1,
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

    expect(data.habits.map((habit) => habit.id)).toContain("item-legacy");
    expect(data.habits.map((habit) => habit.id)).toContain("template-bonus");
    expect(data.habits.find((habit) => habit.id === "item-legacy")).toMatchObject({
      name: "Drink water",
      trackingType: "binary",
      targetCount: 1,
      emoji: "🌅",
    });
    expect(data.habitCheckins).toEqual([
      {
        date: "2026-03-22",
        habitId: "item-legacy",
        value: 1,
        updatedAt: "2026-03-22T08:00:00.000Z",
      },
    ]);
    expect(data.routines[0].habitIds).toEqual(["item-legacy"]);
    expect(data.tasks[0]).toMatchObject({
      id: "todo-legacy",
      title: "Legacy todo",
      status: "pending",
    });
  });

  it("uses empty runtime defaults when no file exists", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "my-planner-empty-"));
    const filePath = path.join(directory, "planner-data.json");
    cleanups.push(async () => rm(directory, { recursive: true, force: true }));

    const repository = new JsonPlannerRepository(filePath, createDefaultPlannerData);
    const data = await repository.read();

    expect(data).toEqual(createDefaultPlannerData());
  });
});
