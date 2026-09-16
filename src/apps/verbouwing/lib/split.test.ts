import { describe, expect, it } from "vitest";
import { round2, splitEvenly, validateParts } from "./split";

describe("splitEvenly", () => {
  it("verdeelt exact deelbare bedragen gelijk", () => {
    expect(splitEvenly(300, 3)).toEqual([100, 100, 100]);
  });

  it("geeft de restcenten aan de eerste regels zodat de som exact klopt", () => {
    expect(splitEvenly(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(splitEvenly(313.02, 3)).toEqual([104.34, 104.34, 104.34]);
    expect(splitEvenly(0.05, 2)).toEqual([0.03, 0.02]);
  });

  it("levert altijd een splitsing op die validateParts goedkeurt", () => {
    for (const [total, n] of [[113.02, 3], [99.99, 7], [1, 3], [2500.5, 4]] as const) {
      const parts = splitEvenly(total, n).map((amount) => ({ amount }));
      expect(parts).toHaveLength(n);
      expect(validateParts(total, parts).ok).toBe(true);
      expect(round2(parts.reduce((s, p) => s + p.amount, 0))).toBe(total);
    }
  });

  it("gaat om met negatieve totalen (kortingen)", () => {
    expect(splitEvenly(-10, 3)).toEqual([-3.34, -3.33, -3.33]);
  });

  it("geeft een lege lijst bij ongeldige invoer", () => {
    expect(splitEvenly(NaN, 3)).toEqual([]);
    expect(splitEvenly(10, 0)).toEqual([]);
  });
});

describe("round2", () => {
  it("rondt af op centen", () => {
    expect(round2(1.014)).toBe(1.01);
    expect(round2(1.016)).toBe(1.02);
    expect(round2(10.1 + 20.2)).toBe(30.3);
  });
});

describe("validateParts", () => {
  it("keurt een exact kloppende splitsing goed", () => {
    const res = validateParts(100, [{ amount: 60 }, { amount: 40 }]);
    expect(res.ok).toBe(true);
    expect(res.remainder).toBe(0);
  });

  it("keurt één part met het volle bedrag goed (ongesplitste uitgave)", () => {
    expect(validateParts(123.45, [{ amount: 123.45 }]).ok).toBe(true);
  });

  it("tolereert floating-point-artefacten binnen €0,01", () => {
    // 0.1 + 0.2 = 0.30000000000000004
    const res = validateParts(0.3, [{ amount: 0.1 }, { amount: 0.2 }]);
    expect(res.ok).toBe(true);
    expect(res.remainder).toBe(0);
  });

  it("accepteert een afwijking van precies één cent", () => {
    expect(validateParts(10, [{ amount: 9.99 }]).ok).toBe(true);
    expect(validateParts(10, [{ amount: 10.01 }]).ok).toBe(true);
  });

  it("wijst een afwijking groter dan één cent af, met restbedrag", () => {
    const res = validateParts(100, [{ amount: 60 }, { amount: 30 }]);
    expect(res.ok).toBe(false);
    expect(res.remainder).toBe(10);
  });

  it("geeft een negatief restbedrag bij te veel verdeeld", () => {
    const res = validateParts(50, [{ amount: 60 }]);
    expect(res.ok).toBe(false);
    expect(res.remainder).toBe(-10);
  });

  it("wijst een lege splitsing af", () => {
    const res = validateParts(0, []);
    expect(res.ok).toBe(false);
    expect(res.remainder).toBe(0);
  });

  it("wijst niet-numerieke bedragen af", () => {
    expect(validateParts(10, [{ amount: NaN }, { amount: 10 }]).ok).toBe(false);
    expect(validateParts(10, [{ amount: Infinity }]).ok).toBe(false);
  });

  it("werkt met negatieve regels (kortingen) zolang de som klopt", () => {
    const res = validateParts(90, [{ amount: 100 }, { amount: -10 }]);
    expect(res.ok).toBe(true);
    expect(res.remainder).toBe(0);
  });
});
