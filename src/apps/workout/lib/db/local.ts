import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { startOfWeek, subWeeks } from "date-fns";
import type {
  Exercise,
  Profile,
  Routine,
  RoutineExercise,
  RoutineWithExercises,
  Workout,
  WorkoutDetail,
  WorkoutExercise,
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
import { SEED_EXERCISES, SEED_PROFILES } from "./seed";
import { estimateE1rm, type SessionSummary } from "../progression/engine";

interface WTSchema extends DBSchema {
  profiles: { key: string; value: Profile };
  exercises: { key: string; value: Exercise };
  routines: { key: string; value: Routine };
  routineExercises: { key: string; value: RoutineExercise; indexes: { routineId: string } };
  workouts: { key: string; value: Workout; indexes: { profileId: string } };
  workoutExercises: {
    key: string;
    value: WorkoutExercise;
    indexes: { workoutId: string; exerciseId: string };
  };
  sets: { key: string; value: WorkoutSet; indexes: { workoutExerciseId: string } };
}

const DB_NAME = "superapp-workout";
const DB_VERSION = 1;

function uid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

async function openDatabase(): Promise<IDBPDatabase<WTSchema>> {
  return openDB<WTSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("profiles", { keyPath: "id" });
      db.createObjectStore("exercises", { keyPath: "id" });
      db.createObjectStore("routines", { keyPath: "id" });
      const re = db.createObjectStore("routineExercises", { keyPath: "id" });
      re.createIndex("routineId", "routineId");
      const w = db.createObjectStore("workouts", { keyPath: "id" });
      w.createIndex("profileId", "profileId");
      const we = db.createObjectStore("workoutExercises", { keyPath: "id" });
      we.createIndex("workoutId", "workoutId");
      we.createIndex("exerciseId", "exerciseId");
      const s = db.createObjectStore("sets", { keyPath: "id" });
      s.createIndex("workoutExerciseId", "workoutExerciseId");
    },
  });
}

async function seedIfEmpty(db: IDBPDatabase<WTSchema>): Promise<void> {
  const profileCount = await db.count("profiles");
  if (profileCount === 0) {
    const tx = db.transaction("profiles", "readwrite");
    for (const p of SEED_PROFILES) {
      await tx.store.put({ ...p, id: uid(), createdAt: now() });
    }
    await tx.done;
  }
  const exerciseCount = await db.count("exercises");
  if (exerciseCount === 0) {
    const tx = db.transaction("exercises", "readwrite");
    for (const e of SEED_EXERCISES) {
      await tx.store.put({
        ...e,
        id: uid(),
        notes: e.notes ?? "",
        isArchived: false,
        createdAt: now(),
      });
    }
    await tx.done;
  }
}

export class LocalRepository implements Repository {
  private dbPromise: Promise<IDBPDatabase<WTSchema>> | null = null;

