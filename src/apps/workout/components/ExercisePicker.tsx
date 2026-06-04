import { useMemo, useState } from "react";
import { useExercises } from "../queries";
import type { Exercise } from "../lib/db";

interface Props {
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
  excludeIds?: string[];
}

export default function ExercisePicker({ onPick, onClose, excludeIds = [] }: Props) {
  const { data: exercises = [] } = useExercises();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter(
      (e) =>
        !excludeIds.includes(e.id) &&
        (!q || e.name.toLowerCase().includes(q) || e.primaryMuscle.toLowerCase().includes(q)),
    );
  }, [exercises, search, excludeIds]);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Add exercise</h3>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
        <input
          autoFocus
          className="input mb-3"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1 space-y-2 overflow-y-auto">
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e)}
              className="card flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-xs text-slate-400">
                  {e.primaryMuscle} · {e.equipment}
                </p>
              </div>
              <span className="text-blue-400">＋</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-slate-500">No matches.</p>}
        </div>
      </div>
    </div>
  );
}
