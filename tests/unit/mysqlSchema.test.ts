import { describe, expect, it, vi } from "vitest";
import { ensureMySqlSchema } from "../../src/db/mysql.js";

describe("ensureMySqlSchema", () => {
  it("adds the template_id column when a legacy routine items table is missing it", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) {
        return [[], []];
      }

      return [[], []];
    });

    await ensureMySqlSchema({ query } as never);

    expect(
      query.mock.calls.some(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("ALTER TABLE `planner_routine_items` ADD COLUMN `template_id` VARCHAR(36) NULL AFTER `routine_id`"),
      ),
    ).toBe(true);
  });

  it("skips the template_id migration when the column already exists", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) {
        return [[{ 1: 1 }], []];
      }

      return [[], []];
    });

    await ensureMySqlSchema({ query } as never);

    expect(
      query.mock.calls.some(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("ALTER TABLE `planner_routine_items` ADD COLUMN `template_id`"),
      ),
    ).toBe(false);
  });
});
