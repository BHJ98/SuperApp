import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useExercises } from "../queries";
import { BODY_REGIONS } from "../lib/exerciseMeta";

export default function Exercises() {
  const navigate = useNavigate();
  const { data: exercises = [], isLoading } = useExercises();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((e) => {
      const matchesText =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.primaryMuscle.toLowerCase().includes(q);
      const matchesRegion = region === "all" || e.bodyRegion === region;
      return matchesText && matchesRegion;
    });
  }, [exercises, search, region]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Exercises</h2>
        <button onClick={() => navigate("/workout/exercises/new")} className="btn-primary">
          + Add
        </button>
      </div>

      <input
        className="input"
        placeholder="Search by name or muscle…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all", ...BODY_REGIONS].map((r) => (
          <button
            key={r}
            onClick={() => setRegion(r)}
            className={`chip capitalize ${region === r ? "bg-blue-600 text-white" : ""}`}
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Link key={e.id} to={`/workout/exercises/${e.id}`} className="card flex items-center justify-between">
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-xs text-slate-400">
                  {e.primaryMuscle} · {e.equipment} · {e.movementPattern}
                </p>
              </div>
              <span className="chip capitalize">{e.bodyRegion}</span>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-slate-500">No exercises match.</p>
          )}
        </div>
      )}
    </div>
  );
}
