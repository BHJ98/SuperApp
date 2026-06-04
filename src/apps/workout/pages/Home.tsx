import { useNavigate } from "react-router-dom";
import { useProfile } from "../state/profile";
import { useRoutines, useStartWorkout, useWorkouts } from "../queries";
import { fmtRelative } from "../lib/format";

export default function Home() {
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const { data: routines = [] } = useRoutines();
  const { data: workouts = [] } = useWorkouts(activeProfile?.id);
  const startWorkout = useStartWorkout();

  const ongoing = workouts.find((w) => !w.finishedAt);
  const recent = workouts.filter((w) => w.finishedAt).slice(0, 3);

  async function start(routineId: string | null) {
    if (!activeProfile) return;
    const id = await startWorkout.mutateAsync({ profileId: activeProfile.id, routineId });
    navigate(`/workout/session/${id}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-slate-400">Welcome back,</p>
        <h2 className="text-2xl font-bold" style={{ color: activeProfile?.color }}>
          {activeProfile?.name ?? "…"}
        </h2>
      </div>

      {ongoing && (
        <button onClick={() => navigate(`/workout/session/${ongoing.id}`)} className="card w-full text-left">
          <p className="text-xs uppercase tracking-wide text-amber-400">Workout in progress</p>
          <p className="font-medium">Tap to resume · started {fmtRelative(ongoing.startedAt)}</p>
        </button>
      )}

      <button onClick={() => start(null)} className="btn-primary w-full py-3 text-base">
        Start empty workout
      </button>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Routines</h3>
          <button onClick={() => navigate("/workout/routines/new")} className="text-sm text-blue-400">
            + New
          </button>
        </div>
        {routines.length === 0 ? (
          <p className="text-sm text-slate-500">
            No routines yet. Create one to start a workout in a tap.
          </p>
        ) : (
          <div className="space-y-2">
            {routines.map((r) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.exercises.length} exercises</p>
                </div>
                <button onClick={() => start(r.id)} className="btn-ghost">
                  Start
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Recent</h3>
          <div className="space-y-2">
            {recent.map((w) => (
              <button
                key={w.id}
                onClick={() => navigate(`/workout/history/${w.id}`)}
                className="card flex w-full items-center justify-between text-left"
              >
                <span>{fmtRelative(w.startedAt)}</span>
                <span className="text-slate-500">›</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
