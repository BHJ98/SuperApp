import { useProfile } from "../state/profile";
import { useStats } from "../queries";
import { fmtWeight } from "../lib/format";

export default function Stats() {
  const { activeProfile } = useProfile();
  const { data: stats } = useStats(activeProfile?.id);

  if (!stats) return <p className="text-slate-500">Loading…</p>;

  const maxSets = Math.max(1, ...stats.setsByMuscle.map((s) => s.sets));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Stats</h2>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card">
          <p className="text-xs text-slate-400">This week</p>
          <p className="text-2xl font-bold">{stats.workoutsThisWeek}</p>
          <p className="text-xs text-slate-500">workouts</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400">4 weeks</p>
          <p className="text-2xl font-bold">{stats.workoutsLast4Weeks}</p>
          <p className="text-xs text-slate-500">workouts</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400">Volume</p>
          <p className="text-2xl font-bold">{fmtWeight(stats.totalVolumeThisWeekKg)}</p>
          <p className="text-xs text-slate-500">kg this week</p>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold">Sets per muscle (this week)</h3>
        {stats.setsByMuscle.length === 0 ? (
          <p className="text-sm text-slate-500">No working sets logged this week.</p>
        ) : (
          <div className="space-y-2">
            {stats.setsByMuscle.map((row) => (
              <div key={row.muscle}>
                <div className="mb-0.5 flex justify-between text-xs text-slate-400">
                  <span>{row.muscle}</span>
                  <span>{row.sets}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${(row.sets / maxSets) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
