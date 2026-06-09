export default function Finance() {
  return (
    <div className="card" data-app="finance">
      <div
        className="mb-3 h-0.5 w-8 rounded-full"
        style={{ background: "var(--accent-finance)" }}
      />
      <h2
        className="font-display text-lg font-semibold tracking-tight"
        style={{ color: "var(--ink)" }}
      >
        Finance
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Ported from BHJ98/PersonalFinance1 in task 5.
      </p>
    </div>
  );
}
