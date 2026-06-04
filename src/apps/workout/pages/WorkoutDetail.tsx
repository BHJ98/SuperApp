import { useNavigate, useParams } from "react-router-dom";
import { useWorkout, useWorkoutMutations } from "../queries";
import { fmtDate, fmtWeight } from "../lib/format";

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: workout, isLoading } = useWorkout(id);
  const m = useWorkoutMutations(id);

  if (isLoading || !workout) return <p className="text-slate-500">Loading…</p>;

  const totalVolume = workout.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0);

  async function remove() {
    if (!confirm("Delete this workout?")) return;
    await m.remove.mutateAsync(workout!.id);
    navigate("/workout/history");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{fmtDate(workout.startedAt)}</h2>
        <p className="text-sm text-slate-400">
          {workout.routine?.name ?? "Ad-hoc"} · {fmtWeight(Math.round(totalVolume))} kg volume
        </p>
      </div>

      {!workout.finishedAt && (
        <button onClick={() => navigate(`/workout/session/${workout.id}`)} className="btn-primary w-full">
          Resume workout
        </button>
      )}

      <div className="space-y-3">
        {workout.exercises.map((we) => (
          <div key={we.id} className="card">
            <p className="mb-2 font-medium">{we.exercise.name}</p>
            <div className="space-y-1 text-sm">
              {we.sets
                .sort((a, b) => a.setNumber - b.setNumber)
                .map((s) => (
                  <div key={s.id} className="flex justify-between text-slate-300">
                    <span className="text-slate-500">
                      {s.isWarmup ? "Warm-up" : `Set ${s.setNumber}`}
                    </span>
                    <span>
                      {fmtWeight(s.weightKg)} kg × {s.reps}
                    </span>
                  </div>
                ))}
              {we.sets.length === 0 && <p className="text-slate-500">No sets logged.</p>}
            </div>
          </div>
        ))}
      </div>

      <button onClick={remove} className="btn-danger w-full">
        Delete workout
      </button>
    </div>
  );
}
