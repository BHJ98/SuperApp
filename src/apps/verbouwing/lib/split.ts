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

/**
 * Verdeelt een totaal gelijk over `count` regels, in hele centen. De centen die
 * niet deelbaar zijn gaan één voor één naar de eerste regels, zodat de som
 * altijd exact het totaal is (bijv. 100 / 3 → 33.34, 33.33, 33.33).
 */
export function splitEvenly(total: number, count: number): number[] {
  if (!Number.isFinite(total) || count < 1) return [];
  const cents = Math.round(total * 100);
  const base = Math.trunc(cents / count);
  let remainder = cents - base * count;
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: count }, () => {
    let c = base;
    if (remainder !== 0) {
      c += step;
      remainder -= step;
    }
    return c / 100;
  });
}
