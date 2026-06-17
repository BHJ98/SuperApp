
import { useEffect, useState, useCallback, useMemo } from "react";
import { dynamic } from "@/apps/finance/lib/dynamic";
import { useAppData } from "@/apps/finance/providers";
import { getAllChildIds } from "@/apps/finance/lib/categories";
import { formatCurrency } from "@/apps/finance/lib/utils";
import {
  PeriodType,
  getDateRange,
  getPreviousPeriodRange,
  getSameMonthLastYear,
} from "@/apps/finance/lib/report-helpers";
import { PeriodSelector } from "@/apps/finance/components/reports/period-selector";
import { AccountFilter } from "@/apps/finance/components/reports/account-filter";
import { CollapsibleSection } from "@/apps/finance/components/reports/collapsible-section";
import { TransactionModal } from "@/apps/finance/components/reports/transaction-modal";
import { UncategorizedBanner } from "@/apps/finance/components/reports/uncategorized-banner";
import { SavedViews } from "@/apps/finance/components/reports/saved-views";

// Lazy load heavy chart components (recharts-based)
const CategorySpendingChart = dynamic(() => import("@/apps/finance/components/reports/category-spending-chart").then(m => ({ default: m.CategorySpendingChart })), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted rounded" /> });
const IncomeExpenseChart = dynamic(() => import("@/apps/finance/components/reports/income-expense-chart").then(m => ({ default: m.IncomeExpenseChart })), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted rounded" /> });
const BalanceChart = dynamic(() => import("@/apps/finance/components/reports/balance-chart").then(m => ({ default: m.BalanceChart })), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted rounded" /> });
const BudgetRealityChart = dynamic(() => import("@/apps/finance/components/reports/budget-reality-chart").then(m => ({ default: m.BudgetRealityChart })), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted rounded" /> });
const FixedCostsChart = dynamic(() => import("@/apps/finance/components/reports/fixed-costs-chart").then(m => ({ default: m.FixedCostsChart })), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted rounded" /> });
import { Button } from "@/apps/finance/components/ui/button";
import {
  AlertCircle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  LineChart as LineChartIcon,
  Target,
  Home,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  color?: string | null;
};

type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  description: string;
  counterparty_name: string | null;
  is_categorized: boolean;
};

type Budget = {
  id: string;
  category_id: string;
  amount: number;
  period: "monthly" | "quarterly" | "yearly";
  cost_type: "fixed" | "semi_fixed" | "variable";
};

type SavedView = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
};

export default function ReportsPage() {
  const { supabase, householdId, categories, accounts } = useAppData();

  // Filters
  const defaultRange = getDateRange("month");
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [includeIncome, setIncludeIncome] = useState(false);

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const [lastYearTransactions, setLastYearTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTransactions, setModalTransactions] = useState<Transaction[]>([]);
  const [modalCategoryId, setModalCategoryId] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
    // Get user info
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Niet ingelogd. Ververs de pagina en log opnieuw in."); setLoading(false); return; }
    setUserId(user.id);

    // Get comparison periods
    const prevRange = getPreviousPeriodRange(periodType, startDate, endDate);
    const lastYearRange = getSameMonthLastYear(startDate, endDate);

    const [
      transactionsRes,
      prevTransactionsRes,
      lastYearTransactionsRes,
      budgetsRes,
      viewsRes,
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, category_id, amount, date, description, counterparty_name, is_categorized")
        .eq("is_transfer", false)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false }),
      supabase
        .from("transactions")
        .select("id, account_id, category_id, amount, date, description, counterparty_name, is_categorized")
        .eq("is_transfer", false)
        .gte("date", prevRange.start)
        .lte("date", prevRange.end),
      supabase
        .from("transactions")
        .select("id, account_id, category_id, amount, date, description, counterparty_name, is_categorized")
        .eq("is_transfer", false)
        .gte("date", lastYearRange.start)
        .lte("date", lastYearRange.end),
      supabase.from("budgets").select("id, category_id, amount, period, cost_type").limit(500),
      supabase.from("saved_views").select("id, name, filters").eq("user_id", user.id).limit(50),
    ]);

    const queryErrors = [
      transactionsRes.error && `Transacties: ${transactionsRes.error.message}`,
      prevTransactionsRes.error && `Vorige periode: ${prevTransactionsRes.error.message}`,
      lastYearTransactionsRes.error && `Vorig jaar: ${lastYearTransactionsRes.error.message}`,
      budgetsRes.error && `Budgetten: ${budgetsRes.error.message}`,
      viewsRes.error && `Opgeslagen weergaven: ${viewsRes.error.message}`,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      const msg = `Fout bij laden rapportages: ${queryErrors.join("; ")}`;
      console.error(msg);
      setError(msg);
    }

    if (transactionsRes.data) setTransactions(transactionsRes.data);
    if (prevTransactionsRes.data) setPrevTransactions(prevTransactionsRes.data);
    if (lastYearTransactionsRes.data) setLastYearTransactions(lastYearTransactionsRes.data);
    if (budgetsRes.data) setBudgets(budgetsRes.data);
    if (viewsRes.data) setSavedViews(viewsRes.data as SavedView[]);

    setLoading(false);
    } catch {
      setError("Kon rapportages niet laden. Controleer je internetverbinding.");
      setLoading(false);
    }
  }, [supabase, startDate, endDate, periodType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter transactions by selected accounts
  function filterByAccount(txns: Transaction[]): Transaction[] {
    if (selectedAccountIds.length === 0) return txns;
    return txns.filter((t) => selectedAccountIds.includes(t.account_id));
  }

  const filtered = filterByAccount(transactions);
  const filteredPrev = filterByAccount(prevTransactions);
  const filteredLastYear = filterByAccount(lastYearTransactions);

  // Memoized category lookups
  const rootCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const childIdsCache = useMemo(() => {
    const cache = new Map<string, Set<string>>();
    for (const cat of categories) {
      cache.set(cat.id, getAllChildIds(categories, cat.id));
    }
    return cache;
  }, [categories]);

  function getChildIds(categoryId: string): Set<string> {
    return childIdsCache.get(categoryId) || new Set([categoryId]);
  }

  const subcategoryMap = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const list = map.get(c.parent_id) || [];
        list.push(c);
        map.set(c.parent_id, list);
      }
    }
    return map;
  }, [categories]);

  function getSubcategories(parentId: string): Category[] {
    return subcategoryMap.get(parentId) || [];
  }

  function getMonthlyBudget(budget: Budget): number {
    if (budget.period === "monthly") return budget.amount;
    if (budget.period === "quarterly") return budget.amount / 3;
    return budget.amount / 12;
  }

  function getCategoryName(id: string): string {
    return categories.find((c) => c.id === id)?.name || "";
  }

  // Data calculations
  function getCategorySpendingData() {
    const rootCats = rootCategories;
    const amountFilter = includeIncome
      ? (_t: Transaction) => true
      : (t: Transaction) => t.amount < 0;
    const amountValue = includeIncome
      ? (t: Transaction) => Math.abs(t.amount)
      : (t: Transaction) => Math.abs(t.amount);

    return rootCats
      .map((rootCat) => {
        const childIds = getChildIds(rootCat.id);
        const spent = filtered
          .filter((t) => t.category_id && childIds.has(t.category_id) && amountFilter(t))
          .reduce((sum, t) => sum + amountValue(t), 0);

        const subcats = getSubcategories(rootCat.id);
        const children = subcats
          .map((sub) => {
            const subChildIds = getChildIds(sub.id);
            const subSpent = filtered
              .filter((t) => t.category_id && subChildIds.has(t.category_id) && amountFilter(t))
              .reduce((sum, t) => sum + amountValue(t), 0);
            return { categoryId: sub.id, name: sub.name, spent: subSpent };
          })
          .filter((s) => s.spent > 0)
          .sort((a, b) => b.spent - a.spent);

        return {
          categoryId: rootCat.id,
          name: rootCat.name,
          spent,
          children,
        };
      })
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }

  function getIncomeExpenseData() {
    // Group by month within the period
    const monthMap = new Map<string, { income: number; expenses: number }>();

    for (const t of filtered) {
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
        const label = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "2-digit" })
          .format(new Date(parseInt(y), parseInt(m) - 1));
        return { label, income: Math.round(val.income), expenses: Math.round(val.expenses), net: Math.round(val.income - val.expenses) };
      });
  }

  function getTotals(txns: Transaction[]) {
    const income = txns.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const expenses = txns.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { income, expenses, net: income - expenses };
  }

  function getComparisonData() {
    const current = getTotals(filtered);
    const previous = getTotals(filteredPrev);
    const prevRange = getPreviousPeriodRange(periodType, startDate, endDate);
    const previousLabel = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })
      .format(new Date(prevRange.start));

    return {
      currentLabel: "Huidig",
      previousLabel,
      current,
      previous,
    };
  }

  function getLastYearComparison() {
    const current = getTotals(filtered);
    const previous = getTotals(filteredLastYear);
    const lastYearRange = getSameMonthLastYear(startDate, endDate);
    const previousLabel = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })
      .format(new Date(lastYearRange.start));

    return {
      currentLabel: "Huidig",
      previousLabel,
      current,
      previous,
    };
  }

  function getBalanceData() {
    // Calculate running balance per account per day
    const accountMap = new Map<string, string>();
    for (const acc of accounts) {
      if (selectedAccountIds.length === 0 || selectedAccountIds.includes(acc.id)) {
        accountMap.set(acc.id, acc.name);
      }
    }

    // Determine interval: daily for month view, weekly otherwise
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const isDaily = days <= 35;

    // Sort transactions by date
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));

    // Build cumulative balance per account
    const runningBalances = new Map<string, number>();
    accountMap.forEach((_, id) => runningBalances.set(id, 0));

    // First, calculate starting balance (sum of all txns before start date for these accounts)
    // We don't have that data, so we'll show relative balance from period start (0)

    const dataPoints: Array<{ date: string; label: string; [key: string]: string | number }> = [];
    const current = new Date(start);
    let txIdx = 0;

    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];

      // Add transactions up to this date
      while (txIdx < sorted.length && sorted[txIdx].date <= dateStr) {
        const t = sorted[txIdx];
        if (accountMap.has(t.account_id)) {
          runningBalances.set(
            t.account_id,
            (runningBalances.get(t.account_id) || 0) + t.amount
          );
        }
        txIdx++;
      }

      // Check if we should add this data point
      const dayOfWeek = current.getDay();
      const shouldAdd = isDaily || dayOfWeek === 1; // Monday for weekly
      const isLastDay = current.getTime() === end.getTime();

      if (shouldAdd || isLastDay) {
        const point: Record<string, string | number> = {
          date: dateStr,
          label: new Intl.DateTimeFormat("nl-NL", {
            day: "numeric",
            month: "short",
          }).format(current),
        };
        accountMap.forEach((name, id) => {
          point[name] = Math.round(runningBalances.get(id) || 0);
        });
        dataPoints.push(point as { date: string; label: string; [key: string]: string | number });
      }

      current.setDate(current.getDate() + 1);
    }

    return {
      data: dataPoints,
      accountNames: Array.from(accountMap.values()),
    };
  }

  function getBudgetRealityData() {
    return budgets
      .map((budget) => {
        const childIds = getChildIds(budget.category_id);
        const spent = filtered
          .filter((t) => t.category_id && childIds.has(t.category_id) && t.amount < 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const monthlyBudget = getMonthlyBudget(budget);
        return {
          categoryId: budget.category_id,
          name: getCategoryName(budget.category_id),
          budget: Math.round(monthlyBudget),
          spent: Math.round(spent),
          isOver: spent > monthlyBudget,
        };
      })
      .filter((d) => d.name)
      .sort((a, b) => b.spent - a.spent);
  }

  function getFixedCostsData() {
    const fixed: Array<{ name: string; budget: number; spent: number; costType: "fixed" | "semi_fixed" }> = [];
    const semiFix: Array<{ name: string; budget: number; spent: number; costType: "fixed" | "semi_fixed" }> = [];

    for (const budget of budgets) {
      if (budget.cost_type !== "fixed" && budget.cost_type !== "semi_fixed") continue;

      const childIds = getChildIds(budget.category_id);
      const spent = filtered
        .filter((t) => t.category_id && childIds.has(t.category_id) && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const item = {
        name: getCategoryName(budget.category_id),
        budget: Math.round(getMonthlyBudget(budget)),
        spent: Math.round(spent),
        costType: budget.cost_type as "fixed" | "semi_fixed",
      };

      if (budget.cost_type === "fixed") fixed.push(item);
      else semiFix.push(item);
    }

    return { fixed, semiFix };
  }

  function getUncategorizedCount(): number {
    return filtered.filter((t) => !t.is_categorized).length;
  }

  // Modal handler
  function openTransactionModal(categoryId: string, categoryName: string) {
    const childIds = getChildIds(categoryId);
    const txns = filtered.filter(
      (t) => t.category_id && childIds.has(t.category_id) && (includeIncome || t.amount < 0)
    );
    setModalTitle(`Transacties: ${categoryName}`);
    setModalTransactions(txns);
    setModalCategoryId(categoryId);
    setModalOpen(true);
  }

  // Saved views
  function loadSavedView(filters: Record<string, unknown>) {
    if (filters.period_type) setPeriodType(filters.period_type as PeriodType);
    if (filters.start_date) setStartDate(filters.start_date as string);
    if (filters.end_date) setEndDate(filters.end_date as string);
    if (filters.account_ids) setSelectedAccountIds(filters.account_ids as string[]);
  }

  function getCurrentFilters(): Record<string, unknown> {
    return {
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
      account_ids: selectedAccountIds,
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Rapportages laden...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-center max-w-md">{error}</p>
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
        </Button>
      </div>
    );
  }

  const categoryData = getCategorySpendingData();
  const incomeExpenseData = getIncomeExpenseData();
  const comparison = getComparisonData();
  const lastYearComparison = getLastYearComparison();
  const balanceData = getBalanceData();
  const budgetData = getBudgetRealityData();
  const fixedCostsData = getFixedCostsData();
  const uncategorizedCount = getUncategorizedCount();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-3xl font-bold">Rapportages</h1>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-4">
          <PeriodSelector
            periodType={periodType}
            startDate={startDate}
            endDate={endDate}
            onPeriodTypeChange={setPeriodType}
            onDateRangeChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
          <AccountFilter
            accounts={accounts}
            selectedIds={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeIncome}
              onChange={(e) => setIncludeIncome(e.target.checked)}
              className="rounded border-gray-300"
            />
            Incl. inkomsten
          </label>
        </div>

        {/* Saved views */}
        <SavedViews
          views={savedViews}
          currentFilters={getCurrentFilters()}
          onLoadView={loadSavedView}
          onViewsChange={loadData}
          householdId={householdId || ""}
          userId={userId}
        />
      </div>

      {/* Uncategorized warning */}
      <UncategorizedBanner count={uncategorizedCount} />

      {/* Reports grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Uitgaven per categorie - full width */}
        <CollapsibleSection
          title="Uitgaven per categorie"
          icon={<BarChart3 className="h-5 w-5" />}
          fullWidth
        >
          {categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen uitgaven in deze periode.
            </p>
          ) : (
            <CategorySpendingChart
              data={categoryData}
              onCategoryClick={openTransactionModal}
            />
          )}
        </CollapsibleSection>

        {/* Inkomsten vs Uitgaven - full width */}
        <CollapsibleSection
          title="Inkomsten vs Uitgaven"
          icon={<TrendingUp className="h-5 w-5" />}
          fullWidth
        >
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground">Vergelijking met vorige periode</h3>
            <IncomeExpenseChart
              data={incomeExpenseData}
              comparison={comparison}
            />

            {/* Last year comparison */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Vergelijking met vorig jaar</h3>
              <div className="grid grid-cols-3 gap-3">
                {(["income", "expenses", "net"] as const).map((key) => {
                  const labels = { income: "Inkomsten", expenses: "Uitgaven", net: "Netto" };
                  const curr = lastYearComparison.current[key];
                  const prev = lastYearComparison.previous[key];
                  const diff = curr - prev;
                  const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : "N/A";
                  const isExpense = key === "expenses";
                  const positive = isExpense ? curr <= prev : curr >= prev;

                  return (
                    <div key={key} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{labels[key]}</p>
                      <p className="text-sm font-mono">{formatCurrency(curr)}</p>
                      <p className={`text-sm font-medium ${positive ? "text-green-600" : "text-red-600"}`}>
                        {diff >= 0 ? "+" : ""}{formatCurrency(diff)} ({pct === "N/A" ? pct : `${diff >= 0 ? "+" : ""}${pct}%`})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        vs {lastYearComparison.previousLabel}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Saldoverloop - full width */}
        <CollapsibleSection
          title="Saldoverloop"
          icon={<LineChartIcon className="h-5 w-5" />}
          fullWidth
        >
          {balanceData.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen transactiedata beschikbaar.
            </p>
          ) : (
            <BalanceChart
              data={balanceData.data}
              accountNames={balanceData.accountNames}
            />
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Saldo is relatief ten opzichte van het begin van de periode.
          </p>
        </CollapsibleSection>

        {/* Budget vs Realisatie */}
        <CollapsibleSection
          title="Budget vs Realisatie"
          icon={<Target className="h-5 w-5" />}
          fullWidth
        >
          {budgetData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen budgetten ingesteld.
            </p>
          ) : (
            <BudgetRealityChart
              data={budgetData}
              onCategoryClick={openTransactionModal}
            />
          )}
        </CollapsibleSection>

        {/* Vaste lasten */}
        <CollapsibleSection
          title="Vaste lasten"
          icon={<Home className="h-5 w-5" />}
          fullWidth
        >
          {fixedCostsData.fixed.length === 0 && fixedCostsData.semiFix.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen vaste lasten gedefinieerd.
            </p>
          ) : (
            <FixedCostsChart
              fixed={fixedCostsData.fixed}
              semiFix={fixedCostsData.semiFix}
            />
          )}
        </CollapsibleSection>
      </div>

      {/* Transaction modal */}
      <TransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        transactions={modalTransactions}
        categoryId={modalCategoryId}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
