import ICAL from "ical.js";
import type { AgendaEvent } from "../types";
import type { RawEvent } from "./parse";

/**
 * Expand a list of parsed ICS events into concrete AgendaEvent instances
 * that fall (even partially) within [windowStart, windowEnd).
 *
 * Handles recurring events by iterating occurrences and stopping once past the window.
 * Non-recurring events are included verbatim if they overlap the window.
 *
 * Times are converted to ISO strings in UTC; downstream code uses date-fns-tz
 * to interpret them in the configured timezone (default Europe/Amsterdam).
 */
export function expandEvents(
  rawEvents: RawEvent[],
  windowStart: Date,
  windowEnd: Date,
): AgendaEvent[] {
  const out: AgendaEvent[] = [];
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  for (const raw of rawEvents) {
    if (!raw.isRecurring) {
      const startMs = raw.start.toJSDate().getTime();
      const endMs = raw.end.toJSDate().getTime();
      if (endMs <= windowStartMs || startMs >= windowEndMs) continue;
      out.push(toAgendaEvent(raw.uid, raw.summary, raw.description, raw.start, raw.end));
      continue;
    }

    const iterator = raw.rawEvent.iterator();
    const duration = raw.end.subtractDate(raw.start);
    let next: ICAL.Time | null;
    let safety = 0;
    while ((next = iterator.next()) && safety++ < 1000) {
      const occStart = next;
      const occEnd = occStart.clone();
      occEnd.addDuration(duration);
      const occStartMs = occStart.toJSDate().getTime();
      const occEndMs = occEnd.toJSDate().getTime();
      if (occStartMs >= windowEndMs) break;
      if (occEndMs <= windowStartMs) continue;

      // Apply overrides/exceptions from the event (EXDATE/RECURRENCE-ID)
      const details = raw.rawEvent.getOccurrenceDetails(occStart);
      const startTime = details.startDate;
      const endTime = details.endDate;
      const summary = (details.item?.summary ?? raw.summary) || "";
      const description = (details.item?.description ?? raw.description) || "";
      const uid = `${raw.uid}::${occStart.toString()}`;

      out.push(toAgendaEvent(uid, summary, description, startTime, endTime));
    }
  }

  // Stable order: earliest start first.
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

function toAgendaEvent(
  uid: string,
  summary: string,
  description: string,
  start: ICAL.Time,
  end: ICAL.Time,
): AgendaEvent {
  const heelDag = start.isDate;
  const startDate = start.toJSDate();
  const endDate = end.toJSDate();
  return {
    uid,
    titel: summary,
    beschrijving: description,
    start: startDate.toISOString(),
    eind: endDate.toISOString(),
    heelDag,
  };
}
