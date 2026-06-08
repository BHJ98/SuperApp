import { describe, it, expect } from "vitest";
import { backupAlsJson, leesBackupJson, samenvatBackup } from "./backup";
import { emptyAppData, type AppData } from "../types";

function vulData(): AppData {
  return {
    ...emptyAppData(),
    bakjes: [
      { id: "a", naam: "Logistiek", kleur: "#000", succesBeschrijving: "", targetUrenPerWeek: 10 },
      { id: "b", naam: "Overleg", kleur: "#111", succesBeschrijving: "" },
    ],
    regels: [
      { id: "r1", keyword: "log", bakjeId: "a", matchVeld: "titel", caseSensitive: false, actief: true },
    ],
    assignments: {
      "evt-1": { bakjeId: "a", handmatig: true, geupdatet: "2026-04-06T09:00:00.000Z" },
    },
    laatstGeupdatet: "2026-05-01T12:00:00.000Z",
  };
}

describe("backup", () => {
  it("round-trip: export en weer importeren geeft hetzelfde resultaat", () => {
    const data = vulData();
    const json = backupAlsJson(data);
    const terug = leesBackupJson(json);
    expect(terug).toEqual(data);
  });

  it("accepteert ook 'kale' AppData JSON (zonder backup-wrapper)", () => {
    const data = vulData();
    const json = JSON.stringify(data);
    const terug = leesBackupJson(json);
    expect(terug.bakjes).toHaveLength(2);
    expect(terug.regels).toHaveLength(1);
  });

  it("weigert bestanden met onbekend 'kind'", () => {
    const json = JSON.stringify({ kind: "iets-anders", backupVersion: 1, data: vulData() });
    expect(() => leesBackupJson(json)).toThrow(/bestandstype/i);
  });

  it("weigert nieuwere backup-versies", () => {
    const json = JSON.stringify({
      kind: "bakjesmethode-backup",
      backupVersion: 999,
      data: vulData(),
    });
    expect(() => leesBackupJson(json)).toThrow(/versie/i);
  });

  it("weigert kapotte JSON", () => {
    expect(() => leesBackupJson("{niet geldig")).toThrow(/geldig JSON/i);
  });

  it("samenvat geeft tellingen per categorie", () => {
    const summary = samenvatBackup(vulData());
    expect(summary).toEqual({
      bakjes: 2,
      regels: 1,
      assignments: 1,
      reflecties: 0,
      intakes: 0,
      geexporteerdOp: null,
    });
  });
});
