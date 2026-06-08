import { appDataSchema, type AppData } from "../types";

const BACKUP_VERSION = 1;
const BACKUP_KIND = "bakjesmethode-backup";

interface BackupBestand {
  kind: typeof BACKUP_KIND;
  backupVersion: number;
  geexporteerdOp: string;
  data: AppData;
}

export function maakBackup(data: AppData): BackupBestand {
  return {
    kind: BACKUP_KIND,
    backupVersion: BACKUP_VERSION,
    geexporteerdOp: new Date().toISOString(),
    data,
  };
}

export function backupAlsJson(data: AppData): string {
  return JSON.stringify(maakBackup(data), null, 2);
}

export function backupBestandsnaam(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `bakjesmethode-backup-${y}-${m}-${dag}.json`;
}

/**
 * Parse a backup file's JSON contents and return the validated AppData.
 * Accepts both wrapped backup files (with kind/backupVersion/data) and
 * raw AppData JSON (zoals direct uit Google Drive). Gooit een leesbare
 * fout als het bestand niet matcht.
 */
export function leesBackupJson(json: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Geen geldig JSON-bestand.");
  }

  if (parsed && typeof parsed === "object" && "kind" in parsed) {
    const obj = parsed as Partial<BackupBestand>;
    if (obj.kind !== BACKUP_KIND) {
      throw new Error(
        `Onverwacht bestandstype (${String(obj.kind)}). Verwacht: ${BACKUP_KIND}.`,
      );
    }
    if (typeof obj.backupVersion !== "number" || obj.backupVersion > BACKUP_VERSION) {
      throw new Error(
        `Backup-versie ${obj.backupVersion} wordt niet ondersteund door deze app-versie.`,
      );
    }
    return appDataSchema.parse(obj.data);
  }
  // Fallback: raw AppData (zelfde formaat als wat in Drive staat).
  return appDataSchema.parse(parsed);
}

export interface BackupSamenvatting {
  bakjes: number;
  regels: number;
  assignments: number;
  reflecties: number;
  intakes: number;
  geexporteerdOp: string | null;
}

export function samenvatBackup(data: AppData, geexporteerdOp: string | null = null): BackupSamenvatting {
  return {
    bakjes: data.bakjes.length,
    regels: data.regels.length,
    assignments: Object.keys(data.assignments).length,
    reflecties: data.reflecties.length,
    intakes: data.intakes.length,
    geexporteerdOp,
  };
}
