import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProfile } from "../state/profile";
import {
  useExerciseHistory,
  usePersonalRecords,
  useWorkout,
  useWorkoutMutations,
} from "../queries";
import ExercisePicker from "../components/ExercisePicker";
import {
  estimateE1rm,
  suggestNextSets,
  warmupSets,
  type ProgressionStatus,
} from "../lib/progression/engine";
import type {
  Exercise,
  PersonalRecords,
  WorkoutExerciseWithSets,
  WorkoutSet,
} from "../lib/db";

const statusStyles: Record<ProgressionStatus, string> = {
  new: "bg-subtle text-muted",
  hold: "bg-info-soft text-info",
  progress: "bg-ok-soft text-ok",
  deload: "bg-warn-soft text-warn",
};

// Rest countdown shown after completing a set. Deliberately generous —
// short enough to keep a session moving, long enough for a real recovery.
const DEFAULT_REST_SECONDS = 90;

function fmtRest(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Workout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { data: workout, isLoading } = useWorkout(id);
  const m = useWorkoutMutations(id);
  const [picking, setPicking] = useState(false);

  // Rest timer is lifted here (not per-card) so it survives switching
  // between exercise cards mid-workout, and only one can ever be running.
  const [restSeconds, setRestSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (restSeconds === null) return undefined;
    const tick = setInterval(() => {
      setRestSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // Only (re)start the interval when the timer turns on/off — bumping the
    // remaining time (e.g. "+30s") must not tear down the running interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restSeconds === null]);

  function startRestTimer() {
    setRestSeconds(DEFAULT_REST_SECONDS);
  }

  if (isLoading || !workout) return <p className="text-muted">Loading…</p>;

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
        <p className="text-sm text-muted">Add an exercise to begin logging.</p>
      )}

      <div className="space-y-3">
        {workout.exercises.map((we) => (
          <ExerciseCard
            key={we.id}
            we={we}
            profileId={activeProfile?.id}
            m={m}
            onSetCompleted={startRestTimer}
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

      {restSeconds !== null && (
        <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center px-4">
          <div className="card flex items-center gap-3 rounded-full px-4 py-2 shadow-lg">
            <span className="text-sm text-muted">Rust</span>
            <span className="min-w-[3ch] text-center font-mono text-lg font-bold tabular-nums">
              {fmtRest(restSeconds)}
            </span>
            <button
              onClick={() => setRestSeconds((s) => (s ?? 0) + 30)}
              className="btn-ghost px-3 py-1 text-sm"
            >
              +30s
            </button>
            <button
              onClick={() => setRestSeconds(null)}
              className="btn-ghost px-3 py-1 text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Mutations = ReturnType<typeof useWorkoutMutations>;

function ExerciseCard({
  we,
  profileId,
  m,
  onSetCompleted,
}: {
  we: WorkoutExerciseWithSets;
  profileId: string | undefined;
  m: Mutations;
  onSetCompleted: () => void;
}) {
  const { exercise, sets } = we;
  const { data: history = [] } = useExerciseHistory(profileId, exercise.id);
  const { data: prs } = usePersonalRecords(profileId, exercise.id);
  const [adding, setAdding] = useState(false);

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

  async function addSuggestedSets() {
    if (adding) return;
    setAdding(true);
    try {
      // Awaited sequentially — firing these concurrently raced on the
      // set-number computation and could produce duplicate set numbers.
      for (const s of suggestion.sets) {
        await m.addSet.mutateAsync({
          workoutExerciseId: we.id,
          set: { weightKg: s.weightKg, reps: s.reps, isWarmup: false },
        });
      }
    } catch {
      // Already reported via the mutation's onError toast; stop the loop.
    } finally {
      setAdding(false);
    }
  }

  async function addWarmups() {
    if (adding) return;
    setAdding(true);
    try {
      const working = suggestion.sets[0]?.weightKg ?? 0;
      for (const s of warmupSets(working, exercise.defaultIncrementKg)) {
        await m.addSet.mutateAsync({
          workoutExerciseId: we.id,
          set: { weightKg: s.weightKg, reps: s.reps, isWarmup: true },
        });
      }
    } catch {
      // Already reported via the mutation's onError toast; stop the loop.
    } finally {
      setAdding(false);
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
          <p className="text-xs text-muted">
            target {exercise.defaultRepMin}–{exercise.defaultRepMax} reps
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm(`Remove ${exercise.name} and its logged sets from this workout?`)) {
              m.removeExercise.mutate(we.id);
            }
          }}
          className="text-sm text-danger"
        >
          remove
        </button>
      </div>

      <div className={`rounded-xl px-3 py-2 text-sm ${statusStyles[suggestion.status]}`}>
        <span className="mr-1 font-semibold uppercase">{suggestion.status}</span>
        {suggestion.reasoning}
      </div>

      {ordered.length === 0 ? (
        <div className="flex gap-2">
          <button onClick={addSuggestedSets} disabled={adding} className="btn-primary flex-1 disabled:opacity-50">
            {adding ? "Adding…" : `Add ${suggestion.sets.length} suggested sets`}
          </button>
          {suggestion.sets[0]?.weightKg > 0 && (
            <button onClick={addWarmups} disabled={adding} className="btn-ghost disabled:opacity-50">
              + Warm-up
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 text-xs text-muted">
              <span>Set</span>
              <span>kg</span>
              <span>reps</span>
              <span></span>
            </div>
            {ordered.map((s, i) => (
              <SetRow
                key={s.id}
                set={s}
                index={i + 1}
                m={m}
                incrementKg={exercise.defaultIncrementKg}
                prs={prs}
                onCompleted={onSetCompleted}
              />
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function StepButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-8 w-8 shrink-0 rounded-lg bg-subtle text-sm font-semibold text-ink"
    >
      {label}
    </button>
  );
}

function SetRow({
  set,
  index,
  m,
  incrementKg,
  prs,
  onCompleted,
}: {
  set: WorkoutSet;
  index: number;
  m: Mutations;
  incrementKg: number;
  prs: PersonalRecords | null | undefined;
  onCompleted: () => void;
}) {
  const [weight, setWeight] = useState(String(set.weightKg));
  const [reps, setReps] = useState(String(set.reps));
  const [showPr, setShowPr] = useState(false);
  const done = !!set.completedAt;

  function persist() {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (w !== set.weightKg || r !== set.reps) {
      m.updateSet.mutate({ setId: set.id, patch: { weightKg: w, reps: r } });
    }
  }

  // Steppers persist immediately (feels better than waiting for blur) using
  // the same updateSet mutation — and its existing onError toast — as the
  // onBlur path below.
  function stepWeight(delta: number) {
    const w = round2(Math.max(0, (Number(weight) || 0) + delta));
    setWeight(String(w));
    m.updateSet.mutate({ setId: set.id, patch: { weightKg: w, reps: Number(reps) || 0 } });
  }

  function stepReps(delta: number) {
    const r = Math.max(0, (Number(reps) || 0) + delta);
    setReps(String(r));
    m.updateSet.mutate({ setId: set.id, patch: { weightKg: Number(weight) || 0, reps: r } });
  }

  function toggle() {
    const completing = !done;
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;

    // Snapshot the PR *before* completeSet's onSuccess invalidates the prs
    // query — once that refetch lands, this same set is already counted and
    // the comparison would always read "no new record".
    if (completing && !set.isWarmup && w > 0 && r > 0) {
      const newE1rm = estimateE1rm(w, r);
      const beatsWeight = w > (prs?.bestWeightKg ?? 0);
      const beatsE1rm = newE1rm > (prs?.bestE1rm ?? 0);
      if (beatsWeight || beatsE1rm) {
        setShowPr(true);
        setTimeout(() => setShowPr(false), 4000);
      }
    }

    persist();
    m.completeSet.mutate({ setId: set.id, completed: completing });
    if (completing) onCompleted();
  }

  return (
    <div className="space-y-1">
      <div
        className={`grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 rounded-lg px-1 py-0.5 ${
          done ? "bg-ok-soft" : ""
        }`}
      >
        <span className="text-center text-sm text-muted">
          {set.isWarmup ? "W" : index}
        </span>
        <div className="flex items-center gap-1">
          <StepButton label="−" onClick={() => stepWeight(-incrementKg)} />
          <input
            className="input min-w-0 py-1.5 text-center"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={persist}
          />
          <StepButton label="+" onClick={() => stepWeight(incrementKg)} />
        </div>
        <div className="flex items-center gap-1">
          <StepButton label="−" onClick={() => stepReps(-1)} />
          <input
            className="input min-w-0 py-1.5 text-center"
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={persist}
          />
          <StepButton label="+" onClick={() => stepReps(1)} />
        </div>
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={toggle}
            className={`h-11 w-11 rounded-lg text-sm ${
              done ? "bg-ok text-white" : "bg-subtle text-ink"
            }`}
          >
            ✓
          </button>
        </div>
      </div>
      {showPr && (
        <p className="px-1 text-xs font-semibold text-ok">Nieuw record! 🎉</p>
      )}
    </div>
  );
}
