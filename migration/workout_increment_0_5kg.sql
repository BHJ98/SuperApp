-- ============================================================================
-- Workout: bulk-set default increment to 0.5kg
-- Run in the Supabase SQL editor — name this query tab "workout_increment_0_5kg"
-- before running it, so it doesn't linger in the editor history as
-- "Untitled query".
--
-- Why: 0.5kg gives finer-grained progression steps than the previous
-- per-equipment defaults (2.5kg barbell, 2kg dumbbell/machine, 1kg cable),
-- matching the smallest plates/dumbbell jumps available at most home/commercial
-- gyms. This is a one-time bulk reset of every exercise's default; it stays
-- editable per exercise afterward via the Increment field on the exercise
-- edit form (Workout app -> Exercises -> an exercise -> Edit).
--
-- Idempotent: safe to re-run, it's a plain unconditional update.
-- ============================================================================

update workout.exercises set default_increment_kg = 0.5;
