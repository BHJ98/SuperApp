// Progressive-overload suggestion engine.
//
// Pure, framework-free functions. Given the recent working sets for a
// (profile, exercise) pair plus that exercise's rep range and weight increment,
// it suggests the weight + reps for the next session — and explains why.
//
// Core ideas:
//  - Estimate 1RM (e1RM) from real sets so we have a single strength number.
//  - Use the e1RM <-> reps relationship so changing the rep target rescales the
//    suggested weight sensibly.
//  - Drive auto-progression with double progression (fill the rep range, then add
//    weight) tempered by a recent-trend / plateau check.

export type E1rmFormula = "epley" | "brzycki";

export type ProgressionStatus = "new" | "hold" | "progress" | "deload";

/** One past session's working sets (warm-ups excluded by the caller). */
export interface SessionSummary {
  sets: { weightKg: number; reps: number }[];
}

export interface SuggestionInput {
  repMin: number;
  repMax: number;
  incrementKg: number;
  targetSets: number;
  /** Past sessions for this exercise, ordered oldest -> newest. */
  history: SessionSummary[];
  /** User override of the rep target; rescales weight from the established e1RM. */
  targetRepsOverride?: number;
  formula?: E1rmFormula;
  /** Sessions without an e1RM gain that trigger a deload suggestion (default 3). */
  plateauSessions?: number;
}

export interface SuggestedSet {
  weightKg: number;
  reps: number;
}

export interface Suggestion {
  sets: SuggestedSet[];
  reasoning: string;
  status: ProgressionStatus;
  targetReps: number;
  /** Best estimated 1RM observed in recent history, or null when brand new. */
  e1rm: number | null;
}

// ---- e1RM helpers ----

/** Estimated one-rep max for a single set. */
export function estimateE1rm(
  weightKg: number,
  reps: number,
  formula: E1rmFormula = "epley",
): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  if (formula === "brzycki") {
    // Guard the asymptote at 37 reps.
    if (reps >= 37) return weightKg * (36 / 1);
    return weightKg * (36 / (37 - reps));
  }
  return weightKg * (1 + reps / 30);
}

/** Weight that should let you hit `reps` given an estimated 1RM. */
export function weightForReps(
  e1rm: number,
  reps: number,
  formula: E1rmFormula = "epley",
): number {
  if (e1rm <= 0 || reps <= 0) return 0;
  if (reps === 1) return e1rm;
  if (formula === "brzycki") {
    return (e1rm * (37 - reps)) / 36;
  }
  return e1rm / (1 + reps / 30);
}

/** Round to the nearest multiple of `increment` (e.g. 2.5 kg). */
export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return Math.round(weight * 100) / 100;
  return Math.round(weight / increment) * increment;
}

// ---- session-level reads ----

function sessionBestE1rm(s: SessionSummary, formula: E1rmFormula): number {
  return s.sets.reduce(
    (best, set) => Math.max(best, estimateE1rm(set.weightKg, set.reps, formula)),
    0,
  );
}

/** Heaviest weight used among working sets — the session's "working weight". */
function workingWeight(s: SessionSummary): number {
  return s.sets.reduce((max, set) => Math.max(max, set.weightKg), 0);
}

/** Lowest reps achieved at the working weight (the set that gates progression). */
function minRepsAtWorkingWeight(s: SessionSummary): number {
  const w = workingWeight(s);
  const reps = s.sets.filter((set) => set.weightKg === w).map((set) => set.reps);
  return reps.length ? Math.min(...reps) : 0;
}

// ---- main entry point ----

