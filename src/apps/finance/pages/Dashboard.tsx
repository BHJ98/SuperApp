
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAppData } from "@/apps/finance/providers";
import { getAllChildIds as getChildIds } from "@/apps/finance/lib/categories";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { Skeleton } from "@/apps/finance/components/ui/skeleton";
import { Select } from "@/apps/finance/components/ui/select";
import { formatCurrency } from "@/apps/finance/lib/utils";
import {
  TrendingDown,
  TrendingUp,
  PiggyBank,
  Home,
  Target,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/apps/finance/components/ui/button";
import Link from "@/apps/finance/lib/link";
import { dynamic } from "@/apps/finance/lib/dynamic";

// Lazy load chart components (recharts)
const IncomeExpenseChartCompact = dynamic(() => import("@/apps/finance/components/reports/income-expense-chart").then(m => ({ default: m.IncomeExpenseChartCompact })), { ssr: false, loading: () => <div className="h-48 animate-pulse bg-muted rounded" /> });
const BalanceChartCompact = dynamic(() => import("@/apps/finance/components/reports/balance-chart").then(m => ({ default: m.BalanceChartCompact })), { ssr: false, loading: () => <div className="h-48 animate-pulse bg-muted rounded" /> });

type Transaction = {
  category_id: string | null;
  account_id?: string;
  amount: number;
  date: string;
};

type Budget = {
  id: string;
  category_id: string;
  amount: number;
  period: "monthly" | "quarterly" | "yearly";
  cost_type: "fixed" | "semi_fixed" | "variable";
};

type SavingsGoal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
};

type CategorySpending = {
  categoryId: string;
  name: string;
  spent: number;
  budget: number | null;
  costType: string | null;
};

