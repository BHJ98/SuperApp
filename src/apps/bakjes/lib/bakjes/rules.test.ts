import { describe, it, expect } from "vitest";
import { regelMatcht, suggereerKeyword } from "./rules";
import type { AgendaEvent, Regel } from "../types";

const event = (titel: string, beschrijving = ""): AgendaEvent => ({
  uid: titel,
  titel,
  beschrijving,
  start: "2026-04-20T09:00:00.000Z",
  eind: "2026-04-20T10:00:00.000Z",
  heelDag: false,
});

const regel = (overrides: Partial<Regel> = {}): Regel => ({
  id: "r1",
  keyword: "overleg",
  bakjeId: "b1",
  matchVeld: "titel",
  caseSensitive: false,
  actief: true,
  ...overrides,
});

describe("regelMatcht", () => {
  it("matcht hoofdletter-ongevoelig in titel", () => {
    expect(regelMatcht(regel(), event("Overleg marketing"))).toBe(true);
    expect(regelMatcht(regel(), event("Lunch"))).toBe(false);
  });

  it("respecteert case sensitive", () => {
    expect(
      regelMatcht(regel({ caseSensitive: true, keyword: "Overleg" }), event("overleg sales")),
    ).toBe(false);
    expect(
      regelMatcht(regel({ caseSensitive: true, keyword: "Overleg" }), event("Overleg sales")),
    ).toBe(true);
  });

  it("respecteert actief-vlag", () => {
    expect(regelMatcht(regel({ actief: false }), event("Overleg"))).toBe(false);
  });

  it("matcht in beschrijving als matchVeld=beschrijving", () => {
    expect(
      regelMatcht(regel({ matchVeld: "beschrijving" }), event("Standup", "dagelijks overleg")),
    ).toBe(true);
    expect(regelMatcht(regel({ matchVeld: "beschrijving" }), event("Standup", ""))).toBe(false);
  });
});

describe("suggereerKeyword", () => {
  it("pikt meest distinctive token", () => {
    expect(suggereerKeyword("Overleg marketing")).toMatch(/Overleg|marketing/);
  });

  it("ontdoet van prefixes", () => {
    expect(suggereerKeyword("[Project X] Stand-up meeting")).toMatch(/Project|Stand|meeting/);
  });

  it("skipt stopwoorden", () => {
    expect(suggereerKeyword("Overleg met de baas")).toBe("Overleg");
  });

  it("geeft lege string voor lege input", () => {
    expect(suggereerKeyword("")).toBe("");
  });
});
