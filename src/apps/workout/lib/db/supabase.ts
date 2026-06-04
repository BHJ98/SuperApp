import { startOfWeek, subWeeks } from "date-fns";
import { supabase } from "@/lib/supabase";
import type {
  Exercise,
  Profile,
  Routine,
  RoutineExercise,
  RoutineWithExercises,
  Workout,
  WorkoutDetail,
  WorkoutExerciseWithSets,
  WorkoutSet,
} from "./types";
import {
  type ExercisePatch,
  type NewExercise,
  type NewSet,
  type PersonalRecords,
  type ProgressPoint,
  type Repository,
  type RoutineInput,
  type StatsSummary,
} from "./repository";
import { estimateE1rm, type SessionSummary } from "../progression/engine";

// Talks to the `workout` schema on the shared Supabase project. Profiles are
// shared rows (Me/Partner), not auth users; access is gated by RLS keyed to the
// allow-list (public.is_allowed()). Mirrors LocalRepository's behaviour so the
// UI is unchanged whichever backend is active.

function db() {
  if (!supabase) throw new Error("Supabase client not configured");
  return supabase.schema("workout");
}

// ---- row <-> domain mappers ----

type Row = Record<string, unknown>;

const toProfile = (r: Row): Profile => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as string,
  unitDefault: "kg",
  createdAt: r.created_at as string,
});

const toExercise = (r: Row): Exercise => ({
  id: r.id as string,
  name: r.name as string,
  primaryMuscle: r.primary_muscle as string,
  bodyRegion: r.body_region as Exercise["bodyRegion"],
  movementPattern: r.movement_pattern as Exercise["movementPattern"],
  equipment: r.equipment as Exercise["equipment"],
  mechanic: r.mechanic as Exercise["mechanic"],
  laterality: r.laterality as Exercise["laterality"],
  defaultRepMin: r.default_rep_min as number,
  defaultRepMax: r.default_rep_max as number,
  defaultIncrementKg: Number(r.default_increment_kg),
  notes: (r.notes as string) ?? "",
  isArchived: r.is_archived as boolean,
  createdAt: r.created_at as string,
});

const exerciseToRow = (e: NewExercise | ExercisePatch): Row => {
  const r: Row = {};
  if ("name" in e) r.name = e.name;
  if ("primaryMuscle" in e) r.primary_muscle = e.primaryMuscle;
  if ("bodyRegion" in e) r.body_region = e.bodyRegion;
  if ("movementPattern" in e) r.movement_pattern = e.movementPattern;
  if ("equipment" in e) r.equipment = e.equipment;
  if ("mechanic" in e) r.mechanic = e.mechanic;
  if ("laterality" in e) r.laterality = e.laterality;
  if ("defaultRepMin" in e) r.default_rep_min = e.defaultRepMin;
  if ("defaultRepMax" in e) r.default_rep_max = e.defaultRepMax;
  if ("defaultIncrementKg" in e) r.default_increment_kg = e.defaultIncrementKg;
  if ("notes" in e) r.notes = e.notes ?? "";
  return r;
};

const toRoutine = (r: Row): Routine => ({
  id: r.id as string,
  name: r.name as string,
  notes: (r.notes as string) ?? "",
  sortOrder: r.sort_order as number,
  createdAt: r.created_at as string,
});

const toRoutineExercise = (r: Row): RoutineExercise => ({
  id: r.id as string,
  routineId: r.routine_id as string,
  exerciseId: r.exercise_id as string,
  sortOrder: r.sort_order as number,
  targetSets: r.target_sets as number,
  targetRepMin: r.target_rep_min as number,
  targetRepMax: r.target_rep_max as number,
});

const toWorkout = (r: Row): Workout => ({
  id: r.id as string,
  profileId: r.profile_id as string,
  routineId: (r.routine_id as string | null) ?? null,
  startedAt: r.started_at as string,
  finishedAt: (r.finished_at as string | null) ?? null,
  notes: (r.notes as string) ?? "",
});

const toSet = (r: Row): WorkoutSet => ({
  id: r.id as string,
  workoutExerciseId: r.workout_exercise_id as string,
  setNumber: r.set_number as number,
  weightKg: Number(r.weight_kg),
  reps: r.reps as number,
  isWarmup: r.is_warmup as boolean,
  e1rm: Number(r.e1rm),
  completedAt: (r.completed_at as string | null) ?? null,
});

