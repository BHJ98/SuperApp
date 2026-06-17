import { describe, it, expect } from "vitest";
import {
  getDateRange,
  getPreviousPeriodRange,
  getSameMonthLastYear,
  formatChangePercent,
  getCategoryColor,
} from "./report-helpers";

describe("getDateRange", () => {
  const ref = new Date(2024, 5, 15); // 15 June 2024

  it("month → the previous full month", () => {
    expect(getDateRange("month", ref)).toEqual({
      start: "2024-05-01",
      end: "2024-05-31",
    });
  });

  it("quarter → the calendar quarter containing the ref date", () => {
    expect(getDateRange("quarter", ref)).toEqual({
      start: "2024-04-01",
      end: "2024-06-30",
    });
  });

  it("year → the full calendar year", () => {
    expect(getDateRange("year", ref)).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
  });
});

describe("getPreviousPeriodRange", () => {
  it("returns a window of equal length ending the day before the period", () => {
    // May 1–31 spans 30 day-deltas; the previous window ends Apr 30 and runs
    // back the same number of days (to Mar 31). It is span-aligned, not
    // calendar-month-aligned — that's the existing report behavior.
    expect(getPreviousPeriodRange("month", "2024-05-01", "2024-05-31")).toEqual({
      start: "2024-03-31",
      end: "2024-04-30",
    });
  });
});

describe("getSameMonthLastYear", () => {
  it("shifts the window back one year", () => {
    expect(getSameMonthLastYear("2024-05-01", "2024-05-31")).toEqual({
      start: "2023-05-01",
      end: "2023-05-31",
    });
  });
});

describe("formatChangePercent", () => {
  it("flags a decrease in expenses as positive", () => {
    const r = formatChangePercent(80, 100);
    expect(r.text).toBe("-20.0%");
    expect(r.isPositive).toBe(true);
  });

  it("flags an increase in expenses as negative", () => {
    const r = formatChangePercent(120, 100);
    expect(r.text).toBe("+20.0%");
    expect(r.isPositive).toBe(false);
  });

  it("guards against divide-by-zero", () => {
    expect(formatChangePercent(50, 0).text).toBe("N/A");
  });
});

describe("getCategoryColor", () => {
  it("uses the named color when known", () => {
    expect(getCategoryColor("Boodschappen", 0)).toBe("#22c55e");
  });

  it("falls back to the palette by index for unknown names", () => {
    const a = getCategoryColor("Iets Onbekends", 0);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
