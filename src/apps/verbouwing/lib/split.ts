// Pure helpers voor de split-editor: de som van de parts moet (binnen een
// cent-tolerantie) gelijk zijn aan het totaalbedrag van de uitgave.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type PartAmount = { amount: number };

export type PartsValidation = {
  ok: boolean;
  /** Wat er nog te verdelen is: total - som(parts), afgerond op centen. */
  remainder: number;
};

/**
 * Valideert een splitsing: minstens één part, alle bedragen eindig, en de som
 * gelijk aan het totaal binnen een tolerantie van €0,01 (floating point).
 */
export function validateParts(total: number, parts: PartAmount[]): PartsValidation {
  const sum = round2(
    parts.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0),
  );
  const remainder = round2(round2(total) - sum);
  const ok =
    Number.isFinite(total) &&
    parts.length > 0 &&
    parts.every((p) => Number.isFinite(p.amount)) &&
    Math.abs(remainder) <= 0.01;
  return { ok, remainder };
}
