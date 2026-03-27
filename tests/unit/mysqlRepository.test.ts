import { describe, expect, it, vi } from "vitest";
import { MySqlPlannerRepository } from "../../src/planner/mysqlRepository.js";
import type { PlannerData } from "../../src/planner/types.js";

function createSeed(): PlannerData {
  return {
    habits: [
      {
        id: "habit-seed",
        name: "Seed habit",
        emoji: "🌱",
        color: "#16a34a",
        tag: "seed",
        trackingType: "binary",
        targetCount: 1,
        startDate: "2026-03-28",
        sortOrder: 1,
        createdAt: "2026-03-28T00:00:00.000Z",
        updatedAt: "2026-03-28T00:00:00.000Z",
      },
    ],
    habitCheckins: [],
    routines: [],
    tasks: [],
  };
}

describe("MySqlPlannerRepository", () => {
  it("accepts planner_documents rows when mysql returns JSON columns as objects", async () => {
    const connection = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("information_schema.tables")) {
          return [[{ 1: 1 }], []];
        }
        if (sql.includes("FROM planner_documents")) {
          return [[{ dataJson: createSeed() }], []];
        }
        return [[], []];
      }),
      release: vi.fn(),
    };

    const repository = new MySqlPlannerRepository(
      { getConnection: vi.fn(async () => connection) } as never,
      "user-1",
      createSeed,
    );

    const data = await repository.read();

    expect(data.habits[0]?.id).toBe("habit-seed");
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("falls back safely when planner_documents contains malformed JSON text", async () => {
    const connection = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("information_schema.tables") && sql.includes("LIMIT 1")) {
          return [[{ 1: 1 }], []];
        }
        if (sql.includes("FROM planner_documents")) {
          return [[{ dataJson: "[object Object]" }], []];
        }
        if (sql.includes("information_schema.tables") && sql.includes("table_name IN")) {
          return [[], []];
        }
        return [[], []];
      }),
      release: vi.fn(),
    };

    const repository = new MySqlPlannerRepository(
      { getConnection: vi.fn(async () => connection) } as never,
      "user-1",
      createSeed,
    );

    const data = await repository.read();

    expect(data.habits[0]?.id).toBe("habit-seed");
    expect(
      connection.query.mock.calls.some(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO planner_documents"),
      ),
    ).toBe(true);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
