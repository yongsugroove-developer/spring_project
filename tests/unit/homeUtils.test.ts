import { describe, expect, it } from "vitest";
import { buildWeekDates, buildTodayRoute, parseHashRoute } from "../../public/homeUtils.js";

describe("home utils", () => {
  it("builds a monday-start week strip for a selected date", () => {
    expect(buildWeekDates("2026-03-27")).toEqual([
      "2026-03-23",
      "2026-03-24",
      "2026-03-25",
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
    ]);
  });

  it("parses a today hash route with a selected date", () => {
    expect(parseHashRoute("/today?date=2026-03-27")).toEqual({
      pathname: "/today",
      date: "2026-03-27",
    });
    expect(buildTodayRoute("2026-03-27")).toBe("/today?date=2026-03-27");
  });

  it("drops invalid selected dates from the hash route", () => {
    expect(parseHashRoute("/today?date=2026-03-99")).toEqual({
      pathname: "/today",
      date: "",
    });
    expect(buildTodayRoute("2026-03-99")).toBe("/today");
  });
});
