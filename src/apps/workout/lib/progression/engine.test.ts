import { describe, it, expect } from "vitest";
import {
  estimateE1rm,
  weightForReps,
  roundToIncrement,
  suggestNextSets,
  warmupSets,
  type SessionSummary,
} from "./engine";

const base = {
  repMin: 8,
  repMax: 12,
  incrementKg: 2.5,
  targetSets: 3,
};

function session(weightKg: number, reps: number, sets = 3): SessionSummary {
  return { sets: Array.from({ length: sets }, () => ({ weightKg, reps })) };
}

describe("e1RM math", () => {
  it("returns the weight itself for a single rep", () => {
    expect(estimateE1rm(100, 1)).toBe(100);
  });

  it("estimates higher than the lifted weight for multiple reps (Epley)", () => {
    // 100kg x 10 -> 100 * (1 + 10/30) = 133.33
    expect(estimateE1rm(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("inverts cleanly: weightForReps undoes estimateE1rm", () => {
    const e1rm = estimateE1rm(80, 8);
    expect(weightForReps(e1rm, 8)).toBeCloseTo(80, 5);
  });

  it("rounds to the configured increment", () => {
    expect(roundToIncrement(81.6, 2.5)).toBe(82.5);
    expect(roundToIncrement(80.9, 2.5)).toBe(80);
  });
});

describe("suggestNextSets", () => {
  it("asks for a starting weight when there is no history", () => {
    const s = suggestNextSets({ ...base, history: [] });
    expect(s.status).toBe("new");
    expect(s.sets[0].weightKg).toBe(0);
    expect(s.targetReps).toBe(base.repMin);
  });

  it("adds weight and resets reps after hitting the top of the range", () => {
    const s = suggestNextSets({ ...base, history: [session(40, 12)] });
    expect(s.status).toBe("progress");
    expect(s.sets[0].weightKg).toBe(42.5);
    expect(s.sets[0].reps).toBe(8);
    expect(s.sets).toHaveLength(3);
  });

  it("holds weight and chases one more rep when mid-range", () => {
    const s = suggestNextSets({ ...base, history: [session(40, 9)] });
    expect(s.status).toBe("hold");
    expect(s.sets[0].weightKg).toBe(40);
    expect(s.sets[0].reps).toBe(10);
  });

  it("rescales the weight when the rep target changes", () => {
    // Established from 40kg x 10 (e1RM ~53.3). Ask for 5 reps -> heavier weight.
    const s = suggestNextSets({
      ...base,
      history: [session(40, 10)],
      targetRepsOverride: 5,
    });
    expect(s.targetReps).toBe(5);
    expect(s.sets[0].weightKg).toBeGreaterThan(40);
    // weightForReps(53.33, 5) = 45.7 -> rounded to 45
    expect(s.sets[0].weightKg).toBe(45);
  });

  it("suggests a deload after a stall", () => {
    // Three sessions stuck at the same weight/reps -> no new e1RM high.
    const s = suggestNextSets({
      ...base,
      history: [session(50, 9), session(50, 9), session(50, 9)],
    });
    expect(s.status).toBe("deload");
    expect(s.sets[0].weightKg).toBe(45); // 50 * 0.9
  });
});

describe("warmupSets", () => {
  it("builds an ascending ramp below the working weight", () => {
    const w = warmupSets(100, 2.5);
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((set) => set.weightKg < 100)).toBe(true);
    // ascending
    for (let i = 1; i < w.length; i++) {
      expect(w[i].weightKg).toBeGreaterThan(w[i - 1].weightKg);
    }
  });

  it("returns nothing for a zero working weight", () => {
    expect(warmupSets(0, 2.5)).toEqual([]);
  });
});