export function suggestNextSets(input: SuggestionInput): Suggestion {
  const {
    repMin,
    repMax,
    incrementKg,
    targetSets,
    history,
    targetRepsOverride,
    formula = "epley",
    plateauSessions = 3,
  } = input;

  const nonEmpty = history.filter((s) => s.sets.length > 0);

  // No history: we have no weight to anchor to — ask the user to enter one.
  if (nonEmpty.length === 0) {
    const reps = clamp(targetRepsOverride ?? repMin, 1, repMax);
    return {
      sets: makeSets(targetSets, 0, reps),
      reasoning: `First time logging this — enter a working weight and aim for ${repMin}–${repMax} reps.`,
      status: "new",
      targetReps: reps,
      e1rm: null,
    };
  }

  const last = nonEmpty[nonEmpty.length - 1];
  const lastWeight = workingWeight(last);
  const lastMinReps = minRepsAtWorkingWeight(last);
  const bestE1rm = Math.max(...nonEmpty.map((s) => sessionBestE1rm(s, formula)));

  // Explicit rep-target change: rescale weight off the established e1RM.
  if (targetRepsOverride != null && targetRepsOverride !== lastMinReps) {
    const reps = clamp(targetRepsOverride, 1, 30);
    const weight = roundToIncrement(weightForReps(bestE1rm, reps, formula), incrementKg);
    return {
      sets: makeSets(targetSets, weight, reps),
      reasoning: `Rep target set to ${reps}. From your est. 1RM of ${fmt(bestE1rm)} kg that’s about ${fmt(weight)} kg.`,
      status: weight > lastWeight ? "progress" : "hold",
      targetReps: reps,
      e1rm: bestE1rm,
    };
  }

  // Double progression: filled the rep range on every working set -> add weight.
  const hitTop = last.sets.every((set) => set.reps >= repMax) && last.sets.length > 0;
  if (hitTop) {
    const weight = roundToIncrement(lastWeight + incrementKg, incrementKg);
    return {
      sets: makeSets(targetSets, weight, repMin),
      reasoning: `Hit ${repMax}+ reps on every set at ${fmt(lastWeight)} kg → +${fmt(incrementKg)} kg, reset to ${repMin} reps.`,
      status: "progress",
      targetReps: repMin,
      e1rm: bestE1rm,
    };
  }

  // Plateau: no new e1RM high across the recent window -> suggest a deload.
  if (isPlateaued(nonEmpty, plateauSessions, formula)) {
    const weight = roundToIncrement(lastWeight * 0.9, incrementKg);
    return {
      sets: makeSets(targetSets, weight, repMin),
      reasoning: `No progress in ${plateauSessions} sessions — deload ~10% to ${fmt(weight)} kg and rebuild toward ${repMax} reps.`,
      status: "deload",
      targetReps: repMin,
      e1rm: bestE1rm,
    };
  }

  // Otherwise hold the weight and chase one more rep.
  const nextReps = clamp(lastMinReps + 1, repMin, repMax);
  return {
    sets: makeSets(targetSets, lastWeight, nextReps),
    reasoning: `Last time ${lastMinReps} reps at ${fmt(lastWeight)} kg → same weight, aim for ${nextReps} reps.`,
    status: "hold",
    targetReps: nextReps,
    e1rm: bestE1rm,
  };
}

/** Warm-up ramp leading up to a working weight. */
export function warmupSets(
  workingWeightKg: number,
  incrementKg: number,
  percentages: number[] = [0.5, 0.7, 0.85],
  reps: number[] = [8, 5, 3],
): SuggestedSet[] {
  if (workingWeightKg <= 0) return [];
  const out: SuggestedSet[] = [];
  percentages.forEach((pct, i) => {
    const w = roundToIncrement(workingWeightKg * pct, incrementKg);
    if (w > 0 && w < workingWeightKg && !out.some((s) => s.weightKg === w)) {
      out.push({ weightKg: w, reps: reps[i] ?? reps[reps.length - 1] ?? 5 });
    }
  });
  return out;
}

// ---- internals ----

function isPlateaued(
  history: SessionSummary[],
  window: number,
  formula: E1rmFormula,
): boolean {
  if (history.length < window) return false;
  const recent = history.slice(history.length - window);
  const e1rms = recent.map((s) => sessionBestE1rm(s, formula));
  const latest = e1rms[e1rms.length - 1];
  const priorMax = Math.max(...e1rms.slice(0, e1rms.length - 1));
  // Latest session set no new high versus the rest of the window.
  return latest <= priorMax;
}

function makeSets(count: number, weightKg: number, reps: number): SuggestedSet[] {
  return Array.from({ length: Math.max(1, count) }, () => ({ weightKg, reps }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
