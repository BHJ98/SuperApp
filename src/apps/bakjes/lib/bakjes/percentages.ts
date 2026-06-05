import type { AgendaEvent, AppData, Bakje } from "../types";
import { resolveAssignment } from "./assign";
import { toZonedTime } from "date-fns-tz";

export interface BakjeTotaal {
  bakje: Bakje;
  minuten: number;
  minutenOverloop: number;
  percentage: number;
  events: AgendaEvent[];
}

export interface PercentageReport {
  totaalMinuten: number;
  totaalMinutenOverloop: number;
  perBakje: BakjeTotaal[];
  ongecategoriseerd: {
    minuten: number;
    events: AgendaEvent[];
  };
}

interface TimeConfig {
  werkurenStart: string; // "HH:mm"
  werkurenEind: string; // "HH:mm"
  tijdzone: string;
}

function parseHM(hm: string): { u: number; m: number } {
  const [u, m] = hm.split(":").map((x) => parseInt(x, 10));
  return { u: u || 0, m: m || 0 };
}

/**
 * Compute the number of minutes an event [start, end) that falls OUTSIDE
 * the local work-hours window (werkurenStart..werkurenEind) per day it spans.
 *
 * Example with werk 07:00–21:00: an event from 21:30–22:00 in local time
 * returns 30 'overloop'-minutes. Event fully inside window → 0.
 */
export function overloopMinuten(event: AgendaEvent, config: TimeConfig): number {
  const start = new Date(event.start).getTime();
  const end = new Date(event.eind).getTime();
  if (end <= start) return 0;

  const { u: uStart, m: mStart } = parseHM(config.werkurenStart);
  const { u: uEind, m: mEind } = parseHM(config.werkurenEind);
  const workStartMinutesOfDay = uStart * 60 + mStart;
  const workEndMinutesOfDay = uEind * 60 + mEind;

  // Walk minute-by-minute is O(n); for typical events this is fine (cap < 24h = 1440).
  // For multi-day events we clamp to 14 days.
  const MAX_MINUTES = 60 * 24 * 14;
  const totalMinutes = Math.min(Math.round((end - start) / 60000), MAX_MINUTES);
  if (totalMinutes <= 0) return 0;

  let overloop = 0;
  // Sample per minute from start, checking the local minute-of-day in the configured TZ.
  // For each minute we check: is it within [workStart, workEnd)? If not → overloop.
  const step = 60000;
  for (let i = 0; i < totalMinutes; i++) {
    const instant = new Date(start + i * step);
    const local = toZonedTime(instant, config.tijdzone);
    const minOfDay = local.getHours() * 60 + local.getMinutes();
    if (minOfDay < workStartMinutesOfDay || minOfDay >= workEndMinutesOfDay) {
      overloop++;
    }
  }
  return overloop;
}

export function eventMinuten(event: AgendaEvent): number {
  const start = new Date(event.start).getTime();
  const end = new Date(event.eind).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

export interface PercentageOpties {
  /** Als true, worden overloop-minuten (buiten werkuren) afgetrokken van de totalen. */
  sluitOverloopUit?: boolean;
}

/**
 * Compute percentage breakdown per bakje for a list of events within a period.
 * All events are counted; overloop-minutes are tracked separately per bakje.
 * Set sluitOverloopUit to only count minutes within configured werkuren.
 */
export function percentagesBerekenen(
  events: AgendaEvent[],
  data: AppData,
  opties: PercentageOpties = {},
): PercentageReport {
  const config: TimeConfig = {
    werkurenStart: data.instellingen.werkurenStart,
    werkurenEind: data.instellingen.werkurenEind,
    tijdzone: data.instellingen.tijdzone,
  };
  const sluitOverloopUit = opties.sluitOverloopUit ?? false;

  const perBakje = new Map<string, BakjeTotaal>();
  for (const b of data.bakjes) {
    perBakje.set(b.id, {
      bakje: b,
      minuten: 0,
      minutenOverloop: 0,
      percentage: 0,
      events: [],
    });
  }

  let totaalMinuten = 0;
  let totaalOverloop = 0;
  const ongecat: AgendaEvent[] = [];
  let ongecatMinuten = 0;

  for (const event of events) {
    if (event.heelDag) continue; // whole-day events don't count (Grootenboer focuses on actual work)
    const min = eventMinuten(event);
    if (min === 0) continue;
    const overloop = overloopMinuten(event, config);
    const telMin = sluitOverloopUit ? Math.max(0, min - overloop) : min;

    totaalMinuten += telMin;
    totaalOverloop += overloop;

    const { bakjeId } = resolveAssignment(event, data);
    if (!bakjeId) {
      ongecat.push(event);
      ongecatMinuten += telMin;
      continue;
    }
    const entry = perBakje.get(bakjeId);
    if (!entry) continue;
    entry.minuten += telMin;
    entry.minutenOverloop += overloop;
    entry.events.push(event);
  }

  const perBakjeArr = Array.from(perBakje.values());
  for (const entry of perBakjeArr) {
    entry.percentage = totaalMinuten > 0 ? (entry.minuten / totaalMinuten) * 100 : 0;
  }
  perBakjeArr.sort((a, b) => b.minuten - a.minuten);

  return {
    totaalMinuten,
    totaalMinutenOverloop: totaalOverloop,
    perBakje: perBakjeArr,
    ongecategoriseerd: { minuten: ongecatMinuten, events: ongecat },
  };
}

export function formatteerUren(minuten: number): string {
  const u = Math.floor(minuten / 60);
  const m = minuten % 60;
  if (u === 0) return `${m}m`;
  if (m === 0) return `${u}u`;
  return `${u}u ${m}m`;
}
