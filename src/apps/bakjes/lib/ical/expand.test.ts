import { describe, it, expect } from "vitest";
import { parseIcs } from "./parse";
import { expandEvents } from "./expand";

const SINGLE_EVENT_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//test//NL
BEGIN:VEVENT
UID:e-single@test
DTSTAMP:20260420T080000Z
DTSTART:20260420T090000Z
DTEND:20260420T100000Z
SUMMARY:Lunch
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//test//NL
BEGIN:VEVENT
UID:e-rec@test
DTSTAMP:20260420T080000Z
DTSTART:20260420T080000Z
DTEND:20260420T083000Z
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Standup
END:VEVENT
END:VCALENDAR`;

describe("parseIcs + expandEvents", () => {
  it("importeert losse event binnen window", () => {
    const raw = parseIcs(SINGLE_EVENT_ICS);
    const events = expandEvents(
      raw,
      new Date("2026-04-20T00:00:00Z"),
      new Date("2026-04-21T00:00:00Z"),
    );
    expect(events).toHaveLength(1);
    expect(events[0].titel).toBe("Lunch");
  });

  it("filtert events buiten window", () => {
    const raw = parseIcs(SINGLE_EVENT_ICS);
    const events = expandEvents(
      raw,
      new Date("2026-05-01T00:00:00Z"),
      new Date("2026-05-08T00:00:00Z"),
    );
    expect(events).toHaveLength(0);
  });

  it("expandeert recurring event naar meerdere instances", () => {
    const raw = parseIcs(RECURRING_ICS);
    const events = expandEvents(
      raw,
      new Date("2026-04-20T00:00:00Z"),
      new Date("2026-04-25T00:00:00Z"),
    );
    expect(events.length).toBe(5);
    const uniqueUids = new Set(events.map((e) => e.uid));
    expect(uniqueUids.size).toBe(5);
  });

  it("sorteert op starttijd", () => {
    const raw = parseIcs(RECURRING_ICS);
    const events = expandEvents(
      raw,
      new Date("2026-04-20T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z"),
    );
    for (let i = 1; i < events.length; i++) {
      expect(events[i].start >= events[i - 1].start).toBe(true);
    }
  });
});
