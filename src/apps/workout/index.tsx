export default function Workout() {
  return <Placeholder name="Workout" note="Ported from WorkoutTracker in task 3." />;
}

function Placeholder({ name, note }: { name: string; note: string }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold">{name}</h2>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}