// The `workout` schema isn't typed in the shared client, so responses come back
// loosely typed; callers cast to Row/Row[]. Return `any` to keep those casts clean.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function check(res: { data: unknown; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseRepository implements Repository {
  // ---- profiles ----
  async listProfiles(): Promise<Profile[]> {
    const rows = check(await db().from("profiles").select("*").order("created_at"));
    return (rows as Row[]).map(toProfile);
  }

  // ---- exercises ----
  async listExercises(): Promise<Exercise[]> {
    const rows = check(
      await db().from("exercises").select("*").eq("is_archived", false).order("name"),
    );
    return (rows as Row[]).map(toExercise);
  }

  async getExercise(id: string): Promise<Exercise | null> {
    const rows = check(await db().from("exercises").select("*").eq("id", id).limit(1));
    const arr = rows as Row[];
    return arr.length ? toExercise(arr[0]) : null;
  }

  async createExercise(data: NewExercise): Promise<Exercise> {
    const row = check(
      await db().from("exercises").insert(exerciseToRow(data)).select("*").single(),
    );
    return toExercise(row as Row);
  }

  async updateExercise(id: string, patch: ExercisePatch): Promise<Exercise> {
    const row = check(
      await db().from("exercises").update(exerciseToRow(patch)).eq("id", id).select("*").single(),
    );
    return toExercise(row as Row);
  }

  async deleteExercise(id: string): Promise<void> {
    // Soft-delete if used, hard-delete otherwise (mirror LocalRepository).
    const used = check(
      await db().from("workout_exercises").select("id").eq("exercise_id", id).limit(1),
    ) as Row[];
    if (used.length > 0) {
      check(await db().from("exercises").update({ is_archived: true }).eq("id", id).select("id"));
    } else {
      check(await db().from("exercises").delete().eq("id", id).select("id"));
    }
  }

  // ---- routines ----
  async listRoutines(): Promise<RoutineWithExercises[]> {
    const routines = (check(
      await db().from("routines").select("*").order("sort_order"),
    ) as Row[]).map(toRoutine);
    return Promise.all(routines.map((r) => this.hydrateRoutine(r)));
  }

  async getRoutine(id: string): Promise<RoutineWithExercises | null> {
    const rows = check(await db().from("routines").select("*").eq("id", id).limit(1)) as Row[];
    if (!rows.length) return null;
    return this.hydrateRoutine(toRoutine(rows[0]));
  }

  private async hydrateRoutine(routine: Routine): Promise<RoutineWithExercises> {
    const links = (check(
      await db()
        .from("routine_exercises")
        .select("*")
        .eq("routine_id", routine.id)
        .order("sort_order"),
    ) as Row[]).map(toRoutineExercise);
    const exercises = [];
    for (const link of links) {
      const exercise = await this.getExercise(link.exerciseId);
      if (exercise) exercises.push({ ...link, exercise });
    }
    return { ...routine, exercises };
  }

  async createRoutine(input: RoutineInput): Promise<Routine> {
    const { count: n } = await db()
      .from("routines")
      .select("id", { count: "exact", head: true });
    const row = check(
      await db()
        .from("routines")
        .insert({ name: input.name, notes: input.notes, sort_order: n ?? 0 })
        .select("*")
        .single(),
    );
    const routine = toRoutine(row as Row);
    await this.writeRoutineExercises(routine.id, input);
    return routine;
  }

  async updateRoutine(id: string, input: RoutineInput): Promise<Routine> {
    const row = check(
      await db()
        .from("routines")
        .update({ name: input.name, notes: input.notes })
        .eq("id", id)
        .select("*")
        .single(),
    );
    check(await db().from("routine_exercises").delete().eq("routine_id", id).select("id"));
    await this.writeRoutineExercises(id, input);
    return toRoutine(row as Row);
  }

  private async writeRoutineExercises(routineId: string, input: RoutineInput): Promise<void> {
    if (input.exercises.length === 0) return;
    const payload = input.exercises.map((e) => ({
      routine_id: routineId,
      exercise_id: e.exerciseId,
      sort_order: e.sortOrder,
      target_sets: e.targetSets,
      target_rep_min: e.targetRepMin,
      target_rep_max: e.targetRepMax,
    }));
    check(await db().from("routine_exercises").insert(payload).select("id"));
  }

  async deleteRoutine(id: string): Promise<void> {
    check(await db().from("routines").delete().eq("id", id).select("id"));
  }

  // ---- workouts ----
  async startWorkout(profileId: string, routineId: string | null): Promise<string> {
    const row = check(
      await db()
        .from("workouts")
        .insert({ profile_id: profileId, routine_id: routineId })
        .select("id")
        .single(),
    ) as Row;
    const workoutId = row.id as string;
    if (routineId) {
      const links = (check(
        await db()
          .from("routine_exercises")
          .select("exercise_id, sort_order")
          .eq("routine_id", routineId)
          .order("sort_order"),
      ) as Row[]);
      if (links.length) {
        const payload = links.map((l, i) => ({
          workout_id: workoutId,
          exercise_id: l.exercise_id as string,
          sort_order: i,
        }));
        check(await db().from("workout_exercises").insert(payload).select("id"));
      }
    }
    return workoutId;
  }

  async getWorkout(id: string): Promise<WorkoutDetail | null> {
    const wRows = check(await db().from("workouts").select("*").eq("id", id).limit(1)) as Row[];
    if (!wRows.length) return null;
    const workout = toWorkout(wRows[0]);

    const pRows = check(
      await db().from("profiles").select("*").eq("id", workout.profileId).limit(1),
    ) as Row[];
    const profile = pRows.length ? toProfile(pRows[0]) : null;

    let routine: Routine | null = null;
    if (workout.routineId) {
      const rRows = check(
        await db().from("routines").select("*").eq("id", workout.routineId).limit(1),
      ) as Row[];
      routine = rRows.length ? toRoutine(rRows[0]) : null;
    }

    const wes = (check(
      await db().from("workout_exercises").select("*").eq("workout_id", id).order("sort_order"),
    ) as Row[]);

    const exercises: WorkoutExerciseWithSets[] = [];
    for (const we of wes) {
      const exercise = await this.getExercise(we.exercise_id as string);
      if (!exercise) continue;
      const sets = (check(
        await db()
          .from("sets")
          .select("*")
          .eq("workout_exercise_id", we.id as string)
          .order("set_number"),
      ) as Row[]).map(toSet);
      exercises.push({
        id: we.id as string,
        workoutId: we.workout_id as string,
        exerciseId: we.exercise_id as string,
        sortOrder: we.sort_order as number,
        exercise,
        sets,
      });
    }

    return { ...workout, profile: profile!, routine, exercises };
  }

  async listWorkouts(profileId: string): Promise<Workout[]> {
    const rows = check(
      await db()
        .from("workouts")
        .select("*")
        .eq("profile_id", profileId)
        .order("started_at", { ascending: false }),
    ) as Row[];
    return rows.map(toWorkout);
  }

  async addWorkoutExercise(workoutId: string, exerciseId: string): Promise<void> {
    const { count } = await db()
      .from("workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("workout_id", workoutId);
    check(
      await db()
        .from("workout_exercises")
        .insert({ workout_id: workoutId, exercise_id: exerciseId, sort_order: count ?? 0 })
        .select("id"),
    );
  }

  async removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
    check(await db().from("workout_exercises").delete().eq("id", workoutExerciseId).select("id"));
  }

  async addSet(workoutExerciseId: string, set: NewSet): Promise<WorkoutSet> {
    const { count } = await db()
      .from("sets")
      .select("id", { count: "exact", head: true })
      .eq("workout_exercise_id", workoutExerciseId);
    const row = check(
      await db()
        .from("sets")
        .insert({
          workout_exercise_id: workoutExerciseId,
          set_number: (count ?? 0) + 1,
          weight_kg: set.weightKg,
          reps: set.reps,
          is_warmup: set.isWarmup,
          e1rm: set.isWarmup ? 0 : estimateE1rm(set.weightKg, set.reps),
        })
        .select("*")
        .single(),
    );
    return toSet(row as Row);
  }

  async updateSet(setId: string, patch: Partial<NewSet>): Promise<void> {
    const rows = check(await db().from("sets").select("*").eq("id", setId).limit(1)) as Row[];
    if (!rows.length) return;
    const merged = { ...toSet(rows[0]), ...patch };
    const e1rm = merged.isWarmup ? 0 : estimateE1rm(merged.weightKg, merged.reps);
    check(
      await db()
        .from("sets")
        .update({
          weight_kg: merged.weightKg,
          reps: merged.reps,
          is_warmup: merged.isWarmup,
          e1rm,
        })
        .eq("id", setId)
        .select("id"),
    );
  }

  async completeSet(setId: string, completed: boolean): Promise<void> {
    check(
      await db()
        .from("sets")
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq("id", setId)
        .select("id"),
    );
  }

  async deleteSet(setId: string): Promise<void> {
    check(await db().from("sets").delete().eq("id", setId).select("id"));
  }

  async finishWorkout(id: string): Promise<void> {
    check(
      await db()
        .from("workouts")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", id)
        .select("id"),
    );
  }

  async deleteWorkout(id: string): Promise<void> {
    check(await db().from("workouts").delete().eq("id", id).select("id"));
  }

  // ---- analytics ----
  async getExerciseHistory(profileId: string, exerciseId: string): Promise<SessionSummary[]> {
    const sessions = await this.sessionsForExercise(profileId, exerciseId);
    return sessions.map((s) => ({
      sets: s.sets
        .filter((set) => !set.isWarmup && set.weightKg > 0 && set.reps > 0)
        .map((set) => ({ weightKg: set.weightKg, reps: set.reps })),
    }));
  }

  async getProgress(profileId: string, exerciseId: string): Promise<ProgressPoint[]> {
    const sessions = await this.sessionsForExercise(profileId, exerciseId);
    return sessions
      .map((s) => {
        const working = s.sets.filter((set) => !set.isWarmup && set.reps > 0);
        if (working.length === 0) return null;
        return {
          date: s.startedAt,
          topWeightKg: Math.max(...working.map((set) => set.weightKg)),
          bestE1rm: Math.round(Math.max(...working.map((set) => set.e1rm)) * 10) / 10,
        };
      })
      .filter((p): p is ProgressPoint => p !== null);
  }

  async getPersonalRecords(
    profileId: string,
    exerciseId: string,
  ): Promise<PersonalRecords | null> {
    const sessions = await this.sessionsForExercise(profileId, exerciseId);
    const sets = sessions.flatMap((s) => s.sets).filter((s) => !s.isWarmup && s.reps > 0);
    if (sets.length === 0) return null;
    const bestWeightKg = Math.max(...sets.map((s) => s.weightKg));
    return {
      bestWeightKg,
      bestE1rm: Math.round(Math.max(...sets.map((s) => s.e1rm)) * 10) / 10,
      bestRepsAtTopWeight: Math.max(
        ...sets.filter((s) => s.weightKg === bestWeightKg).map((s) => s.reps),
      ),
    };
  }

  async getStats(profileId: string): Promise<StatsSummary> {
    const workouts = await this.listWorkouts(profileId);
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const fourWeeksAgo = subWeeks(weekStart, 3);

    let workoutsThisWeek = 0;
    let workoutsLast4Weeks = 0;
    let totalVolumeThisWeekKg = 0;
    const muscleSets = new Map<string, number>();

    for (const w of workouts) {
      const started = new Date(w.startedAt);
      const inThisWeek = started >= weekStart;
      if (inThisWeek) workoutsThisWeek++;
      if (started >= fourWeeksAgo) workoutsLast4Weeks++;
      if (!inThisWeek) continue;

      const wes = check(
        await db().from("workout_exercises").select("*").eq("workout_id", w.id),
      ) as Row[];
      for (const we of wes) {
        const exercise = await this.getExercise(we.exercise_id as string);
        const sets = (check(
          await db().from("sets").select("*").eq("workout_exercise_id", we.id as string),
        ) as Row[]).map(toSet);
        const working = sets.filter((s) => !s.isWarmup && s.reps > 0);
        totalVolumeThisWeekKg += working.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
        if (exercise) {
          muscleSets.set(
            exercise.primaryMuscle,
            (muscleSets.get(exercise.primaryMuscle) ?? 0) + working.length,
          );
        }
      }
    }

    return {
      workoutsThisWeek,
      workoutsLast4Weeks,
      totalVolumeThisWeekKg: Math.round(totalVolumeThisWeekKg),
      setsByMuscle: [...muscleSets.entries()]
        .map(([muscle, sets]) => ({ muscle, sets }))
        .sort((a, b) => b.sets - a.sets),
    };
  }

  private async sessionsForExercise(
    profileId: string,
    exerciseId: string,
  ): Promise<(Workout & { sets: WorkoutSet[] })[]> {
    const workouts = (check(
      await db()
        .from("workouts")
        .select("*")
        .eq("profile_id", profileId)
        .order("started_at"),
    ) as Row[]).map(toWorkout);

    const out: (Workout & { sets: WorkoutSet[] })[] = [];
    for (const w of workouts) {
      const wes = check(
        await db()
          .from("workout_exercises")
          .select("id, exercise_id")
          .eq("workout_id", w.id)
          .eq("exercise_id", exerciseId),
      ) as Row[];
      if (wes.length === 0) continue;
      const sets: WorkoutSet[] = [];
      for (const we of wes) {
        const s = (check(
          await db().from("sets").select("*").eq("workout_exercise_id", we.id as string),
        ) as Row[]).map(toSet);
        sets.push(...s);
      }
      if (sets.length > 0) out.push({ ...w, sets });
    }
    return out;
  }
}
