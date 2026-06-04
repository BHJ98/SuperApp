import type {
  Exercise,
  Profile,
  Routine,
  RoutineExercise,
  RoutineWithExercises,
  Workout,
  WorkoutDetail,
  WorkoutSet,
} from "./types";
import type { SessionSummary } from "../progression/engine";

export type NewExercise = Omit<Exercise, "id" | "createdAt" | "isArchived">;
export type ExercisePatch = Partial<NewExercise>;

export interface RoutineInput {
  name: string;
  notes: string;
  exercises: Omit<RoutineExercise, "id" | "routineId">[];
}

export interface NewSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

/** Per-exercise progress point for charts. */
export interface ProgressPoint {
  date: string;
  topWeightKg: number;
  bestE1rm: number;
}

export interface PersonalRecords {
  bestWeightKg: number;
  bestE1rm: number;
  bestRepsAtTopWeight: number;
}

export interface StatsSummary {
  workoutsThisWeek: number;
  workoutsLast4Weeks: number;
  totalVolumeThisWeekKg: number;
  setsByMuscle: { muscle: string; sets: number }[];
}

/**
 * Storage-agnostic data access. Implemented by the local IndexedDB adapter and
 * the Supabase adapter; the UI only ever talks to this interface.
 */
export interface Repository {
  // profiles
  listProfiles(): Promise<Profile[]>;

  // exercises
  listExercises(): Promise<Exercise[]>;
  getExercise(id: string): Promise<Exercise | null>;
  createExercise(data: NewExercise): Promise<Exercise>;
  updateExercise(id: string, patch: ExercisePatch): Promise<Exercise>;
  deleteExercise(id: string): Promise<void>;

  // routines
  listRoutines(): Promise<RoutineWithExercises[]>;
  getRoutine(id: string): Promise<RoutineWithExercises | null>;
  createRoutine(input: RoutineInput): Promise<Routine>;
  updateRoutine(id: string, input: RoutineInput): Promise<Routine>;
  deleteRoutine(id: string): Promise<void>;

  // workouts
  startWorkout(profileId: string, routineId: string | null): Promise<string>;
  getWorkout(id: string): Promise<WorkoutDetail | null>;
  listWorkouts(profileId: string): Promise<Workout[]>;
  addWorkoutExercise(workoutId: string, exerciseId: string): Promise<void>;
  removeWorkoutExercise(workoutExerciseId: string): Promise<void>;
  addSet(workoutExerciseId: string, set: NewSet): Promise<WorkoutSet>;
  updateSet(setId: string, patch: Partial<NewSet>): Promise<void>;
  completeSet(setId: string, completed: boolean): Promise<void>;
  deleteSet(setId: string): Promise<void>;
  finishWorkout(id: string): Promise<void>;
  deleteWorkout(id: string): Promise<void>;

  // analytics / progression inputs
  getExerciseHistory(profileId: string, exerciseId: string): Promise<SessionSummary[]>;
  getProgress(profileId: string, exerciseId: string): Promise<ProgressPoint[]>;
  getPersonalRecords(profileId: string, exerciseId: string): Promise<PersonalRecords | null>;
  getStats(profileId: string): Promise<StatsSummary>;
}
