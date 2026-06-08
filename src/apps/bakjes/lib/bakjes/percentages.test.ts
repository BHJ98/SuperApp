import { describe, it, expect } from "vitest";
import { overloopMinuten, percentagesBerekenen, eventMinuten } from "./percentages";
import type { AgendaEvent, AppData } from "../types";
import { emptyAppData } from "../types";

function eventInTz(startLocal: string, endLocal: string, titel = "t"): AgendaEvent {
  // Interpret as Europe/Amsterdam wall-clock. For tests we treat the strings as UTC+2 (CEST April).
  // Safest approach: supply real UTC ISOs so tests don't depend on DST quirks.
  return {
    uid: titel + startLocal,
    titel,
    beschrijving: "",
    start: startLocal,
    eind: endLocal,
    heelDag: false,
  };
}

const cfg = {
  werkurenStart: "07:00",
  werkurenEind: "21:00",
  tijdzone: "Europe/Amsterdam",
};

describe("eventMinuten", () => {
  it("telt duur in minuten", () => {
    const e = eventInTz("2026-04-20T09:00:00.000Z", "2026-04-20T10:30:00.000Z");
    expect(eventMinuten(e)).toBe(90);
  });

  it("geeft 0 voor omgekeerd event", () => {
    const e = eventInTz("2026-04-20T10:00:00.000Z", "2026-04-20T09:00:00.000Z");
    expect(eventMinuten(e)).toBe(0);
  });
});

describe("overloopMinuten", () => {
  it("heeft 0 overloop voor event midden op dag", () => {
    // 13:00–14:00 in Amsterdam (CEST = UTC+2 in april) → 11:00–12:00 UTC
    const e = eventInTz("2026-04-20T11:00:00.000Z", "2026-04-20T12:00:00.000Z");
    expect(overloopMinuten(e, cfg)).toBe(0);
  });

  it("markeert avond-event als overloop", () => {
    // 22:00–23:00 Amsterdam = 20:00–21:00 UTC (april = CEST)
    const e = eventInTz("2026-04-20T20:00:00.000Z", "2026-04-20T21:00:00.000Z");
    expect(overloopMinuten(e, cfg)).toBe(60);
  });

  it("splitst gedeeltelijke overloop", () => {
    // 20:30–21:30 Amsterdam = 18:30–19:30 UTC (april)
    // 30min binnen (<21:00), 30min buiten
    const e = eventInTz("2026-04-20T18:30:00.000Z", "2026-04-20T19:30:00.000Z");
    expect(overloopMinuten(e, cfg)).toBe(30);
  });
});

describe("percentagesBerekenen", () => {
  it("verdeelt percentages op basis van toewijzingen", () => {
    const data: AppData = {
      ...emptyAppData(),
      bakjes: [
        { id: "a", naam: "Overleg", kleur: "#f00", succesBeschrijving: "" },
        { id: "b", naam: "Werk", kleur: "#0f0", succesBeschrijving: "" },
      ],
      assignments: {
        e1: { bakjeId: "a", handmatig: true, geupdatet: "2026-04-20T00:00:00Z" },
        e2: { bakjeId: "b", handmatig: true, geupdatet: "2026-04-20T00:00:00Z" },
      },
    };
    data.instellingen = {
      werkurenStart: "07:00",
      werkurenEind: "21:00",
      tijdzone: "Europe/Amsterdam",
    };
    const events: AgendaEvent[] = [
      {
        uid: "e1",
        titel: "Overleg",
        beschrijving: "",
        start: "2026-04-20T09:00:00Z",
        eind: "2026-04-20T10:00:00Z",
        heelDag: false,
      },
      {
        uid: "e2",
        titel: "Coding",
        beschrijving: "",
        start: "2026-04-20T10:00:00Z",
        eind: "2026-04-20T13:00:00Z",
        heelDag: false,
      },
    ];
    const report = percentagesBerekenen(events, data);
    expect(report.totaalMinuten).toBe(240);
    expect(report.perBakje[0].bakje.id).toBe("b"); // sorted by minuten desc
    expect(report.perBakje[0].minuten).toBe(180);
    expect(report.perBakje[0].percentage).toBeCloseTo(75, 1);
    expect(report.perBakje[1].percentage).toBeCloseTo(25, 1);
    expect(report.ongecategoriseerd.minuten).toBe(0);
  });

  it("telt ongecategoriseerde events apart", () => {
    const data = emptyAppData();
    data.bakjes = [{ id: "a", naam: "A", kleur: "#000", succesBeschrijving: "" }];
    const events: AgendaEvent[] = [
      {
        uid: "e1",
        titel: "Iets",
        beschrijving: "",
        start: "2026-04-20T09:00:00Z",
        eind: "2026-04-20T10:00:00Z",
        heelDag: false,
      },
    ];
    const report = percentagesBerekenen(events, data);
    expect(report.ongecategoriseerd.minuten).toBe(60);
    expect(report.perBakje[0].minuten).toBe(0);
  });

  it("negeert hele-dag events", () => {
    const data = emptyAppData();
    const events: AgendaEvent[] = [
      {
        uid: "e1",
        titel: "Vakantie",
        beschrijving: "",
        start: "2026-04-20T00:00:00Z",
        eind: "2026-04-21T00:00:00Z",
        heelDag: true,
      },
    ];
    const report = percentagesBerekenen(events, data);
    expect(report.totaalMinuten).toBe(0);
  });
});