export default function DashboardPage() {
  const { supabase, categories, accounts } = useAppData();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [threeMonthTransactions, setThreeMonthTransactions] = useState<Transaction[]>([]);
  const [serverTrend, setServerTrend] = useState<{ month: string; income: number; expenses: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {

    const [year, month] = selectedMonth.split("-").map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth = new Date(year, month, 0);
    const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

    // 3-month range for trend charts
    const threeMonthsAgo = new Date(year, month - 3, 1);
    const threeMonthStart = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

    const [transactionsRes, budgetsRes, goalsRes, trendRes] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("category_id, account_id, amount, date")
          .eq("is_transfer", false)
          .gte("date", startOfMonth)
          .lte("date", endStr),
        supabase.from("budgets").select("id, category_id, amount, period, cost_type").limit(500),
        supabase.from("savings_goals").select("id, name, target_amount, current_amount, monthly_contribution").limit(100),
        // Server-side aggregation for 3-month trend (falls back gracefully if RPC not available)
        supabase.rpc("get_monthly_income_expenses", {
          p_start_date: threeMonthStart,
          p_end_date: endStr,
        }),
      ]);

    if (transactionsRes.data) setTransactions(transactionsRes.data);
    if (budgetsRes.data) setBudgets(budgetsRes.data);
    if (goalsRes.data) setSavingsGoals(goalsRes.data);
    // Use server-aggregated trend data or fall back to empty
    if (trendRes.data) {
      setThreeMonthTransactions([]); // No longer needed client-side
      setServerTrend(trendRes.data as { month: string; income: number; expenses: number }[]);
    }

    setLoading(false);
    } catch (err) {
      const msg = err instanceof TypeError && String(err).includes("fetch")
        ? "Geen internetverbinding. Controleer je netwerk."
        : "Kon data niet laden. Probeer het opnieuw.";
      setError(msg);
      setLoading(false);
    }
  }, [supabase, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getMonthlyBudget(budget: Budget): number {
    if (budget.period === "monthly") return budget.amount;
    if (budget.period === "quarterly") return budget.amount / 3;
    return budget.amount / 12;
  }

  // Get vaste lasten grouped by type
  function getFixedCosts() {
    const fixed: CategorySpending[] = [];
    const semiFix: CategorySpending[] = [];

    for (const budget of budgets) {
      const rootCat = categories.find((c) => c.id === budget.category_id);
      if (!rootCat) continue;

      const childIds = getChildIds(categories, budget.category_id);
      const spent = transactions
        .filter((t) => t.category_id && childIds.has(t.category_id) && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const item: CategorySpending = {
        categoryId: budget.category_id,
        name: getCategoryName(budget.category_id),
        spent,
        budget: getMonthlyBudget(budget),
        costType: budget.cost_type,
      };

      if (budget.cost_type === "fixed") {
        fixed.push(item);
      } else if (budget.cost_type === "semi_fixed") {
        semiFix.push(item);
      }
    }

    return { fixed, semiFix };
  }

  function getCategoryName(id: string): string {
    return categories.find((c) => c.id === id)?.name || "";
  }

  // Get savings goal projected date
  function getGoalDate(goal: SavingsGoal): string | null {
    if (goal.monthly_contribution <= 0) return null;
    const remaining = goal.target_amount - goal.current_amount;
    if (remaining <= 0) return "Bereikt!";
    const months = Math.ceil(remaining / goal.monthly_contribution);
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return new Intl.DateTimeFormat("nl-NL", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  // Generate month options (last 12 months + next month)
  function getMonthOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 12; i >= -1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("nl-NL", {
        month: "long",
        year: "numeric",
      }).format(d);
      options.push({ value, label });
    }
    return options;
  }

  // Memoize expensive calculations (must be before early returns)
  const totals = useMemo(() => {
    const income = transactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { income, expenses, net: income - expenses };
  }, [transactions]);

  const spendingByCategory = useMemo(() => {
    const rootCats = categories.filter((c) => !c.parent_id);
    const result: CategorySpending[] = [];
    for (const rootCat of rootCats) {
      const childIds = getChildIds(categories, rootCat.id);
      const spent = transactions
        .filter((t) => t.category_id && childIds.has(t.category_id) && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const budget = budgets.find((b) => childIds.has(b.category_id));
      const monthlyBudget = budget ? (budget.period === "monthly" ? budget.amount : budget.period === "quarterly" ? budget.amount / 3 : budget.amount / 12) : null;
      const costType = budget?.cost_type || null;
      if (spent > 0 || monthlyBudget) {
        result.push({ categoryId: rootCat.id, name: rootCat.name, spent, budget: monthlyBudget, costType });
      }
    }
    return result.sort((a, b) => b.spent - a.spent);
  }, [transactions, categories, budgets]);

  const incomeExpenseTrend = useMemo(() => {
    if (serverTrend.length > 0) {
      return serverTrend.map((row) => {
        const [y, m] = row.month.split("-");
        const label = new Intl.DateTimeFormat("nl-NL", { month: "short" })
          .format(new Date(parseInt(y), parseInt(m) - 1));
        return { label, income: Math.round(row.income), expenses: Math.round(row.expenses), net: Math.round(row.income - row.expenses) };
      });
    }
    const monthMap = new Map<string, { income: number; expenses: number }>();
    for (const t of threeMonthTransactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, { income: 0, expenses: 0 });
      const entry = monthMap.get(key)!;
      if (t.amount > 0) entry.income += t.amount;
      else entry.expenses += Math.abs(t.amount);
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [y, m] = key.split("-");
        const label = new Intl.DateTimeFormat("nl-NL", { month: "short" })
          .format(new Date(parseInt(y), parseInt(m) - 1));
        return { label, income: Math.round(val.income), expenses: Math.round(val.expenses), net: Math.round(val.income - val.expenses) };
      });
  }, [serverTrend, threeMonthTransactions]);

  const balanceTrend = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth = new Date(year, month, 0);
    const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;
    const accountMap = new Map<string, string>();
    for (const acc of accounts) accountMap.set(acc.id, acc.name);
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const runningBalances = new Map<string, number>();
    accountMap.forEach((_, id) => runningBalances.set(id, 0));
    const dataPoints: Array<{ date: string; label: string; [key: string]: string | number }> = [];
    const start = new Date(startOfMonth);
    const end = new Date(endStr);
    let txIdx = 0;
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      while (txIdx < sorted.length && sorted[txIdx].date <= dateStr) {
        const t = sorted[txIdx];
        if (t.account_id && accountMap.has(t.account_id)) {
          runningBalances.set(t.account_id, (runningBalances.get(t.account_id) || 0) + t.amount);
        }
        txIdx++;
      }
      const point: Record<string, string | number> = {
        date: dateStr,
        label: new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(current),
      };
      accountMap.forEach((name, id) => { point[name] = Math.round(runningBalances.get(id) || 0); });
      dataPoints.push(point as { date: string; label: string; [key: string]: string | number });
      current.setDate(current.getDate() + 1);
    }
    return { data: dataPoints, accountNames: Array.from(accountMap.values()) };
  }, [transactions, accounts, selectedMonth]);

  if (loading) {
    return (
      <div>
        <Skeleton className="h-9 w-48 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-32" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card><CardContent className="p-6"><Skeleton className="h-[200px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[200px] w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
        </Button>
      </div>
    );
  }
  const { fixed, semiFix } = getFixedCosts();
  const totalFixedBudget = fixed.reduce((sum, c) => sum + (c.budget || 0), 0);
  const totalSemiFixedBudget = semiFix.reduce((sum, c) => sum + (c.budget || 0), 0);
  const totalFixedSpent = fixed.reduce((sum, c) => sum + c.spent, 0);
  const totalSemiFixedSpent = semiFix.reduce((sum, c) => sum + c.spent, 0);
  const maxSpending = Math.max(...spendingByCategory.map((c) => Math.max(c.spent, c.budget || 0)), 1);

  return (
    <div>
      {/* Header with month selector */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-48"
        >
          {getMonthOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm">Inkomsten</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totals.income)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm">Uitgaven</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(totals.expenses)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <PiggyBank className="h-4 w-4" />
              <span className="text-sm">Netto</span>
            </div>
            <p
              className={`text-2xl font-bold ${
                totals.net >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(totals.net)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Uitgaven per categorie */}
        <Card>
          <CardHeader>
            <CardTitle>Uitgaven per categorie</CardTitle>
          </CardHeader>
          <CardContent>
            {spendingByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Geen uitgaven deze maand.
              </p>
            ) : (
              <div className="space-y-3">
                {spendingByCategory.map((cat) => {
                  const pct = (cat.spent / maxSpending) * 100;
                  return (
                    <div key={cat.categoryId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{cat.name}</span>
                        <span className="font-mono">{formatCurrency(cat.spent)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Realiteit vs doelen */}
        <Card>
          <CardHeader>
            <CardTitle>Realiteit vs budget</CardTitle>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Geen budgetten ingesteld. Ga naar Budgetten om er een aan te maken.
              </p>
            ) : (
              <div className="space-y-3">
                {spendingByCategory
                  .filter((cat) => cat.budget !== null)
                  .map((cat) => {
                    const pct =
                      cat.budget && cat.budget > 0
                        ? Math.min((cat.spent / cat.budget) * 100, 100)
                        : 0;
                    const isOver = cat.budget ? cat.spent > cat.budget : false;
                    return (
                      <div key={cat.categoryId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{cat.name}</span>
                          <span className={`font-mono ${isOver ? "text-red-600" : ""}`}>
                            {formatCurrency(cat.spent)} / {formatCurrency(cat.budget!)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isOver
                                ? "bg-red-500"
                                : pct > 80
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {spendingByCategory.filter((cat) => cat.budget !== null).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Geen budgetten voor categorieën met uitgaven deze maand.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compact charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Inkomsten vs Uitgaven (3 maanden)</span>
              <Link href="/finance/reports" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {incomeExpenseTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Geen data.</p>
            ) : (
              <IncomeExpenseChartCompact data={incomeExpenseTrend} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Saldoverloop</span>
              <Link href="/finance/reports" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balanceTrend.data.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Geen data.</p>
            ) : (
              <BalanceChartCompact data={balanceTrend.data} accountNames={balanceTrend.accountNames} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vaste lasten overzicht */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Vaste lasten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fixed.length === 0 && semiFix.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Geen vaste lasten gedefinieerd. Stel budgetten in met type
                &quot;Vast&quot; of &quot;Semi-vast&quot;.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Echt vaste lasten */}
                {fixed.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Vaste kosten
                    </h3>
                    <div className="space-y-1">
                      {fixed.map((item) => (
                        <div
                          key={item.categoryId}
                          className="flex justify-between text-sm py-1"
                        >
                          <span>{item.name}</span>
                          <span className="font-mono">
                            {formatCurrency(item.budget || 0)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                        <span>Subtotaal vast</span>
                        <span className="font-mono">
                          {formatCurrency(totalFixedBudget)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Semi-vaste lasten */}
                {semiFix.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                      Semi-vaste kosten
                    </h3>
                    <div className="space-y-1">
                      {semiFix.map((item) => (
                        <div
                          key={item.categoryId}
                          className="flex justify-between text-sm py-1"
                        >
                          <span>{item.name}</span>
                          <span className="font-mono">
                            {formatCurrency(item.budget || 0)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                        <span>Subtotaal semi-vast</span>
                        <span className="font-mono">
                          {formatCurrency(totalSemiFixedBudget)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Totaal */}
                <div className="flex justify-between text-sm font-bold pt-2 border-t-2">
                  <span>Totaal vaste lasten</span>
                  <span className="font-mono">
                    {formatCurrency(totalFixedBudget + totalSemiFixedBudget)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Werkelijk besteed deze maand</span>
                  <span className="font-mono">
                    {formatCurrency(totalFixedSpent + totalSemiFixedSpent)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spaardoelen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Spaardoelen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {savingsGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Geen spaardoelen. Ga naar Budgetten om een spaardoel aan te maken.
              </p>
            ) : (
              <div className="space-y-4">
                {savingsGoals.map((goal) => {
                  const pct =
                    goal.target_amount > 0
                      ? Math.min(
                          (goal.current_amount / goal.target_amount) * 100,
                          100
                        )
                      : 0;
                  const goalDate = getGoalDate(goal);

                  return (
                    <div key={goal.id} className="border rounded-lg p-3">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{goal.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span className="font-mono">
                          {formatCurrency(goal.current_amount)} /{" "}
                          {formatCurrency(goal.target_amount)}
                        </span>
                        {goalDate && (
                          <span>
                            {goalDate === "Bereikt!"
                              ? goalDate
                              : `${goalDate}`}
                          </span>
                        )}
                      </div>
                      {goal.monthly_contribution > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatCurrency(goal.monthly_contribution)} / maand
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Link to full reports */}
      <div className="mt-6 text-center">
        <Link
          href="/finance/reports"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline"
        >
          Bekijk volledige rapportages
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
