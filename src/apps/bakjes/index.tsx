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
  const map: Record<string, { color: string; text: string }> = {
    opgeslagen: { color: "#10b981", text: "✓ Opgeslagen" },
    bezig:      { color: "var(--muted)", text: "Opslaan…" },
    fout:       { color: "#ef4444", text: "Sync fout" },
    offline:    { color: "var(--faint)", text: "Offline" },
  };
  const m = map[syncStatus];
  return (
    <span
      className="text-xs px-2 py-1 rounded-lg"
      style={{
        color: m.color,
        background: "var(--raised)",
        border: "1px solid var(--border)",
      }}
    >
      {m.text}
    </span>
  );
}

function BakjesShell() {
  return (
    <div
      className="-mx-4 -mt-4 bakjes-app min-h-[calc(100vh-3.25rem)]"
      style={{ background: "var(--base)" }}
      data-app="bakjes"
    >
      {/* Sub-nav */}
      <nav
        className="sticky top-[3.25rem] z-[5] backdrop-blur-md"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(10, 10, 15, 0.92)",
        }}
      >
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-1 flex-wrap">
          <span
            className="font-display font-semibold tracking-tight mr-4"
            style={{ color: "var(--ink)" }}
          >
            Bakjesmethode
          </span>
          {navItems.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
              style={({ isActive }) =>
                isActive
                  ? { background: "var(--accent-bakjes)", color: "#fff" }
                  : { color: "var(--muted)" }
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

      {/* Page content */}
      <div
        className="max-w-5xl mx-auto px-5 py-4"
        style={{ color: "var(--ink)" }}
      >
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
        <h2
          className="font-display text-lg font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Bakjes
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
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
