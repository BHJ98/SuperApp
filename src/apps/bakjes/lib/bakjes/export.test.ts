import { describe, it, expect } from "vitest";
import { bakjesAlsCsv } from "./export";
import type { Bakje } from "../types";

describe("bakjesAlsCsv", () => {
  it("bouwt header + rij per bakje", () => {
    const bakjes: Bakje[] = [
      { id: "a", naam: "Logistiek", kleur: "#000", succesBeschrijving: "Voorraad klopt", targetUrenPerWeek: 10 },
      { id: "b", naam: "Mail", kleur: "#111", succesBeschrijving: "" },
    ];
    const csv = bakjesAlsCsv(bakjes);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Naam,Kleur,Target uren/week,Succes-beschrijving");
    expect(lines[1]).toBe("Logistiek,#000,10,Voorraad klopt");
    expect(lines[2]).toBe("Mail,#111,,");
  });

  it("quote't velden met komma, newline of quote", () => {
    const bakjes: Bakje[] = [
      { id: "a", naam: "Ad-hoc, interrupties", kleur: "#000", succesBeschrijving: 'Hij zei "nee"', targetUrenPerWeek: 5 },
    ];
    const csv = bakjesAlsCsv(bakjes);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"Ad-hoc, interrupties",#000,5,"Hij zei ""nee"""');
  });

  it("behandelt lege target als lege waarde", () => {
    const bakjes: Bakje[] = [
      { id: "a", naam: "X", kleur: "#000", succesBeschrijving: "" },
    ];
    const csv = bakjesAlsCsv(bakjes);
    expect(csv.split("\r\n")[1]).toBe("X,#000,,");
  });
});
