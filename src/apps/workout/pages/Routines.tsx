import { useNavigate } from "react-router-dom";
import { useDeleteRoutine, useRoutines, useStartWorkout } from "../queries";
import { useProfile } from "../state/profile";

export default function Routines() {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { data: routines = [] } = useRoutines();
  const del = useDeleteRoutine();
  const start = useStartWorkout();

  async function startWorkout(routineId: string) {
    if (!activeProfile) return;
    const id = await start.mutateAsync({ profileId: activeProfile.id, routineId });
    navigate(`/workout/session/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Routines</h2>
        <button onClick={() => navigate("/workout/routines/new")} className="btn-primary">
          + New
        </button>
      </div>

      {routines.length === 0 && (
        <p className="text-sm text-slate-500">
          No routines yet. Build one (e.g. “Push Day”) to start workouts quickly.
        </p>
      )}

      <div className="space-y-2">
        {routines.map((r) => (
          <div key={r.id} className="card space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-slate-400">
                  {r.exercises.map((e) => e.exercise.name).join(", ") || "No exercises"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startWorkout(r.id)} className="btn-primary flex-1">
                Start
              </button>
              <button onClick={() => navigate(`/workout/routines/${r.id}/edit`)} className="btn-ghost">
                Edit
              </button>
              <button
                onClick={() => confirm(`Delete "${r.name}"?`) && del.mutate(r.id)}
                className="btn-ghost"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
