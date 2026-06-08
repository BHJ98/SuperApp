import ICAL from "ical.js";

export interface RawEvent {
  uid: string;
  summary: string;
  description: string;
  start: ICAL.Time;
  end: ICAL.Time;
  isRecurring: boolean;
  rawEvent: ICAL.Event;
}

export function parseIcs(text: string): RawEvent[] {
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");
  const events: RawEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate || !event.endDate) continue;
    events.push({
      uid: event.uid,
      summary: event.summary ?? "",
      description: event.description ?? "",
      start: event.startDate,
      end: event.endDate,
      isRecurring: event.isRecurring(),
      rawEvent: event,
    });
  }

  return events;
}
