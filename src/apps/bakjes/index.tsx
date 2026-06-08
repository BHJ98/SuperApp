import { NavLink, Route, Routes } from "react-router-dom";
import { AppDataProvider, useAppData } from "./providers";
import Dashboard from "./pages/Dashboard";
import Inventariseren from "./pages/Inventariseren";
import Bakjes from "./pages/Bakjes";
import Regels from "./pages/Regels";
import Instellingen from "./pages/Instellingen";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";

const navItems = [
  { to: "/bakjes", label: "Dashboard", end: true },
  { to: "/bakjes/inventariseren", label: "Inventariseren" },
  { to: "/bakjes/bakjes", label: "Bakjes" },
  { to: "/bakjes/regels", label: "Regels" },
  { to: "/bakjes/instellingen", label: "Instellingen" },
];

function SyncBadge() {
  const { syncStatus, ready } = useAppData();
  if (!ready) return null;
  const map: Record<string, { cls: string; text: string }> = {
    opgeslagen: {
      cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      text: "✓ Opgeslagen",
    },
    bezig: {
      cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse",
      text: "Opslaan…",
    },
    fout: {
      cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
      text: "Sync fout",
    },
    offline: {
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      text: "Offline",
    },
  };
  const m = map[syncStatus];
  return <span className={`text-xs px-2 py-1 rounded ${m.cls}`}>{m.text}</span>;
}

function BakjesShell() {
  return (
    <div className="-mx-4 -mt-4 bakjes-app min-h-[calc(100vh-3.25rem)] bg-[var(--bg)]">
      <nav className="sticky top-[3.25rem] z-[5] border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-1 flex-wrap">
          <span className="font-semibold mr-4 text-[var(--ink)]">Bakjesmethode</span>
          {navItems.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm ${
                  isActive
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink)] hover:bg-slate-100 dark:hover:bg-slate-800"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
          <span className="ml-auto">
            <SyncBadge />
          </span>
        </div>
      </nav>
      <div className="max-w-5xl mx-auto px-4 py-4 text-[var(--ink)]">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="inventariseren" element={<Inventariseren />} />
          <Route path="bakjes" element={<Bakjes />} />
          <Route path="regels" element={<Regels />} />
          <Route path="instellingen" element={<Instellingen />} />
        </Routes>
      </div>
    </div>
  );
}

export default function BakjesApp() {
  const user = useCurrentUser();
  if (!isSupabaseConfigured || !user) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold">Bakjes</h2>
        <p className="mt-1 text-sm text-slate-400">
          Bakjes vereist een actieve Supabase-sessie. Log in om te beginnen.
        </p>
      </div>
    );
  }
  return (
    <AppDataProvider>
      <BakjesShell />
    </AppDataProvider>
  );
}
