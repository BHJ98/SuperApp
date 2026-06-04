import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  getRepository,
  type ExercisePatch,
  type NewExercise,
  type NewSet,
  type RoutineInput,
} from "./lib/db";

const repo = () => getRepository();

// Broad invalidation helper — this is a tiny personal app, so simple beats clever.
function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries();
}

// ---- exercises ----
export function useExercises() {
  return useQuery({ queryKey: ["exercises"], queryFn: () => repo().listExercises() });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: ["exercise", id],
    queryFn: () => repo().getExercise(id!),
    enabled: !!id,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NewExercise) => repo().createExercise(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ExercisePatch }) =>
      repo().updateExercise(id, patch),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo().deleteExercise(id),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---- routines ----
export function useRoutines() {
  return useQuery({ queryKey: ["routines"], queryFn: () => repo().listRoutines() });
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: ["routine", id],
    queryFn: () => repo().getRoutine(id!),
    enabled: !!id,
  });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoutineInput }) =>
      id ? repo().updateRoutine(id, input) : repo().createRoutine(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo().deleteRoutine(id),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---- workouts ----
export function useWorkouts(profileId: string | undefined) {
  return useQuery({
    queryKey: ["workouts", profileId],
    queryFn: () => repo().listWorkouts(profileId!),
    enabled: !!profileId,
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: ["workout", id],
    queryFn: () => repo().getWorkout(id!),
    enabled: !!id,
  });
}

export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, routineId }: { profileId: string; routineId: string | null }) =>
      repo().startWorkout(profileId, routineId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useWorkoutMutations(workoutId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["workout", workoutId] });
    qc.invalidateQueries({ queryKey: ["workouts"] });
  };
  return {
    addExercise: useMutation({
      mutationFn: (exerciseId: string) => repo().addWorkoutExercise(workoutId!, exerciseId),
      onSuccess: refresh,
    }),
    removeExercise: useMutation({
      mutationFn: (workoutExerciseId: string) => repo().removeWorkoutExercise(workoutExerciseId),
      onSuccess: refresh,
    }),
    addSet: useMutation({
      mutationFn: ({ workoutExerciseId, set }: { workoutExerciseId: string; set: NewSet }) =>
        repo().addSet(workoutExerciseId, set),
      onSuccess: refresh,
    }),
    updateSet: useMutation({
      mutationFn: ({ setId, patch }: { setId: string; patch: Partial<NewSet> }) =>
        repo().updateSet(setId, patch),
      onSuccess: refresh,
    }),
    completeSet: useMutation({
      mutationFn: ({ setId, completed }: { setId: string; completed: boolean }) =>
        repo().completeSet(setId, completed),
      onSuccess: refresh,
    }),
    deleteSet: useMutation({
      mutationFn: (setId: string) => repo().deleteSet(setId),
      onSuccess: refresh,
    }),
    finish: useMutation({
      mutationFn: () => repo().finishWorkout(workoutId!),
      onSuccess: () => invalidateAll(qc),
    }),
    remove: useMutation({
      mutationFn: (id: string) => repo().deleteWorkout(id),
      onSuccess: () => invalidateAll(qc),
    }),
  };
}

// ---- analytics ----
export function useExerciseHistory(profileId: string | undefined, exerciseId: string | undefined) {
  return useQuery({
    queryKey: ["history", profileId, exerciseId],
    queryFn: () => repo().getExerciseHistory(profileId!, exerciseId!),
    enabled: !!profileId && !!exerciseId,
  });
}

export function useProgress(profileId: string | undefined, exerciseId: string | undefined) {
  return useQuery({
    queryKey: ["progress", profileId, exerciseId],
    queryFn: () => repo().getProgress(profileId!, exerciseId!),
    enabled: !!profileId && !!exerciseId,
  });
}

export function usePersonalRecords(
  profileId: string | undefined,
  exerciseId: string | undefined,
) {
  return useQuery({
    queryKey: ["prs", profileId, exerciseId],
    queryFn: () => repo().getPersonalRecords(profileId!, exerciseId!),
    enabled: !!profileId && !!exerciseId,
  });
}

export function useStats(profileId: string | undefined) {
  return useQuery({
    queryKey: ["stats", profileId],
    queryFn: () => repo().getStats(profileId!),
    enabled: !!profileId,
  });
}
