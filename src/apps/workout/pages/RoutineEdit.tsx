import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRoutine, useSaveRoutine } from "../queries";
import ExercisePicker from "../components/ExercisePicker";
import type { Exercise } from "../lib/db";

interface Row {
  exerciseId: string;
  name: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
}

export default function RoutineEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: existing } = useRoutine(id);
  const save = useSaveRoutine();

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setNotes(existing.notes);
      setRows(
        existing.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          name: e.exercise.name,
          targetSets: e.targetSets,
          targetRepMin: e.targetRepMin,
          targetRepMax: e.targetRepMax,
        })),
      );
    }
  }, [existing]);

  function addExercise(ex: Exercise) {
    setRows((r) => [
      ...r,
      {
        exerciseId: ex.id,
        name: ex.name,
        targetSets: 3,
        targetRepMin: ex.defaultRepMin,
        targetRepMax: ex.defaultRepMax,
      },
    ]);
    setPicking(false);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function move(i: number, dir: -1 | 1) {
    setRows((r) => {
      const next = [...r];
      const j = i + dir;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) return;
    await save.mutateAsync({
      id,
      input: {
        name: name.trim(),
        notes,
        exercises: rows.map((row, i) => ({
          exerciseId: row.exerciseId,
          sortOrder: i,
          targetSets: row.targetSets,
          targetRepMin: row.targetRepMin,
          targetRepMax: row.targetRepMax,
        })),
      },
    });
    navigate("/workout/routines");
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{id ? "Edit routine" : "New routine"}</h2>

      <label className="block">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Push Day" />
      </label>
      <label className="block">
        <span className="label">Notes</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{row.name}</p>
              <div className="flex gap-1 text-slate-400">
                <button onClick={() => move(i, -1)}>↑</button>
                <button onClick={() => move(i, 1)}>↓</button>
                <button onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className="text-red-400">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="label">Sets</span>
                <input className="input" type="number" inputMode="numeric" value={row.targetSets} onChange={(e) => updateRow(i, { targetSets: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="label">Rep min</span>
                <input className="input" type="number" inputMode="numeric" value={row.targetRepMin} onChange={(e) => updateRow(i, { targetRepMin: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="label">Rep max</span>
                <input className="input" type="number" inputMode="numeric" value={row.targetRepMax} onChange={(e) => updateRow(i, { targetRepMax: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setPicking(true)} className="btn-ghost w-full">
        + Add exercise
      </button>

      <div className="flex gap-2">
        <button onClick={() => navigate(-1)} className="btn-ghost flex-1">Cancel</button>
        <button onClick={submit} disabled={!name.trim()} className="btn-primary flex-1">Save routine</button>
      </div>

      {picking && (
        <ExercisePicker
          onPick={addExercise}
          onClose={() => setPicking(false)}
          excludeIds={rows.map((r) => r.exerciseId)}
        />
      )}
    </div>
  );
}
