import { Link } from "react-router-dom";

interface AppEntry {
  to: string;
  label: string;
  description: string;
  accent: string;
}

const apps: AppEntry[] = [
  {
    to: "/workout",
    label: "Workout",
    description: "Routines, sets, progressive overload",
    accent: "from-blue-500/30 to-blue-700/20 border-blue-500/40",
  },
  {
    to: "/groceries",
    label: "Boodschappen",
    description: "Shopping list & meal plans",
    accent: "from-emerald-500/30 to-emerald-700/20 border-emerald-500/40",
  },
  {
    to: "/finance",
    label: "Finance",
    description: "Spending, accounts, budgets",
    accent: "from-amber-500/30 to-amber-700/20 border-amber-500/40",
  },
  {
    to: "/bakjes",
    label: "Bakjes",
    description: "Bakjesmethode planning",
    accent: "from-fuchsia-500/30 to-fuchsia-700/20 border-fuchsia-500/40",
  },
];

export function Dashboard() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Pick an app.</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {apps.map((app) => (
          <li key={app.to}>
            <Link
              to={app.to}
              className={`block rounded-2xl border bg-gradient-to-br p-5 transition active:scale-[0.99] hover:bg-slate-800/40 ${app.accent}`}
            >
              <div className="text-lg font-semibold">{app.label}</div>
              <div className="mt-1 text-sm text-slate-300/80">{app.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
