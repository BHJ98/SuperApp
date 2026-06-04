import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCreateExercise, useExercise, useUpdateExercise } from "../queries";
import {
  BODY_REGIONS,
  COMMON_MUSCLES,
  EQUIPMENT,
  LATERALITIES,
  MECHANICS,
  MOVEMENT_PATTERNS,
  exerciseSchema,
  type ExerciseFormValues,
} from "../lib/exerciseMeta";

const empty: ExerciseFormValues = {
  name: "",
  primaryMuscle: "Chest",
  bodyRegion: "upper",
  movementPattern: "push",
  equipment: "barbell",
  mechanic: "compound",
  laterality: "bilateral",
  defaultRepMin: 8,
  defaultRepMax: 12,
  defaultIncrementKg: 2.5,
  notes: "",
};

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

export default function ExerciseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: existing } = useExercise(id);
  const create = useCreateExercise();
  const update = useUpdateExercise();

  const [values, setValues] = useState<ExerciseFormValues>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing) {
      setValues({
        name: existing.name,
        primaryMuscle: existing.primaryMuscle,
        bodyRegion: existing.bodyRegion,
        movementPattern: existing.movementPattern,
        equipment: existing.equipment,
        mechanic: existing.mechanic,
        laterality: existing.laterality,
        defaultRepMin: existing.defaultRepMin,
        defaultRepMax: existing.defaultRepMax,
        defaultIncrementKg: existing.defaultIncrementKg,
        notes: existing.notes,
      });
    }
  }, [existing]);

  function set<K extends keyof ExerciseFormValues>(key: K, value: ExerciseFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit() {
    const parsed = exerciseSchema.safeParse(values);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    const data = { ...parsed.data, notes: parsed.data.notes ?? "" };
    if (id) await update.mutateAsync({ id, patch: data });
    else await create.mutateAsync(data);
    navigate(-1);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{id ? "Edit exercise" : "New exercise"}</h2>

      <Field label="Name" error={errors.name}>
        <input className="input" value={values.name} onChange={(e) => set("name", e.target.value)} />
      </Field>

      <Field label="Primary muscle" error={errors.primaryMuscle}>
        <input
          className="input"
          list="muscles"
          value={values.primaryMuscle}
          onChange={(e) => set("primaryMuscle", e.target.value)}
        />
        <datalist id="muscles">
          {COMMON_MUSCLES.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Body region">
          <select className="input capitalize" value={values.bodyRegion} onChange={(e) => set("bodyRegion", e.target.value as ExerciseFormValues["bodyRegion"])}>
            {BODY_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Movement">
          <select className="input capitalize" value={values.movementPattern} onChange={(e) => set("movementPattern", e.target.value as ExerciseFormValues["movementPattern"])}>
            {MOVEMENT_PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Equipment">
          <select className="input capitalize" value={values.equipment} onChange={(e) => set("equipment", e.target.value as ExerciseFormValues["equipment"])}>
            {EQUIPMENT.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </Field>
        <Field label="Mechanic">
          <select className="input capitalize" value={values.mechanic} onChange={(e) => set("mechanic", e.target.value as ExerciseFormValues["mechanic"])}>
            {MECHANICS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Laterality">
          <select className="input capitalize" value={values.laterality} onChange={(e) => set("laterality", e.target.value as ExerciseFormValues["laterality"])}>
            {LATERALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Increment (kg)" error={errors.defaultIncrementKg}>
          <input className="input" type="number" step="0.5" inputMode="decimal" value={values.defaultIncrementKg} onChange={(e) => set("defaultIncrementKg", Number(e.target.value))} />
        </Field>
        <Field label="Min reps" error={errors.defaultRepMin}>
          <input className="input" type="number" inputMode="numeric" value={values.defaultRepMin} onChange={(e) => set("defaultRepMin", Number(e.target.value))} />
        </Field>
        <Field label="Max reps" error={errors.defaultRepMax}>
          <input className="input" type="number" inputMode="numeric" value={values.defaultRepMax} onChange={(e) => set("defaultRepMax", Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea className="input" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="flex gap-2">
        <button onClick={() => navigate(-1)} className="btn-ghost flex-1">Cancel</button>
        <button onClick={submit} className="btn-primary flex-1">Save</button>
      </div>
    </div>
  );
}
