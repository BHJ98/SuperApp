import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { DoorOpen, Inbox, LayoutDashboard, Receipt } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";
import { fetchInboxCount, subscribeVerbouwing } from "./lib/data";

import Overzicht from "./pages/Overzicht";
import Beoordelen from "./pages/Beoordelen";
import Uitgaven from "./pages/Uitgaven";
import Ruimtes from "./pages/Ruimtes";

const navItems = [
  { to: "/verbouwing", label: "Overzicht", icon: LayoutDashboard, end: true },
  { to: "/verbouwing/beoordelen", label: "Beoordelen", icon: Inbox },
  { to: "/verbouwing/uitgaven", label: "Uitgaven", icon: Receipt },
  { to: "/verbouwing/ruimtes", label: "Ruimtes", icon: DoorOpen },
];

/**
 * Aantal nog te beoordelen banktransacties, live bijgehouden: elke wijziging
 * in expenses of dismissed_transactions (ook vanaf een ander toestel) triggert
 * een hertelling.
 */
function useInboxCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchInboxCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {});
    };
    refresh();
    const unsubExpenses = subscribeVerbouwing("expenses", refresh);
    const unsubDismissed = subscribeVerbouwing("dismissed_transactions", refresh);
    return () => {
      cancelled = true;
      unsubExpenses();
      unsubDismissed();
    };
  }, []);
  return count;
}

function VerbouwingShell() {
  const inboxCount = useInboxCount();

  return (
    <div
      className="-mx-4 -mt-4 min-h-[calc(100vh-3.25rem)]"
      style={{ background: "var(--base)" }}
      data-app="verbouwing"
    >
      {/* Sub-nav (zelfde patroon als Finance) */}
      <nav
        className="sticky z-[5] backdrop-blur-md"
        style={{
          top: "calc(3.25rem + var(--safe-top))",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--base) 92%, transparent)",
        }}
      >
        <div className="px-5 py-3 flex items-center gap-1 flex-wrap">
          <span
            className="font-display font-semibold tracking-tight mr-3"
            style={{ color: "var(--ink)" }}
          >
            Verbouwing
          </span>
          {navItems.map((l) => {
            const Icon = l.icon;
            const isBeoordelen = l.to === "/verbouwing/beoordelen";
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
                style={({ isActive }) =>
                  isActive
                    ? { background: "var(--accent-verbouwing)", color: "var(--surface)" }
                    : { color: "var(--muted)" }
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {l.label}
                {isBeoordelen && inboxCount > 0 && (
                  <span
                    className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                    style={{ background: "var(--danger)" }}
                  >
                    {inboxCount > 999 ? "999+" : inboxCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Pagina-inhoud */}
      <div className="px-5 py-5" style={{ color: "var(--ink)" }}>
        <Routes>
          <Route index element={<Overzicht />} />
          <Route path="beoordelen" element={<Beoordelen />} />
          <Route path="uitgaven" element={<Uitgaven />} />
          <Route path="ruimtes" element={<Ruimtes />} />
        </Routes>
      </div>
    </div>
  );
}

export default function VerbouwingApp() {
  const user = useCurrentUser();
  if (!isSupabaseConfigured || !user) {
    return (
      <div className="card" data-app="verbouwing">
        <div
          className="mb-3 h-0.5 w-8 rounded-full"
          style={{ background: "var(--accent-verbouwing)" }}
        />
        <h2
          className="font-display text-lg font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Verbouwing
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Verbouwing vereist een actieve Supabase-sessie. Log in om te beginnen.
        </p>
      </div>
    );
  }
  return <VerbouwingShell />;
}
