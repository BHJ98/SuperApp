
import { useEffect, useState, useCallback } from "react";
import { useAppData } from "@/apps/finance/providers";
import { getAllChildIds } from "@/apps/finance/lib/categories";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { Input } from "@/apps/finance/components/ui/input";
import { Label } from "@/apps/finance/components/ui/label";
import { Select } from "@/apps/finance/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/apps/finance/components/ui/dialog";
import { formatCurrency } from "@/apps/finance/lib/utils";
import { useToast } from "@/apps/finance/components/ui/toast";
import { BudgetSkeleton } from "@/apps/finance/components/ui/skeleton";
import { SwipeRow } from "@/apps/finance/components/ui/swipe-row";
import { Plus, Pencil, Trash2, PiggyBank, Target, AlertCircle, RefreshCw } from "lucide-react";

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

type SpendingByCategory = {
  category_id: string;
  total: number;
};

const COST_TYPE_LABELS: Record<string, string> = {
  fixed: "Vast",
  semi_fixed: "Semi-vast",
  variable: "Variabel",
};

export default function BudgetsPage() {
  const { supabase, householdId, categories, flatCategories } = useAppData();
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [spending, setSpending] = useState<SpendingByCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ type: "budget" | "goal"; id: string; name: string } | null>(null);

  // Budget dialog
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPeriod, setFormPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [formCostType, setFormCostType] = useState<"fixed" | "semi_fixed" | "variable">("variable");
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Savings goal dialog
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalMonthly, setGoalMonthly] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const endStr = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

      const [budgetsRes, goalsRes, transactionsRes] = await Promise.all([
        supabase.from("budgets").select("id, category_id, amount, period, cost_type").limit(500),
        supabase.from("savings_goals").select("id, name, target_amount, current_amount, monthly_contribution").limit(100),
        supabase
          .from("transactions")
          .select("category_id, amount")
          .eq("is_transfer", false)
          .gte("date", startOfMonth)
          .lte("date", endStr)
          .lt("amount", 0),
      ]);

      if (budgetsRes.error) {
        console.error("Fout bij laden budgetten:", budgetsRes.error.message);
        setError(`Kon budgetten niet laden: ${budgetsRes.error.message}`);
        setLoading(false);
        return;
      }
      if (goalsRes.error) console.error("Fout bij laden spaardoelen:", goalsRes.error.message);
      if (transactionsRes.error) console.error("Fout bij laden transacties:", transactionsRes.error.message);
      if (budgetsRes.data) setBudgets(budgetsRes.data);
      if (goalsRes.data) setSavingsGoals(goalsRes.data);

      // Aggregate spending by category
      if (transactionsRes.data) {
        const map = new Map<string, number>();
        for (const t of transactionsRes.data) {
          if (t.category_id) {
            map.set(t.category_id, (map.get(t.category_id) || 0) + Math.abs(t.amount));
          }
        }
        setSpending(
          Array.from(map.entries()).map(([category_id, total]) => ({
            category_id,
            total,
          }))
        );
      }

      setLoading(false);
    } catch {
      setError("Kon budgetten niet laden. Controleer je internetverbinding.");
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getCategoryPath(categoryId: string): string {
    const node = flatCategories.find((c) => c.id === categoryId);
    return node?.fullPath || "";
  }

  function getMonthlyAmount(budget: Budget): number {
    if (budget.period === "monthly") return budget.amount;
    if (budget.period === "quarterly") return budget.amount / 3;
    return budget.amount / 12;
  }

  function getSpent(categoryId: string): number {
    const childIds = getAllChildIds(categories, categoryId);
    return spending
      .filter((s) => childIds.has(s.category_id))
      .reduce((sum, s) => sum + s.total, 0);
  }

  // Budget CRUD
  function openCreateBudget() {
    setEditingBudget(null);
    setFormCategoryId("");
    setFormAmount("");
    setFormPeriod("monthly");
    setFormCostType("variable");
    setBudgetDialogOpen(true);
  }

  function openEditBudget(budget: Budget) {
    setEditingBudget(budget);
    setFormCategoryId(budget.category_id);
    setFormAmount(String(budget.amount));
    setFormPeriod(budget.period);
    setFormCostType(budget.cost_type);
    setBudgetDialogOpen(true);
  }

  async function handleSaveBudget() {
    const errors: Record<string, string> = {};
    if (!formCategoryId) errors.category = "Kies een categorie";
    const parsedAmount = parseFloat(formAmount);
    if (!formAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.amount = "Voer een geldig positief bedrag in";
    } else if (parsedAmount > 1_000_000_000) {
      errors.amount = "Bedrag is te hoog";
    }
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    if (!householdId) return;
    setSaving(true);

    const data = {
      household_id: householdId,
      category_id: formCategoryId,
      amount: Math.round(parsedAmount * 100) / 100,
      period: formPeriod,
      cost_type: formCostType,
    };

    if (editingBudget) {
      const { error } = await supabase.from("budgets").update(data).eq("id", editingBudget.id);
      if (error) { console.error("Fout bij bijwerken budget:", error.message); setError(`Kon budget niet bijwerken: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("budgets").insert(data);
      if (error) { console.error("Fout bij aanmaken budget:", error.message); setError(`Kon budget niet aanmaken: ${error.message}`); setSaving(false); return; }
    }

    setSaving(false);
    setBudgetDialogOpen(false);
    toast(editingBudget ? "Budget bijgewerkt" : "Budget aangemaakt");
    loadData();
  }

  function confirmDeleteBudget(budget: Budget) {
    setDeletingItem({ type: "budget", id: budget.id, name: getCategoryPath(budget.category_id) });
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteBudget(id: string) {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) { console.error("Fout bij verwijderen budget:", error.message); setError(`Kon budget niet verwijderen: ${error.message}`); return; }
    toast("Budget verwijderd");
    loadData();
  }

  // Savings goal CRUD
  function openCreateGoal() {
    setEditingGoal(null);
    setGoalName("");
    setGoalTarget("");
    setGoalCurrent("0");
    setGoalMonthly("");
    setGoalDialogOpen(true);
  }

  function openEditGoal(goal: SavingsGoal) {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalTarget(String(goal.target_amount));
    setGoalCurrent(String(goal.current_amount));
    setGoalMonthly(String(goal.monthly_contribution));
    setGoalDialogOpen(true);
  }

  async function handleSaveGoal() {
    const errors: Record<string, string> = {};
    if (!goalName.trim()) errors.goalName = "Naam is verplicht";
    const parsedTarget = parseFloat(goalTarget);
    if (!goalTarget || isNaN(parsedTarget) || parsedTarget <= 0) {
      errors.goalTarget = "Voer een geldig doelbedrag in";
    }
    const parsedCurrent = parseFloat(goalCurrent || "0");
    const parsedMonthly = parseFloat(goalMonthly || "0");
    if (isNaN(parsedCurrent) || parsedCurrent < 0) errors.goalCurrent = "Mag niet negatief zijn";
    if (isNaN(parsedMonthly) || parsedMonthly < 0) errors.goalMonthly = "Mag niet negatief zijn";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    if (!householdId) return;
    setSaving(true);

    const data = {
      household_id: householdId,
      name: goalName,
      target_amount: Math.round(parsedTarget * 100) / 100,
      current_amount: Math.round(parsedCurrent * 100) / 100,
      monthly_contribution: Math.round(parsedMonthly * 100) / 100,
    };

    if (editingGoal) {
      const { error } = await supabase.from("savings_goals").update(data).eq("id", editingGoal.id);
      if (error) { console.error("Fout bij bijwerken spaardoel:", error.message); setError(`Kon spaardoel niet bijwerken: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("savings_goals").insert(data);
      if (error) { console.error("Fout bij aanmaken spaardoel:", error.message); setError(`Kon spaardoel niet aanmaken: ${error.message}`); setSaving(false); return; }
    }

    setSaving(false);
    setGoalDialogOpen(false);
    toast(editingGoal ? "Spaardoel bijgewerkt" : "Spaardoel aangemaakt");
    loadData();
  }

  function confirmDeleteGoal(goal: SavingsGoal) {
    setDeletingItem({ type: "goal", id: goal.id, name: goal.name });
    setDeleteConfirmOpen(true);
  }

  async function handleDeleteGoal(id: string) {
    const { error } = await supabase.from("savings_goals").delete().eq("id", id);
    if (error) { console.error("Fout bij verwijderen spaardoel:", error.message); setError(`Kon spaardoel niet verwijderen: ${error.message}`); return; }
    toast("Spaardoel verwijderd");
    loadData();
  }

  async function handleDeleteConfirmed() {
    if (!deletingItem) return;
    setDeleteConfirmOpen(false);
    if (deletingItem.type === "budget") {
      await handleDeleteBudget(deletingItem.id);
    } else {
      await handleDeleteGoal(deletingItem.id);
    }
    setDeletingItem(null);
  }

  function getMonthsToGoal(goal: SavingsGoal): number | null {
    if (goal.monthly_contribution <= 0) return null;
    const remaining = goal.target_amount - goal.current_amount;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / goal.monthly_contribution);
  }

  function getGoalDate(goal: SavingsGoal): string | null {
    const months = getMonthsToGoal(goal);
    if (months === null) return null;
    if (months === 0) return "Bereikt!";
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return new Intl.DateTimeFormat("nl-NL", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Budgetten</h1>
        </div>
        <Card className="mb-6"><CardHeader><CardTitle>Maandbudgetten</CardTitle></CardHeader><BudgetSkeleton /></Card>
        <Card><CardHeader><CardTitle>Spaardoelen</CardTitle></CardHeader><BudgetSkeleton /></Card>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Budgetten</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreateGoal}>
            <Target className="h-4 w-4 mr-1" /> Spaardoel
          </Button>
          <Button onClick={openCreateBudget}>
            <Plus className="h-4 w-4 mr-1" /> Budget
          </Button>
        </div>
      </div>

      {/* Budgets */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Maandbudgetten</CardTitle>
        </CardHeader>
        <CardContent>
          {budgets.length === 0 ? (
            <div className="text-center py-8">
              <PiggyBank className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nog geen budgetten ingesteld. Voeg een budget toe om je uitgaven te volgen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {budgets.map((budget) => {
                const monthlyBudget = getMonthlyAmount(budget);
                const spent = getSpent(budget.category_id);
                const percentage = monthlyBudget > 0 ? Math.min((spent / monthlyBudget) * 100, 100) : 0;
                const isOver = spent > monthlyBudget;

                return (
                  <SwipeRow
                    key={budget.id}
                    onEdit={() => openEditBudget(budget)}
                    onDelete={() => confirmDeleteBudget(budget)}
                    className="md:!overflow-visible"
                  >
                  <div className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {getCategoryPath(budget.category_id)}
                        </span>
                        <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                          {COST_TYPE_LABELS[budget.cost_type]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono ${isOver ? "text-red-600" : ""}`}>
                          {formatCurrency(spent)} / {formatCurrency(monthlyBudget)}
                        </span>
                        <div className="flex gap-1 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditBudget(budget)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => confirmDeleteBudget(budget)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver
                            ? "bg-red-500"
                            : percentage > 80
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    {budget.period !== "monthly" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCurrency(budget.amount)} per{" "}
                        {budget.period === "quarterly" ? "kwartaal" : "jaar"}
                      </p>
                    )}
                  </div>
                  </SwipeRow>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Savings Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Spaardoelen</CardTitle>
        </CardHeader>
        <CardContent>
          {savingsGoals.length === 0 ? (
            <div className="text-center py-8">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nog geen spaardoelen. Voeg een spaardoel toe om je voortgang bij te houden.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {savingsGoals.map((goal) => {
                const percentage =
                  goal.target_amount > 0
                    ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
                    : 0;
                const goalDate = getGoalDate(goal);

                return (
                  <SwipeRow
                    key={goal.id}
                    onEdit={() => openEditGoal(goal)}
                    onDelete={() => confirmDeleteGoal(goal)}
                    className="md:!overflow-visible"
                  >
                  <div className="group border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{goal.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditGoal(goal)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => confirmDeleteGoal(goal)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-mono">
                        {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(percentage)}%
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {goal.monthly_contribution > 0
                          ? `${formatCurrency(goal.monthly_contribution)} / maand`
                          : "Geen maandelijkse inleg"}
                      </span>
                      {goalDate && (
                        <span className="font-medium">
                          {goalDate === "Bereikt!"
                            ? "Bereikt!"
                            : `Verwacht: ${goalDate}`}
                        </span>
                      )}
                    </div>
                  </div>
                  </SwipeRow>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Budget Dialog */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen} dirty={!!formAmount || !!formCategoryId}>
        <DialogClose onClose={() => setBudgetDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingBudget ? "Budget bewerken" : "Nieuw budget"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="budgetCategory">Categorie</Label>
              <Select
                id="budgetCategory"
                value={formCategoryId}
                onChange={(e) => { setFormCategoryId(e.target.value); setFormErrors((p) => { const { category, ...rest } = p; return rest; }); }}
                className={formErrors.category ? "border-destructive" : ""}
              >
                <option value="">Kies een categorie...</option>
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00A0\u00A0\u00A0\u00A0".repeat(c.depth)}{c.name}
                  </option>
                ))}
              </Select>
              {formErrors.category && <p className="text-xs text-destructive mt-1">{formErrors.category}</p>}
            </div>
            <div>
              <Label htmlFor="budgetAmount">Bedrag</Label>
              <Input
                id="budgetAmount"
                type="number"
                step="0.01"
                min="0"
                value={formAmount}
                onChange={(e) => { setFormAmount(e.target.value); setFormErrors((p) => { const { amount, ...rest } = p; return rest; }); }}
                placeholder="0.00"
                error={formErrors.amount}
              />
            </div>
            <div>
              <Label htmlFor="budgetPeriod">Periode</Label>
              <Select
                id="budgetPeriod"
                value={formPeriod}
                onChange={(e) => setFormPeriod(e.target.value as "monthly" | "quarterly" | "yearly")}
              >
                <option value="monthly">Per maand</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="yearly">Per jaar</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="budgetCostType">Type kosten</Label>
              <Select
                id="budgetCostType"
                value={formCostType}
                onChange={(e) => setFormCostType(e.target.value as "fixed" | "semi_fixed" | "variable")}
              >
                <option value="fixed">Vast (hypotheek, verzekeringen, etc.)</option>
                <option value="semi_fixed">Semi-vast (vakantie, interieur, etc.)</option>
                <option value="variable">Variabel (boodschappen, uit eten, etc.)</option>
              </Select>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleSaveBudget}
            disabled={!formCategoryId || !formAmount || saving}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogClose onClose={() => setDeleteConfirmOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {deletingItem?.type === "budget" ? "Budget verwijderen" : "Spaardoel verwijderen"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm">
            Weet je zeker dat je <strong>{deletingItem?.name}</strong> wilt verwijderen?
          </p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
            Annuleren
          </Button>
          <Button variant="destructive" onClick={handleDeleteConfirmed}>
            Verwijderen
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Savings Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} dirty={!!goalName || !!goalTarget}>
        <DialogClose onClose={() => setGoalDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingGoal ? "Spaardoel bewerken" : "Nieuw spaardoel"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="goalName">Naam</Label>
              <Input
                id="goalName"
                value={goalName}
                onChange={(e) => { setGoalName(e.target.value); setFormErrors((p) => { const { goalName, ...rest } = p; return rest; }); }}
                placeholder="bijv. Eettafel voor buiten"
                error={formErrors.goalName}
              />
            </div>
            <div>
              <Label htmlFor="goalTarget">Doelbedrag</Label>
              <Input
                id="goalTarget"
                type="number"
                step="0.01"
                min="0"
                value={goalTarget}
                onChange={(e) => { setGoalTarget(e.target.value); setFormErrors((p) => { const { goalTarget, ...rest } = p; return rest; }); }}
                placeholder="0.00"
                error={formErrors.goalTarget}
              />
            </div>
            <div>
              <Label htmlFor="goalCurrent">Huidig gespaard</Label>
              <Input
                id="goalCurrent"
                type="number"
                step="0.01"
                min="0"
                value={goalCurrent}
                onChange={(e) => { setGoalCurrent(e.target.value); setFormErrors((p) => { const { goalCurrent, ...rest } = p; return rest; }); }}
                placeholder="0.00"
                error={formErrors.goalCurrent}
              />
            </div>
            <div>
              <Label htmlFor="goalMonthly">Maandelijkse inleg</Label>
              <Input
                id="goalMonthly"
                type="number"
                step="0.01"
                min="0"
                value={goalMonthly}
                onChange={(e) => { setGoalMonthly(e.target.value); setFormErrors((p) => { const { goalMonthly, ...rest } = p; return rest; }); }}
                placeholder="0.00"
                error={formErrors.goalMonthly}
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleSaveGoal}
            disabled={!goalName || !goalTarget || saving}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
