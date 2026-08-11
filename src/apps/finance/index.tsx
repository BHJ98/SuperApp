import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  BarChart3,
  Settings2,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";
import { useBankAutoSync } from "@/lib/bankAutoSync";
import { AppDataProvider } from "./providers";
import { ToastProvider, useToast } from "./components/ui/toast";
import "./finance.css";

import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Import from "./pages/Import";
import Categories from "./pages/Categories";
import Accounts from "./pages/Accounts";
import Budgets from "./pages/Budgets";
import Reports from "./pages/Reports";
import Rules from "./pages/Rules";
import Profile from "./pages/Profile";
import Backup from "./pages/Backup";
import Setup from "./pages/Setup";
import BankSync from "./pages/BankSync";
import Beheer from "./pages/Beheer";

const navItems = [
  { to: "/finance", label: "Overzicht", icon: LayoutDashboard, end: true },
  { to: "/finance/transactions", label: "Transacties", icon: ArrowLeftRight },
  { to: "/finance/budgets", label: "Budgetten", icon: PiggyBank },
  { to: "/finance/reports", label: "Rapportages", icon: BarChart3 },
  { to: "/finance/beheer", label: "Beheer", icon: Settings2 },
];

/** Paths that live under the "Beheer" hub; the Beheer tab highlights on all of them. */
const beheerPaths = [
  "/finance/beheer",
  "/finance/import",
  "/finance/categories",
  "/finance/accounts",
  "/finance/rules",
  "/finance/bank-sync",
  "/finance/backup",
  "/finance/profile",
];

function FinanceShell() {
  const location = useLocation();
  const { toast } = useToast();
  // Ververst bij het openen van de app op de achtergrond alle actieve
  // bankkoppelingen (gethrottled — zie lib/bankAutoSync).
  useBankAutoSync((imported) =>
    toast(imported === 1 ? "1 nieuwe transactie geïmporteerd" : `${imported} nieuwe transacties geïmporteerd`),
  );
  const beheerActive = beheerPaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  );
  return (
    <div
      className="finance-app -mx-4 -mt-4 min-h-[calc(100vh-3.25rem)]"
      style={{ background: "var(--base)" }}
      data-app="finance"
    >
      {/* Sub-nav */}
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
            Finance
          </span>
          {navItems.map((l) => {
            const Icon = l.icon;
            const isBeheer = l.to === "/finance/beheer";
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
                style={({ isActive }) =>
                  (isBeheer ? beheerActive : isActive)
                    ? // --surface flips with the theme: white text on the dark-green
                      // light-theme accent, near-black text on the light-green
                      // dark-theme accent — readable in both.
                      { background: "var(--accent-finance)", color: "var(--surface)" }
                    : { color: "var(--muted)" }
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {l.label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Page content */}
      <div className="px-5 py-5" style={{ color: "var(--ink)" }}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="import" element={<Import />} />
          <Route path="categories" element={<Categories />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="reports" element={<Reports />} />
          <Route path="rules" element={<Rules />} />
          <Route path="profile" element={<Profile />} />
          <Route path="backup" element={<Backup />} />
          <Route path="setup" element={<Setup />} />
          <Route path="bank-sync" element={<BankSync />} />
          <Route path="beheer" element={<Beheer />} />
        </Routes>
      </div>
    </div>
  );
}

export default function FinanceApp() {
  const user = useCurrentUser();
  if (!isSupabaseConfigured || !user) {
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
          Finance vereist een actieve Supabase-sessie. Log in om te beginnen.
        </p>
      </div>
    );
  }
  return (
    <AppDataProvider>
      <ToastProvider>
        <FinanceShell />
      </ToastProvider>
    </AppDataProvider>
  );
}
