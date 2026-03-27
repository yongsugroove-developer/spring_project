import { describe, expect, it, vi } from "vitest";
import { ensureMySqlSchema } from "../../src/db/mysql.js";

describe("ensureMySqlSchema", () => {
  it("creates the planner document snapshot table", async () => {
    const query = vi.fn(async () => [[], []]);

    await ensureMySqlSchema({ query } as never);
    const calls = query.mock.calls as unknown[][];

    expect(
      calls.some(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("CREATE TABLE IF NOT EXISTS planner_documents"),
      ),
    ).toBe(true);
  });

  it("still checks legacy routine item columns through information_schema", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.columns")) {
        return [[{ 1: 1 }], []];
      }
      return [[], []];
    });

    await ensureMySqlSchema({ query } as never);
    const calls = query.mock.calls as unknown[][];

    expect(
      calls.some(
        (call) => typeof call[0] === "string" && call[0].includes("information_schema.columns"),
      ),
    ).toBe(true);
  });
});