  private async db(): Promise<IDBPDatabase<WTSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase().then(async (db) => {
        await seedIfEmpty(db);
        return db;
      });
    }
    return this.dbPromise;
  }

  // ---- profiles ----
  async listProfiles(): Promise<Profile[]> {
    const db = await this.db();
    const all = await db.getAll("profiles");
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // ---- exercises ----
  async listExercises(): Promise<Exercise[]> {
    const db = await this.db();
    const all = await db.getAll("exercises");
    return all
      .filter((e) => !e.isArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getExercise(id: string): Promise<Exercise | null> {
    const db = await this.db();
    return (await db.get("exercises", id)) ?? null;
  }

  async createExercise(data: NewExercise): Promise<Exercise> {
    const db = await this.db();
    const exercise: Exercise = { ...data, id: uid(), isArchived: false, createdAt: now() };
    await db.put("exercises", exercise);
    return exercise;
  }

  async updateExercise(id: string, patch: ExercisePatch): Promise<Exercise> {
    const db = await this.db();
    const existing = await db.get("exercises", id);
    if (!existing) throw new Error(`Exercise ${id} not found`);
    const updated = { ...existing, ...patch };
    await db.put("exercises", updated);
    return updated;
  }

  async deleteExercise(id: string): Promise<void> {
    const db = await this.db();
    // Soft-delete if it has been used, hard-delete otherwise.
    const used = await db.getAllFromIndex("workoutExercises", "exerciseId", id);
    if (used.length > 0) {
      const existing = await db.get("exercises", id);
      if (existing) await db.put("exercises", { ...existing, isArchived: true });
    } else {
      await db.delete("exercises", id);
      const re = await db.getAll("routineExercises");
      const tx = db.transaction("routineExercises", "readwrite");
      for (const r of re.filter((x) => x.exerciseId === id)) await tx.store.delete(r.id);
      await tx.done;
    }
  }

  // ---- routines ----
  async listRoutines(): Promise<RoutineWithExercises[]> {
    const db = await this.db();
    const routines = (await db.getAll("routines")).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return Promise.all(routines.map((r) => this.hydrateRoutine(r)));
  }

  async getRoutine(id: string): Promise<RoutineWithExercises | null> {
    const db = await this.db();
    const routine = await db.get("routines", id);
    return routine ? this.hydrateRoutine(routine) : null;
  }

  private async hydrateRoutine(routine: Routine): Promise<RoutineWithExercises> {
    const db = await this.db();
    const links = (
      await db.getAllFromIndex("routineExercises", "routineId", routine.id)
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const exercises = [];
    for (const link of links) {
      const exercise = await db.get("exercises", link.exerciseId);
      if (exercise) exercises.push({ ...link, exercise });
    }
    return { ...routine, exercises };
  }

  async createRoutine(input: RoutineInput): Promise<Routine> {
    const db = await this.db();
    const count = await db.count("routines");
    const routine: Routine = {
      id: uid(),
      name: input.name,
      notes: input.notes,
      sortOrder: count,
      createdAt: now(),
    };
    await db.put("routines", routine);
    await this.writeRoutineExercises(routine.id, input);
    return routine;
  }

  async updateRoutine(id: string, input: RoutineInput): Promise<Routine> {
    const db = await this.db();
    const existing = await db.get("routines", id);
    if (!existing) throw new Error(`Routine ${id} not found`);
    const updated = { ...existing, name: input.name, notes: input.notes };
    await db.put("routines", updated);
    // Replace the exercise list wholesale.
    const old = await db.getAllFromIndex("routineExercises", "routineId", id);
    const tx = db.transaction("routineExercises", "readwrite");
    for (const o of old) await tx.store.delete(o.id);
    await tx.done;
    await this.writeRoutineExercises(id, input);
    return updated;
  }

  private async writeRoutineExercises(routineId: string, input: RoutineInput): Promise<void> {
    const db = await this.db();
    const tx = db.transaction("routineExercises", "readwrite");
    for (const e of input.exercises) {
      await tx.store.put({ ...e, id: uid(), routineId });
    }
    await tx.done;
  }

  async deleteRoutine(id: string): Promise<void> {
    const db = await this.db();
    const links = await db.getAllFromIndex("routineExercises", "routineId", id);
    const tx = db.transaction(["routines", "routineExercises"], "readwrite");
    for (const l of links) await tx.objectStore("routineExercises").delete(l.id);
    await tx.objectStore("routines").delete(id);
    await tx.done;
  }

  // ---- workouts ----
  async startWorkout(profileId: string, routineId: string | null): Promise<string> {
    const db = await this.db();
    const workout: Workout = {
      id: uid(),
      profileId,
      routineId,
      startedAt: now(),
      finishedAt: null,
      notes: "",
    };
    await db.put("workouts", workout);
    if (routineId) {
      const links = (
        await db.getAllFromIndex("routineExercises", "routineId", routineId)
      ).sort((a, b) => a.sortOrder - b.sortOrder);
      const tx = db.transaction("workoutExercises", "readwrite");
      links.forEach((link, i) => {
        void tx.store.put({
          id: uid(),
          workoutId: workout.id,
          exerciseId: link.exerciseId,
          sortOrder: i,
        });
      });
      await tx.done;
    }
    return workout.id;
  }

  async getWorkout(id: string): Promise<WorkoutDetail | null> {
    const db = await this.db();
    const workout = await db.get("workouts", id);
    if (!workout) return null;
    const profile = await db.get("profiles", workout.profileId);
    const routine = workout.routineId ? await db.get("routines", workout.routineId) : null;
    const wes = (
      await db.getAllFromIndex("workoutExercises", "workoutId", id)
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const exercises: WorkoutExerciseWithSets[] = [];
    for (const we of wes) {
      const exercise = await db.get("exercises", we.exerciseId);
      if (!exercise) continue;
      const sets = (
        await db.getAllFromIndex("sets", "workoutExerciseId", we.id)
      ).sort((a, b) => a.setNumber - b.setNumber);
      exercises.push({ ...we, exercise, sets });
    }
    return {
      ...workout,
      profile: profile!,
      routine: routine ?? null,
      exercises,
    };
  }

  async listWorkouts(profileId: string): Promise<Workout[]> {
    const db = await this.db();
    const all = await db.getAllFromIndex("workouts", "profileId", profileId);
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async addWorkoutExercise(workoutId: string, exerciseId: string): Promise<void> {
    const db = await this.db();
    const existing = await db.getAllFromIndex("workoutExercises", "workoutId", workoutId);
    await db.put("workoutExercises", {
      id: uid(),
      workoutId,
      exerciseId,
      sortOrder: existing.length,
    });
  }

  async removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
    const db = await this.db();
    const sets = await db.getAllFromIndex("sets", "workoutExerciseId", workoutExerciseId);
    const tx = db.transaction(["workoutExercises", "sets"], "readwrite");
    for (const s of sets) await tx.objectStore("sets").delete(s.id);
    await tx.objectStore("workoutExercises").delete(workoutExerciseId);
    await tx.done;
  }

  async addSet(workoutExerciseId: string, set: NewSet): Promise<WorkoutSet> {
    const db = await this.db();
    const existing = await db.getAllFromIndex("sets", "workoutExerciseId", workoutExerciseId);
    const record: WorkoutSet = {
      id: uid(),
      workoutExerciseId,
      setNumber: existing.length + 1,
      weightKg: set.weightKg,
      reps: set.reps,
      isWarmup: set.isWarmup,
      e1rm: set.isWarmup ? 0 : estimateE1rm(set.weightKg, set.reps),
      completedAt: null,
    };
    await db.put("sets", record);
    return record;
  }

  async updateSet(setId: string, patch: Partial<NewSet>): Promise<void> {
    const db = await this.db();
    const existing = await db.get("sets", setId);
    if (!existing) return;
    const merged = { ...existing, ...patch };
    merged.e1rm = merged.isWarmup ? 0 : estimateE1rm(merged.weightKg, merged.reps);
    await db.put("sets", merged);
  }

  async completeSet(setId: string, completed: boolean): Promise<void> {
    const db = await this.db();
    const existing = await db.get("sets", setId);
    if (!existing) return;
    await db.put("sets", { ...existing, completedAt: completed ? now() : null });
  }

  async deleteSet(setId: string): Promise<void> {
    const db = await this.db();
    await db.delete("sets", setId);
  }

  async finishWorkout(id: string): Promise<void> {
    const db = await this.db();
    const workout = await db.get("workouts", id);
    if (!workout) return;
    await db.put("workouts", { ...workout, finishedAt: now() });
  }

  async deleteWorkout(id: string): Promise<void> {
    const db = await this.db();
    const wes = await db.getAllFromIndex("workoutExercises", "workoutId", id);
    const tx = db.transaction(["workouts", "workoutExercises", "sets"], "readwrite");
    for (const we of wes) {
      const sets = await db.getAllFromIndex("sets", "workoutExerciseId", we.id);
      for (const s of sets) await tx.objectStore("sets").delete(s.id);
      await tx.objectStore("workoutExercises").delete(we.id);
    }
    await tx.objectStore("workouts").delete(id);
    await tx.done;
  }

  // ---- analytics ----

  /** Working sets grouped by finished session, oldest -> newest. */
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
    const db = await this.db();
    const workouts = await db.getAllFromIndex("workouts", "profileId", profileId);
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

      const wes = await db.getAllFromIndex("workoutExercises", "workoutId", w.id);
      for (const we of wes) {
        const exercise = await db.get("exercises", we.exerciseId);
        const sets = await db.getAllFromIndex("sets", "workoutExerciseId", we.id);
        const working = sets.filter((s) => !s.isWarmup && s.reps > 0);
        if (inThisWeek) {
          totalVolumeThisWeekKg += working.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
          if (exercise) {
            muscleSets.set(
              exercise.primaryMuscle,
              (muscleSets.get(exercise.primaryMuscle) ?? 0) + working.length,
            );
          }
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

  /** Finished/active sessions that include the exercise, oldest -> newest, with sets. */
  private async sessionsForExercise(
    profileId: string,
    exerciseId: string,
  ): Promise<(Workout & { sets: WorkoutSet[] })[]> {
    const db = await this.db();
    const workouts = (
      await db.getAllFromIndex("workouts", "profileId", profileId)
    ).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const out: (Workout & { sets: WorkoutSet[] })[] = [];
    for (const w of workouts) {
      const wes = await db.getAllFromIndex("workoutExercises", "workoutId", w.id);
      const match = wes.filter((we) => we.exerciseId === exerciseId);
      if (match.length === 0) continue;
      const sets: WorkoutSet[] = [];
      for (const we of match) {
        sets.push(...(await db.getAllFromIndex("sets", "workoutExerciseId", we.id)));
      }
      if (sets.length > 0) out.push({ ...w, sets });
    }
    return out;
  }
}
