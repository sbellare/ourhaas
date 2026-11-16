import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityEvent } from "@workspace/api-client-react";
import { parseDay, splitEvents, todayDay, toDay } from "./haas";

const event = (id: number, date: string): CommunityEvent => ({
  id, date, title: `Event ${id}`, time: "", location: "", description: "", category: "Community",
});

afterEach(() => vi.useRealTimers());

describe("calendar-day helpers", () => {
  it.each([
    "2024-02-29", "2000-02-29", "2031-12-31", "2032-01-01",
    "2032-03-14", "2032-11-07", "2032-07-04",
  ])("preserves %s as local midnight without a UTC day shift", (day) => {
    const date = parseDay(day);
    const [year, month, dateOfMonth] = day.split("-").map(Number);
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()])
      .toEqual([year, month, dateOfMonth, 0]);
    expect(toDay(date)).toBe(day);
  });

  it("formats the selected local date rather than its UTC representation", () => {
    expect(toDay(new Date(2032, 1, 29, 23, 30))).toBe("2032-02-29");
    expect(toDay(new Date(2031, 11, 31, 23, 59))).toBe("2031-12-31");
  });

  it.each([
    [new Date(2031, 11, 31, 23, 59, 59), "2031-12-31"],
    [new Date(2032, 0, 1, 0, 0, 0), "2032-01-01"],
    [new Date(2032, 1, 29, 23, 59, 59), "2032-02-29"],
    [new Date(2032, 2, 1, 0, 0, 0), "2032-03-01"],
  ] as const)("uses the local calendar day at %s", (now, expected) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    expect(todayDay()).toBe(expected);
  });

  it("classifies today as upcoming through local midnight and sorts without mutating input", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 11, 31, 23, 59, 59));
    const rows = [event(1, "2032-01-01"), event(2, "2031-12-30"), event(3, "2031-12-31"), event(4, "2031-01-01")];
    const original = structuredClone(rows);
    expect(splitEvents(rows)).toEqual({ upcoming: [rows[2], rows[0]], past: [rows[1], rows[3]] });
    vi.setSystemTime(new Date(2032, 0, 1));
    expect(splitEvents(rows)).toEqual({ upcoming: [rows[0]], past: [rows[2], rows[1], rows[3]] });
    expect(rows).toEqual(original);
  });

  it("classifies a leap day correctly before and after midnight", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const leap = event(1, "2032-02-29");
    vi.setSystemTime(new Date(2032, 1, 29, 23, 59));
    expect(splitEvents([leap])).toEqual({ upcoming: [leap], past: [] });
    vi.setSystemTime(new Date(2032, 2, 1));
    expect(splitEvents([leap])).toEqual({ upcoming: [], past: [leap] });
  });

  it("handles missing and empty event lists", () => {
    expect(splitEvents(undefined)).toEqual({ upcoming: [], past: [] });
    expect(splitEvents([])).toEqual({ upcoming: [], past: [] });
  });
});
