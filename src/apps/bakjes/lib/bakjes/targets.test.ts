import { describe, it, expect } from "vitest";
import { targetVergelijkingBerekenen } from "./targets";
import type { AgendaEvent, AppData } from "../types";
import { emptyAppData } from "../types";

function event(startIso: string, endIso: string, uid: string, titel = "t"): AgendaEvent {
  return { uid, titel, beschrijving: "", start: startIso, eind: endIso, heelDag: false };
}

function baseData(): AppData {
  return {
    ...emptyAppData(),
    bakjes: [
      { id: "a", naam: "Logistiek", kleur: "#000", succesBeschrijving: "", targetUrenPerWeek: 10 },
      { id: "b", naam: "Overleg", kleur: "#111", succesBeschrijving: "", targetUrenPerWeek: 5 },
      { id: "c", naam: "Mail", kleur: "#222", succesBeschrijving: "" }, // no target
    ],
    regels: [
      { id: "r1", keyword: "log", bakjeId: "a", matchVeld: "titel", caseSensitive: false, actief: true },
      { id: "r2", keyword: "overleg", bakjeId: "b", matchVeld: "titel", caseSensitive: false, actief: true },
    ],
  };
}

describe("targetVergelijkingBerekenen", () => {
  it("berekent werkelijke uren per week gemiddeld over periode", () => {
    const events: AgendaEvent[] = [
      // 20 uur 'logistiek' verdeeld over 2 weken = 10u/week = exact target.
      event("2026-04-06T09:00:00.000Z", "2026-04-06T19:00:00.000Z", "e1", "logistiek"),
      event("2026-04-13T09:00:00.000Z", "2026-04-13T19:00:00.000Z", "e2", "logistiek"),
      // 20 uur 'overleg' verdeeld over 2 weken = 10u/week = 200% van target 5.
      event("2026-04-07T09:00:00.000Z", "2026-04-07T19:00:00.000Z", "e3", "overleg"),
      event("2026-04-14T09:00:00.000Z", "2026-04-14T19:00:00.000Z", "e4", "overleg"),
    ];
    const rapport = targetVergelijkingBerekenen(events, baseData(), 2);
    expect(rapport.aantalWeken).toBe(2);
    expect(rapport.perBakje).toHaveLength(2); // bakje zonder target wordt weggelaten
    const log = rapport.perBakje.find((p) => p.bakje.id === "a")!;
    expect(log.werkelijkeUrenPerWeek).toBeCloseTo(10, 5);
    expect(log.percentageVanTarget).toBeCloseTo(100, 5);
    const ov = rapport.perBakje.find((p) => p.bakje.id === "b")!;
    expect(ov.werkelijkeUrenPerWeek).toBeCloseTo(10, 5);
    expect(ov.percentageVanTarget).toBeCloseTo(200, 5);
  });

  it("geeft 0% bij geen events", () => {
    const rapport = targetVergelijkingBerekenen([], baseData(), 4);
    expect(rapport.perBakje.every((p) => p.werkelijkeUrenPerWeek === 0)).toBe(true);
    expect(rapport.perBakje.every((p) => p.percentageVanTarget === 0)).toBe(true);
  });

  it("toont realistisch percentage boven 100 (geen cap)", () => {
    const events: AgendaEvent[] = [
      // 14 uur logistiek in 1 week tegen target 10 = 140%.
      event("2026-04-06T07:00:00.000Z", "2026-04-06T21:00:00.000Z", "e1", "logistiek"),
    ];
    const rapport = targetVergelijkingBerekenen(events, baseData(), 1);
    const log = rapport.perBakje.find((p) => p.bakje.id === "a")!;
    expect(log.percentageVanTarget).toBeCloseTo(140, 5);
  });

  it("sluit bakjes zonder target uit", () => {
    const rapport = targetVergelijkingBerekenen([], baseData(), 1);
    expect(rapport.perBakje.find((p) => p.bakje.id === "c")).toBeUndefined();
  });

  it("sluitOverloopUit telt alleen uren binnen werkuren mee", () => {
    const events: AgendaEvent[] = [
      // Logistiek: 7u binnen werkuren (09-16 UTC = 11-18 CEST) + 4u overloop ('s nachts 22-02 UTC).
      // werkuren default = 07:00–21:00 Europe/Amsterdam.
      event("2026-04-06T09:00:00.000Z", "2026-04-06T16:00:00.000Z", "e1", "logistiek dag"),
      // Nachtwerk: 22:00 UTC = 00:00 CEST, loopt door tot 02:00 UTC = 04:00 CEST → 4u pure overloop.
      event("2026-04-06T22:00:00.000Z", "2026-04-07T02:00:00.000Z", "e2", "logistiek nacht"),
    ];
    const inclusief = targetVergelijkingBerekenen(events, baseData(), 1, {
      sluitOverloopUit: false,
    });
    const logInc = inclusief.perBakje.find((p) => p.bakje.id === "a")!;
    expect(logInc.werkelijkeUrenPerWeek).toBeCloseTo(11, 5);
    expect(inclusief.overloopUitgesloten).toBe(false);

    const exclusief = targetVergelijkingBerekenen(events, baseData(), 1, {
      sluitOverloopUit: true,
    });
    const logExc = exclusief.perBakje.find((p) => p.bakje.id === "a")!;
    expect(logExc.werkelijkeUrenPerWeek).toBeCloseTo(7, 5);
    expect(exclusief.overloopUitgesloten).toBe(true);
  });

  it("levert toegewezen events per bakje in het rapport", () => {
    const events: AgendaEvent[] = [
      event("2026-04-06T09:00:00.000Z", "2026-04-06T10:00:00.000Z", "e1", "logistiek a"),
      event("2026-04-06T11:00:00.000Z", "2026-04-06T12:00:00.000Z", "e2", "logistiek b"),
      event("2026-04-06T13:00:00.000Z", "2026-04-06T14:00:00.000Z", "e3", "overleg a"),
    ];
    const rapport = targetVergelijkingBerekenen(events, baseData(), 1);
    const log = rapport.perBakje.find((p) => p.bakje.id === "a")!;
    expect(log.events.map((e) => e.uid).sort()).toEqual(["e1", "e2"]);
    const ov = rapport.perBakje.find((p) => p.bakje.id === "b")!;
    expect(ov.events.map((e) => e.uid)).toEqual(["e3"]);
  });

  it("rapporteert minuten in bakjes zonder target en ongecategoriseerd apart", () => {
    const events: AgendaEvent[] = [
      // Toegewezen aan 'Mail' (bakje c — geen target).
      event("2026-04-06T09:00:00.000Z", "2026-04-06T11:00:00.000Z", "e1", "Mail inbox"),
      // Geen match → ongecategoriseerd.
      event("2026-04-06T12:00:00.000Z", "2026-04-06T13:30:00.000Z", "e2", "Random meeting"),
      // Logistiek met target.
      event("2026-04-06T14:00:00.000Z", "2026-04-06T15:00:00.000Z", "e3", "logistiek a"),
    ];
    const data: AppData = {
      ...baseData(),
      regels: [
        ...baseData().regels,
        { id: "r3", keyword: "mail", bakjeId: "c", matchVeld: "titel", caseSensitive: false, actief: true },
      ],
    };
    const rapport = targetVergelijkingBerekenen(events, data, 1);
    expect(rapport.totaalMinutenBakjesZonderTarget).toBe(120); // 'Mail' bakje
    expect(rapport.totaalMinutenOngecategoriseerd).toBe(90); // Random meeting
    expect(rapport.totaalMinutenAlleEvents).toBe(120 + 90 + 60); // mail + ongecat + logistiek
  });

  it("accepteert fractionele aantalWeken voor exacte periode", () => {
    const events: AgendaEvent[] = [
      // 5 uur logistiek over 0.5 week = 10u/week ⇒ exact target.
      event("2026-04-06T09:00:00.000Z", "2026-04-06T14:00:00.000Z", "e1", "logistiek"),
    ];
    const rapport = targetVergelijkingBerekenen(events, baseData(), 0.5);
    const log = rapport.perBakje.find((p) => p.bakje.id === "a")!;
    expect(log.werkelijkeUrenPerWeek).toBeCloseTo(10, 5);
    expect(log.percentageVanTarget).toBeCloseTo(100, 5);
    expect(rapport.aantalWeken).toBe(0.5);
  });
});
