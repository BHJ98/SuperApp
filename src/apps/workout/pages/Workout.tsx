import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProfile } from "../state/profile";
import {
  useExerciseHistory,
  useWorkout,
  useWorkoutMutations,
} from "../queries";
import ExercisePicker from "../components/ExercisePicker";
import { suggestNextSets, warmupSets, type ProgressionStatus } from "../lib/progression/engine";
import type { Exercise, WorkoutExerciseWithSets, WorkoutSet } from "../lib/db";

const statusStyles: Record<ProgressionStatus, string> = {
  new: "bg-slate-700 text-slate-200",
  hold: "bg-sky-600/30 text-sky-300",
  progress: "bg-green-600/30 text-green-300",
  deload: "bg-amber-600/30 text-amber-300",
};

export default function Workout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { data: workout, isLoading } = useWorkout(id);
  const m = useWorkoutMutations(id);
  const [picking, setPicking] = useState(false);

  if (isLoading || !workout) return <p className="text-slate-500">Loading…</p>;

  const existingIds = workout.exercises.map((e) => e.exerciseId);

  async function finish() {
    await m.finish.mutateAsync();
    navigate(`/workout/history/${id}`);
  }

  async function discard() {
    if (!confirm("Discard this workout and all its sets?")) return;
    await m.remove.mutateAsync(workout!.id);
    navigate("/workout");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{workout.routine?.name ?? "Workout"}</h2>
        {workout.finishedAt && <span className="chip">finished</span>}
      </div>

      {workout.exercises.length === 0 && (
        <p className="text-sm text-slate-500">Add an exercise to begin logging.</p>
      )}

      <div className="space-y-3">
        {workout.exercises.map((we) => (
          <ExerciseCard
            key={we.id}
            we={we}
            profileId={activeProfile?.id}
            m={m}
          />
        ))}
      </div>

      <button onClick={() => setPicking(true)} className="btn-ghost w-full">
        + Add exercise
      </button>

      {!workout.finishedAt && (
        <div className="flex gap-2">
          <button onClick={discard} className="btn-danger flex-1">Discard</button>
          <button onClick={finish} className="btn-primary flex-1">Finish workout</button>
        </div>
      )}

      {picking && (
        <ExercisePicker
          excludeIds={existingIds}
          onClose={() => setPicking(false)}
          onPick={(ex: Exercise) => {
            m.addExercise.mutate(ex.id);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

type Mutations = ReturnType<typeof useWorkoutMutations>;

function ExerciseCard({
  we,
  profileId,
  m,
}: {
  we: WorkoutExerciseWithSets;
  profileId: string | undefined;
  m: Mutations;
}) {
  const { exercise, sets } = we;
  const { data: history = [] } = useExerciseHistory(profileId, exercise.id);

  const targetSets = useMemo(() => {
    const last = history.filter((s) => s.sets.length > 0).at(-1);
    return last?.sets.length ?? 3;
  }, [history]);

  const suggestion = useMemo(
    () =>
      suggestNextSets({
        repMin: exercise.defaultRepMin,
        repMax: exercise.defaultRepMax,
        incrementKg: exercise.defaultIncrementKg,
        targetSets,
        history,
      }),
    [exercise, targetSets, history],
  );

  function addSuggestedSets() {
    for (const s of suggestion.sets) {
      m.addSet.mutate({
        workoutExerciseId: we.id,
        set: { weightKg: s.weightKg, reps: s.reps, isWarmup: false },
      });
    }
  }

  function addWarmups() {
    const working = suggestion.sets[0]?.weightKg ?? 0;
    for (const s of warmupSets(working, exercise.defaultIncrementKg)) {
      m.addSet.mutate({
        workoutExerciseId: we.id,
        set: { weightKg: s.weightKg, reps: s.reps, isWarmup: true },
      });
    }
  }

  function addOneSet() {
    const last = sets.filter((s) => !s.isWarmup).at(-1);
    m.addSet.mutate({
      workoutExerciseId: we.id,
      set: {
        weightKg: last?.weightKg ?? suggestion.sets[0]?.weightKg ?? 0,
        reps: last?.reps ?? suggestion.targetReps,
        isWarmup: false,
      },
    });
  }

  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber);

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{exercise.name}</p>
          <p className="text-xs text-slate-400">
            target {exercise.defaultRepMin}–{exercise.defaultRepMax} reps
          </p>
        </div>
        <button onClick={() => m.removeExercise.mutate(we.id)} className="text-sm text-red-400">
          remove
        </button>
      </div>

      <div className={`rounded-xl px-3 py-2 text-sm ${statusStyles[suggestion.status]}`}>
        <span className="mr-1 font-semibold uppercase">{suggestion.status}</span>
        {suggestion.reasoning}
      </div>

      {ordered.length === 0 ? (
        <div className="flex gap-2">
          <button onClick={addSuggestedSets} className="btn-primary flex-1">
            Add {suggestion.sets.length} suggested sets
          </button>
          {suggestion.sets[0]?.weightKg > 0 && (
            <button onClick={addWarmups} className="btn-ghost">
              + Warm-up
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 text-xs text-slate-500">
              <span>Set</span>
              <span>kg</span>
              <span>reps</span>
              <span></span>
            </div>
            {ordered.map((s, i) => (
              <SetRow key={s.id} set={s} index={i + 1} m={m} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={addOneSet} className="btn-ghost flex-1">+ Set</button>
            {!sets.some((s) => s.isWarmup) && suggestion.sets[0]?.weightKg > 0 && (
              <button onClick={addWarmups} className="btn-ghost">+ Warm-up</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SetRow({ set, index, m }: { set: WorkoutSet; index: number; m: Mutations }) {
  const [weight, setWeight] = useState(String(set.weightKg));
  const [reps, setReps] = useState(String(set.reps));
  const done = !!set.completedAt;

  function persist() {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (w !== set.weightKg || r !== set.reps) {
      m.updateSet.mutate({ setId: set.id, patch: { weightKg: w, reps: r } });
    }
  }

  function toggle() {
    persist();
    m.completeSet.mutate({ setId: set.id, completed: !done });
  }

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 rounded-lg px-1 py-0.5 ${
        done ? "bg-green-900/20" : ""
      }`}
    >
      <span className="text-center text-sm text-slate-400">
        {set.isWarmup ? "W" : index}
      </span>
      <input
        className="input py-1.5 text-center"
        type="number"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={persist}
      />
      <input
        className="input py-1.5 text-center"
        type="number"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={persist}
      />
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={toggle}
          className={`h-8 w-8 rounded-lg text-sm ${
            done ? "bg-green-600 text-white" : "bg-slate-700 text-slate-300"
          }`}
        >
          ✓
        </button>
      </div>
    </div>
  );
}
