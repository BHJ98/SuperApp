import { Link } from "react-router-dom";
import { useProfile } from "../state/profile";
import { useWorkouts } from "../queries";
import { fmtDate, fmtRelative } from "../lib/format";

export default function History() {
  const { activeProfile } = useProfile();
  const { data: workouts = [] } = useWorkouts(activeProfile?.id);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">History</h2>
      {workouts.length === 0 && <p className="text-sm text-muted">No workouts logged yet.</p>}
      <div className="space-y-2">
        {workouts.map((w) => (
          <Link key={w.id} to={`/workout/history/${w.id}`} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{fmtDate(w.startedAt)}</p>
              <p className="text-xs text-muted">
                {w.finishedAt ? fmtRelative(w.finishedAt) : "in progress"}
              </p>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
