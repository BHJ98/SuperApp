import type { Exercise, Profile } from "./types";

type ExerciseSeed = Omit<Exercise, "id" | "createdAt" | "isArchived" | "notes"> & {
  notes?: string;
};

export const SEED_PROFILES: Omit<Profile, "id" | "createdAt">[] = [
  { name: "Me", color: "#2563eb", unitDefault: "kg" },
  { name: "Partner", color: "#db2777", unitDefault: "kg" },
];

// A starter library. Increments reflect the smallest realistic jump:
// 2.5kg barbell (1.25 per side), 2kg dumbbells/machines, 1kg cables.
const E = (
  name: string,
  primaryMuscle: string,
  bodyRegion: Exercise["bodyRegion"],
  movementPattern: Exercise["movementPattern"],
  equipment: Exercise["equipment"],
  mechanic: Exercise["mechanic"],
  laterality: Exercise["laterality"],
  defaultRepMin: number,
  defaultRepMax: number,
  defaultIncrementKg: number,
): ExerciseSeed => ({
  name,
  primaryMuscle,
  bodyRegion,
  movementPattern,
  equipment,
  mechanic,
  laterality,
  defaultRepMin,
  defaultRepMax,
  defaultIncrementKg,
});

export const SEED_EXERCISES: ExerciseSeed[] = [
  // ---- Chest / push ----
  E("Barbell Bench Press", "Chest", "upper", "push", "barbell", "compound", "bilateral", 6, 10, 2.5),
  E("Incline Barbell Bench Press", "Chest", "upper", "push", "barbell", "compound", "bilateral", 6, 10, 2.5),
  E("Dumbbell Bench Press", "Chest", "upper", "push", "dumbbell", "compound", "bilateral", 8, 12, 2),
  E("Incline Dumbbell Press", "Chest", "upper", "push", "dumbbell", "compound", "bilateral", 8, 12, 2),
  E("Machine Chest Press", "Chest", "upper", "push", "machine", "compound", "bilateral", 8, 12, 2),
  E("Cable Fly", "Chest", "upper", "push", "cable", "isolation", "bilateral", 10, 15, 1),
  E("Push-Up", "Chest", "upper", "push", "bodyweight", "compound", "bilateral", 8, 20, 0),
  E("Dip", "Chest", "upper", "push", "bodyweight", "compound", "bilateral", 6, 12, 1),

  // ---- Shoulders / push ----
  E("Overhead Press", "Shoulders", "upper", "push", "barbell", "compound", "bilateral", 5, 8, 2.5),
  E("Seated Dumbbell Shoulder Press", "Shoulders", "upper", "push", "dumbbell", "compound", "bilateral", 8, 12, 2),
  E("Machine Shoulder Press", "Shoulders", "upper", "push", "machine", "compound", "bilateral", 8, 12, 2),
  E("Lateral Raise", "Shoulders", "upper", "push", "dumbbell", "isolation", "bilateral", 12, 20, 1),
  E("Cable Lateral Raise", "Shoulders", "upper", "push", "cable", "isolation", "unilateral", 12, 20, 1),
  E("Rear Delt Fly", "Shoulders", "upper", "pull", "dumbbell", "isolation", "bilateral", 12, 20, 1),

  // ---- Triceps / push ----
  E("Triceps Pushdown", "Triceps", "upper", "push", "cable", "isolation", "bilateral", 10, 15, 1),
  E("Overhead Cable Extension", "Triceps", "upper", "push", "cable", "isolation", "bilateral", 10, 15, 1),
  E("Skullcrusher", "Triceps", "upper", "push", "barbell", "isolation", "bilateral", 8, 12, 2.5),
  E("Close-Grip Bench Press", "Triceps", "upper", "push", "barbell", "compound", "bilateral", 6, 10, 2.5),

  // ---- Back / pull ----
  E("Deadlift", "Back", "lower", "hinge", "barbell", "compound", "bilateral", 3, 6, 5),
  E("Barbell Row", "Back", "upper", "pull", "barbell", "compound", "bilateral", 6, 10, 2.5),
  E("Pendlay Row", "Back", "upper", "pull", "barbell", "compound", "bilateral", 5, 8, 2.5),
  E("Pull-Up", "Back", "upper", "pull", "bodyweight", "compound", "bilateral", 5, 12, 1),
  E("Chin-Up", "Back", "upper", "pull", "bodyweight", "compound", "bilateral", 5, 12, 1),
  E("Lat Pulldown", "Back", "upper", "pull", "cable", "compound", "bilateral", 8, 12, 2),
  E("Seated Cable Row", "Back", "upper", "pull", "cable", "compound", "bilateral", 8, 12, 2),
  E("Single-Arm Dumbbell Row", "Back", "upper", "pull", "dumbbell", "compound", "unilateral", 8, 12, 2),
  E("Machine Row", "Back", "upper", "pull", "machine", "compound", "bilateral", 8, 12, 2),
  E("Face Pull", "Back", "upper", "pull", "cable", "isolation", "bilateral", 12, 20, 1),

  // ---- Biceps / pull ----
  E("Barbell Curl", "Biceps", "upper", "pull", "barbell", "isolation", "bilateral", 8, 12, 2.5),
  E("Dumbbell Curl", "Biceps", "upper", "pull", "dumbbell", "isolation", "bilateral", 8, 12, 1),
  E("Hammer Curl", "Biceps", "upper", "pull", "dumbbell", "isolation", "bilateral", 8, 12, 1),
  E("Cable Curl", "Biceps", "upper", "pull", "cable", "isolation", "bilateral", 10, 15, 1),
  E("Preacher Curl", "Biceps", "upper", "pull", "machine", "isolation", "bilateral", 8, 12, 2),

  // ---- Quads / legs ----
  E("Back Squat", "Quads", "lower", "squat", "barbell", "compound", "bilateral", 5, 8, 2.5),
  E("Front Squat", "Quads", "lower", "squat", "barbell", "compound", "bilateral", 5, 8, 2.5),
  E("Leg Press", "Quads", "lower", "squat", "machine", "compound", "bilateral", 8, 12, 5),
  E("Hack Squat", "Quads", "lower", "squat", "machine", "compound", "bilateral", 8, 12, 5),
  E("Bulgarian Split Squat", "Quads", "lower", "lunge", "dumbbell", "compound", "unilateral", 8, 12, 2),
  E("Walking Lunge", "Quads", "lower", "lunge", "dumbbell", "compound", "unilateral", 8, 12, 2),
  E("Leg Extension", "Quads", "lower", "squat", "machine", "isolation", "bilateral", 10, 15, 2),
  E("Goblet Squat", "Quads", "lower", "squat", "dumbbell", "compound", "bilateral", 8, 12, 2),

  // ---- Hamstrings / glutes / hinge ----
  E("Romanian Deadlift", "Hamstrings", "lower", "hinge", "barbell", "compound", "bilateral", 6, 10, 2.5),
  E("Hip Thrust", "Glutes", "lower", "hinge", "barbell", "compound", "bilateral", 8, 12, 2.5),
  E("Lying Leg Curl", "Hamstrings", "lower", "hinge", "machine", "isolation", "bilateral", 10, 15, 2),
  E("Seated Leg Curl", "Hamstrings", "lower", "hinge", "machine", "isolation", "bilateral", 10, 15, 2),
  E("Glute Bridge", "Glutes", "lower", "hinge", "bodyweight", "compound", "bilateral", 10, 20, 0),
  E("Cable Pull-Through", "Glutes", "lower", "hinge", "cable", "compound", "bilateral", 10, 15, 1),

  // ---- Calves ----
  E("Standing Calf Raise", "Calves", "lower", "squat", "machine", "isolation", "bilateral", 10, 15, 2),
  E("Seated Calf Raise", "Calves", "lower", "squat", "machine", "isolation", "bilateral", 12, 20, 2),

  // ---- Core ----
  E("Plank", "Core", "core", "core", "bodyweight", "isolation", "bilateral", 20, 60, 0),
  E("Hanging Leg Raise", "Core", "core", "core", "bodyweight", "isolation", "bilateral", 8, 15, 0),
  E("Cable Crunch", "Core", "core", "core", "cable", "isolation", "bilateral", 12, 20, 1),
  E("Ab Wheel Rollout", "Core", "core", "core", "bodyweight", "isolation", "bilateral", 8, 15, 0),
  E("Russian Twist", "Core", "core", "core", "bodyweight", "isolation", "bilateral", 12, 20, 0),

  // ---- Carry / misc ----
  E("Farmer's Carry", "Forearms", "core", "carry", "dumbbell", "compound", "bilateral", 20, 40, 2),
];
