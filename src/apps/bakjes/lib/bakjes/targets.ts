import type { AgendaEvent, AppData, Bakje } from "../types";
import { eventMinuten, percentagesBerekenen } from "./percentages";

export interface TargetVergelijking {
  bakje: Bakje;
  targetUrenPerWeek: number;
  werkelijkeUrenPerWeek: number;
  percentageVanTarget: number; // 100 = exact op target, 140 = 40% overschreden, 80 = 20% onder
  events: AgendaEvent[]; // events in deze periode die aan dit bakje zijn toegewezen
}

export interface TargetRapport {
  aantalWeken: number;
  perBakje: TargetVergelijking[];
  totaalTargetUrenPerWeek: number;
  totaalWerkelijkeUrenPerWeek: number;
  totaalPercentage: number;
  overloopUitgesloten: boolean;
  /** Totale minuten over de hele periode, inclusief bakjes-zonder-target en ongecategoriseerd. */
  totaalMinutenAlleEvents: number;
  /** Minuten in bakjes die wél bestaan maar geen target hebben (worden niet vergeleken). */
  totaalMinutenBakjesZonderTarget: number;
  /** Minuten zonder bakje-toewijzing. */
  totaalMinutenOngecategoriseerd: number;
}

export interface TargetOpties {
  /** Als true, telt alleen minuten BINNEN werkuren mee; overloop wordt weggelaten. */
  sluitOverloopUit?: boolean;
}

/**
 * Compute average hours/week per bakje over the given period.
 *
 * `aantalWeken` mag fractioneel zijn (bv. 3.57 voor 25 dagen). Dat is handig bij
 * een aangepaste periode: dan deelt deze functie het totaal door het exacte aantal
 * weken in de range zodat de "per week" niet wordt verdund door deels-geboekte weken.
 *
 * Percentages are returned raw — 140% means 40% over target, 80% means 20% under.
 * Bakjes without a target are excluded from `perBakje` (they can't be compared),
 * but their minutes are reflected in `totaalMinutenBakjesZonderTarget`.
 */
export function targetVergelijkingBerekenen(
  events: AgendaEvent[],
  data: AppData,
  aantalWeken: number,
  opties: TargetOpties = {},
): TargetRapport {
  const weeks = Math.max(0.01, aantalWeken);
  const sluitOverloopUit = opties.sluitOverloopUit ?? false;

  // We laten percentagesBerekenen direct werken met de sluitOverloopUit-optie,
  // zodat entry.minuten al de juiste waarde heeft.
  const report = percentagesBerekenen(events, data, { sluitOverloopUit });
  const bakjesById = new Map(data.bakjes.map((b) => [b.id, b]));

  const minutenPerBakje = new Map<string, number>();
  const eventsPerBakje = new Map<string, AgendaEvent[]>();
  let totaalMinutenAlleEvents = 0;
  let totaalMinutenBakjesZonderTarget = 0;

  for (const entry of report.perBakje) {
    minutenPerBakje.set(entry.bakje.id, entry.minuten);
    eventsPerBakje.set(entry.bakje.id, entry.events);
    totaalMinutenAlleEvents += entry.minuten;
    const bakje = bakjesById.get(entry.bakje.id);
    if (!bakje || bakje.targetUrenPerWeek == null) {
      totaalMinutenBakjesZonderTarget += entry.minuten;
    }
  }

  const totaalMinutenOngecategoriseerd = report.ongecategoriseerd.minuten;
  totaalMinutenAlleEvents += totaalMinutenOngecategoriseerd;

  const perBakje: TargetVergelijking[] = [];
  let totaalTarget = 0;
  let totaalWerkelijk = 0;

  for (const bakje of data.bakjes) {
    if (bakje.targetUrenPerWeek == null) continue;
    const minuten = minutenPerBakje.get(bakje.id) ?? 0;
    const werkelijkUrenPerWeek = minuten / 60 / weeks;
    const target = bakje.targetUrenPerWeek;
    const percentage = target > 0 ? (werkelijkUrenPerWeek / target) * 100 : 0;
    perBakje.push({
      bakje,
      targetUrenPerWeek: target,
      werkelijkeUrenPerWeek: werkelijkUrenPerWeek,
      percentageVanTarget: percentage,
      events: eventsPerBakje.get(bakje.id) ?? [],
    });
    totaalTarget += target;
    totaalWerkelijk += werkelijkUrenPerWeek;
  }

  return {
    aantalWeken: weeks,
    perBakje,
    totaalTargetUrenPerWeek: totaalTarget,
    totaalWerkelijkeUrenPerWeek: totaalWerkelijk,
    totaalPercentage: totaalTarget > 0 ? (totaalWerkelijk / totaalTarget) * 100 : 0,
    overloopUitgesloten: sluitOverloopUit,
    totaalMinutenAlleEvents,
    totaalMinutenBakjesZonderTarget,
    totaalMinutenOngecategoriseerd,
  };
}

/**
 * Helper so callers don't have to import eventMinuten separately for total-hour displays.
 */
export function totaalUrenVanEvents(events: AgendaEvent[]): number {
  let min = 0;
  for (const e of events) {
    if (e.heelDag) continue;
    min += eventMinuten(e);
  }
  return min / 60;
}
