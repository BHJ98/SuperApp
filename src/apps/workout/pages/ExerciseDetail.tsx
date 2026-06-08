import { lazy, Suspense } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { useProfile } from "../state/profile";
import { useDeleteExercise, useExercise, usePersonalRecords, useProgress } from "../queries";
import { fmtWeight } from "../lib/format";

const ProgressChart = lazy(() => import("../components/ProgressChart"));

export default function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { data: exercise } = useExercise(id);
  const { data: progress = [] } = useProgress(activeProfile?.id, id);
  const { data: prs } = usePersonalRecords(activeProfile?.id, id);
  const del = useDeleteExercise();

  if (!exercise) return <p className="text-slate-500">Loading…</p>;

  const chartData = progress.map((p) => ({
    label: format(new Date(p.date), "d MMM"),
    e1rm: p.bestE1rm,
    top: p.topWeightKg,
  }));

  async function remove() {
    if (!confirm(`Delete "${exercise!.name}"? Used exercises are archived instead.`)) return;
    await del.mutateAsync(exercise!.id);
    navigate("/workout/exercises");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{exercise.name}</h2>
          <p className="text-sm text-slate-400">
            {exercise.primaryMuscle} · {exercise.equipment} · {exercise.mechanic}
          </p>
        </div>
        <Link to={`/workout/exercises/${exercise.id}/edit`} className="text-sm text-blue-400">
          Edit
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip capitalize">{exercise.bodyRegion}</span>
        <span className="chip capitalize">{exercise.movementPattern}</span>
        <span className="chip capitalize">{exercise.laterality}</span>
        <span className="chip">
          target {exercise.defaultRepMin}–{exercise.defaultRepMax} reps
        </span>
        <span className="chip">+{fmtWeight(exercise.defaultIncrementKg)} kg</span>
      </div>

      {prs && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card">
            <p className="text-xs text-slate-400">Best weight</p>
            <p className="text-lg font-bold">{fmtWeight(prs.bestWeightKg)} kg</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-400">Est. 1RM</p>
            <p className="text-lg font-bold">{fmtWeight(prs.bestE1rm)} kg</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-400">Reps @ top</p>
            <p className="text-lg font-bold">{prs.bestRepsAtTopWeight}</p>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold">Progress</h3>
        {chartData.length < 2 ? (
          <p className="text-sm text-slate-500">
            Log this exercise a couple of times to see your trend.
          </p>
        ) : (
          <Suspense fallback={<p className="text-sm text-slate-500">Loading chart…</p>}>
            <ProgressChart data={chartData} />
          </Suspense>
        )}
      </div>

      {exercise.notes && <p className="text-sm text-slate-400">{exercise.notes}</p>}

      <button onClick={remove} className="btn-danger w-full">
        Delete exercise
      </button>
    </div>
  );
}
