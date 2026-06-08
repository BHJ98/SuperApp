import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";
import { startOfWeek, addWeeks, getISOWeek, getISOWeekYear } from "date-fns";

/**
 * Compute [start, end) of a week in the given timezone.
 * Week runs Monday 00:00 → next Monday 00:00.
 */
export function weekWindow(date: Date, timezone: string): { start: Date; end: Date } {
  const local = toZonedTime(date, timezone);
  const localMonday = startOfWeek(local, { weekStartsOn: 1 });
  const localNextMonday = addWeeks(localMonday, 1);
  // Interpret local wall-clock midnight in the zone, then convert to a real UTC instant.
  const start = fromZonedTime(localMonday, timezone);
  const end = fromZonedTime(localNextMonday, timezone);
  return { start, end };
}

export function currentWeekWindow(timezone: string): { start: Date; end: Date } {
  return weekWindow(new Date(), timezone);
}

export function shiftWeek(
  window: { start: Date; end: Date },
  delta: number,
  timezone: string,
): { start: Date; end: Date } {
  return weekWindow(addWeeks(window.start, delta), timezone);
}

export function weekIsoLabel(date: Date, timezone: string): string {
  const local = toZonedTime(date, timezone);
  const year = getISOWeekYear(local);
  const week = getISOWeek(local).toString().padStart(2, "0");
  return `${year}-W${week}`;
}

export function formatDateRange(
  window: { start: Date; end: Date },
  timezone: string,
): string {
  const endMinusOne = new Date(window.end.getTime() - 1);
  const startFmt = formatTz(window.start, "d MMM", { timeZone: timezone });
  const endFmt = formatTz(endMinusOne, "d MMM yyyy", { timeZone: timezone });
  return `${startFmt} – ${endFmt}`;
}
