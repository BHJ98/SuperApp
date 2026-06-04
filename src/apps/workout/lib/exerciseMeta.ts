import { z } from "zod";
import type {
  BodyRegion,
  Equipment,
  Laterality,
  Mechanic,
  MovementPattern,
} from "./db/types";

export const BODY_REGIONS: BodyRegion[] = ["upper", "lower", "core"];
export const MOVEMENT_PATTERNS: MovementPattern[] = [
  "push",
  "pull",
  "squat",
  "hinge",
  "lunge",
  "carry",
  "core",
];
export const EQUIPMENT: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
];
export const MECHANICS: Mechanic[] = ["compound", "isolation"];
export const LATERALITIES: Laterality[] = ["bilateral", "unilateral"];

export const COMMON_MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
];

// Required-field validation for the exercise form (the user asked most fields required).
export const exerciseSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    primaryMuscle: z.string().trim().min(1, "Primary muscle is required"),
    bodyRegion: z.enum(["upper", "lower", "core"]),
    movementPattern: z.enum(["push", "pull", "squat", "hinge", "lunge", "carry", "core"]),
    equipment: z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell"]),
    mechanic: z.enum(["compound", "isolation"]),
    laterality: z.enum(["bilateral", "unilateral"]),
    defaultRepMin: z.coerce.number().int().min(1).max(100),
    defaultRepMax: z.coerce.number().int().min(1).max(100),
    defaultIncrementKg: z.coerce.number().min(0).max(50),
    notes: z.string().trim().optional().default(""),
  })
  .refine((d) => d.defaultRepMax >= d.defaultRepMin, {
    message: "Max reps must be ≥ min reps",
    path: ["defaultRepMax"],
  });

export type ExerciseFormValues = z.infer<typeof exerciseSchema>;
