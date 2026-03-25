import { describe, expect, it } from "vitest";
import { normalizeDays } from "../../src/planner/mysqlRepository.js";

describe("mysql repository helpers", () => {
  it("keeps assignment days when mysql returns a parsed json array", () => {
    expect(normalizeDays([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps assignment days when mysql returns a json string", () => {
    expect(normalizeDays("[0,6]")).toEqual([0, 6]);
  });
});
