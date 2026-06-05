import { z } from "zod";

export const BAKJE_KLEUREN = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#64748b", // slate
] as const;

export const bakjeSchema = z.object({
  id: z.string(),
  naam: z.string().min(1),
  kleur: z.string(),
  succesBeschrijving: z.string().default(""),
  targetUrenPerWeek: z.number().min(0).optional(),
  meetbaarDoel: z
    .object({
      getal: z.number(),
      eenheid: z.string(),
      periode: z.enum(["week", "maand", "kwartaal"]),
    })
    .optional(),
});
export type Bakje = z.infer<typeof bakjeSchema>;

export const regelSchema = z.object({
  id: z.string(),
  keyword: z.string().min(1),
  bakjeId: z.string(),
  matchVeld: z.enum(["titel", "beschrijving"]).default("titel"),
  caseSensitive: z.boolean().default(false),
  actief: z.boolean().default(true),
});
export type Regel = z.infer<typeof regelSchema>;

export const assignmentSchema = z.object({
  bakjeId: z.string(),
  handmatig: z.boolean(),
  geupdatet: z.string(), // ISO timestamp
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const reflectieSchema = z.object({
  weekIso: z.string(), // e.g. "2026-W17"
  perBakje: z.record(
    z.string(),
    z.object({
      goed: z.string().default(""),
      beter: z.string().default(""),
    }),
  ),
  algemeen: z.string().default(""),
});
export type Reflectie = z.infer<typeof reflectieSchema>;

export const intakeSchema = z.object({
  id: z.string(),
  datum: z.string(), // ISO
  verzoek: z.string(),
  checklistAntwoorden: z.object({
    pastInBakje: z.boolean().nullable(),
    gekozenBakjeId: z.string().nullable(),
    ruimteInBakje: z.enum(["ja", "nee", "onbekend"]).nullable(),
    anderBakjeLaatVallen: z.string().default(""),
  }),
  voorgesteldeRespons: z.string().default(""),
  beslissing: z.enum(["ja", "ja-mits", "nee", "pending"]).default("pending"),
});
export type Intake = z.infer<typeof intakeSchema>;

export const instellingenSchema = z.object({
  werkurenStart: z.string().default("07:00"),
  werkurenEind: z.string().default("21:00"),
  tijdzone: z.string().default("Europe/Amsterdam"),
});
export type Instellingen = z.infer<typeof instellingenSchema>;

export const appDataSchema = z.object({
  version: z.literal(1).default(1),
  bakjes: z.array(bakjeSchema).default([]),
  regels: z.array(regelSchema).default([]),
  assignments: z.record(z.string(), assignmentSchema).default({}),
  reflecties: z.array(reflectieSchema).default([]),
  intakes: z.array(intakeSchema).default([]),
  instellingen: instellingenSchema.default({}),
  laatstGeupdatet: z.string().default(""), // ISO
});
export type AppData = z.infer<typeof appDataSchema>;

export function emptyAppData(): AppData {
  return {
    version: 1,
    bakjes: [],
    regels: [],
    assignments: {},
    reflecties: [],
    intakes: [],
    instellingen: {
      werkurenStart: "07:00",
      werkurenEind: "21:00",
      tijdzone: "Europe/Amsterdam",
    },
    laatstGeupdatet: new Date(0).toISOString(),
  };
}

// Parsed calendar event (lives in IndexedDB only, not Drive)
export interface AgendaEvent {
  uid: string; // stable UID from ICS (plus recurrence-id for instances)
  titel: string;
  beschrijving: string;
  start: string; // ISO
  eind: string; // ISO
  heelDag: boolean;
}
