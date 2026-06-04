// Domain types shared by every data adapter (local IndexedDB or Supabase).
// These mirror the SQL schema in supabase/migrations.

export type BodyRegion = "upper" | "lower" | "core";

export type MovementPattern =
  | "push"
  | "pull"
  | "squat"
  | "hinge"
  | "lunge"
  | "carry"
  | "core";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "bodyweight"
  | "kettlebell";

export type Mechanic = "compound" | "isolation";

export type Laterality = "bilateral" | "unilateral";

export interface Profile {
  id: string;
  name: string;
  color: string;
  unitDefault: "kg";
  createdAt: string;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  bodyRegion: BodyRegion;
  movementPattern: MovementPattern;
  equipment: Equipment;
  mechanic: Mechanic;
  laterality: Laterality;
  defaultRepMin: number;
  defaultRepMax: number;
  /** Smallest realistic weight jump for this exercise/equipment, in kg. */
  defaultIncrementKg: number;
  notes: string;
  isArchived: boolean;
  createdAt: string;
}

export interface Routine {
  id: string;
  name: string;
  notes: string;
  sortOrder: number;
  createdAt: string;
}

export interface RoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  sortOrder: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
}

export interface Workout {
  id: string;
  profileId: string;
  routineId: string | null;
  startedAt: string;
  finishedAt: string | null;
  notes: string;
}

export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
}

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  /** Estimated 1RM, stored at save time so progression/PRs are cheap to read. */
  e1rm: number;
  completedAt: string | null;
}

// ---- Composite read shapes used by the UI ----

export interface RoutineWithExercises extends Routine {
  exercises: (RoutineExercise & { exercise: Exercise })[];
}

export interface WorkoutExerciseWithSets extends WorkoutExercise {
  exercise: Exercise;
  sets: WorkoutSet[];
}

export interface WorkoutDetail extends Workout {
  profile: Profile;
  routine: Routine | null;
  exercises: WorkoutExerciseWithSets[];
}
