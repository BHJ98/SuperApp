import { NavLink, Route, Routes } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Upload,
  Tags,
  Wallet,
  PiggyBank,
  BarChart3,
  ListChecks,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";
import { AppDataProvider } from "./providers";
import { ToastProvider } from "./components/ui/toast";
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

const navItems = [
  { to: "/finance", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/finance/transactions", label: "Transacties", icon: ArrowLeftRight },
  { to: "/finance/import", label: "Importeren", icon: Upload },
  { to: "/finance/categories", label: "Categorieën", icon: Tags },
  { to: "/finance/accounts", label: "Rekeningen", icon: Wallet },
  { to: "/finance/budgets", label: "Budgetten", icon: PiggyBank },
  { to: "/finance/reports", label: "Rapportages", icon: BarChart3 },
  { to: "/finance/rules", label: "Regels", icon: ListChecks },
];

function FinanceShell() {
  return (
    <div
      className="finance-app -mx-4 -mt-4 min-h-[calc(100vh-3.25rem)]"
      style={{ background: "var(--base)" }}
      data-app="finance"
    >
      {/* Sub-nav */}
      <nav
        className="sticky top-[3.25rem] z-[5] backdrop-blur-md"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(10, 10, 15, 0.92)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-1 flex-wrap">
          <span
            className="font-display font-semibold tracking-tight mr-3"
            style={{ color: "var(--ink)" }}
          >
            Finance
          </span>
          {navItems.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
                style={({ isActive }) =>
                  isActive
                    ? { background: "var(--accent-finance)", color: "#fff" }
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
      <div className="max-w-6xl mx-auto px-5 py-5" style={{ color: "var(--ink)" }}>
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
