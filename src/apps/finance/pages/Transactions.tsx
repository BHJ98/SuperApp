
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent } from "@/apps/finance/components/ui/card";
import { Input } from "@/apps/finance/components/ui/input";
import { Select } from "@/apps/finance/components/ui/select";
import { Badge } from "@/apps/finance/components/ui/badge";
import { CategoryCombobox } from "@/apps/finance/components/ui/category-combobox";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/apps/finance/components/ui/dialog";
import { formatCurrency, formatDate } from "@/apps/finance/lib/utils";
import { useToast } from "@/apps/finance/components/ui/toast";
import { TableSkeleton } from "@/apps/finance/components/ui/skeleton";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Filter,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type Transaction = {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  category_id: string | null;
  is_categorized: boolean;
  is_transfer: boolean;
  created_at: string;
};

function parseError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "";
  if (err instanceof TypeError && err.message.includes("fetch")) return "Geen internetverbinding. Controleer je netwerk.";
  return "Kon transacties niet laden. Probeer het opnieuw.";
}

const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const { supabase, householdId, flatCategories, accounts } = useAppData();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCategorized, setFilterCategorized] = useState("no");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Keyboard navigation
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Category assignment
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const lastSelectedIndex = useRef<number>(-1);

  // Smart categorization popup
  const [smartPopupOpen, setSmartPopupOpen] = useState(false);
  const [smartTransaction, setSmartTransaction] = useState<Transaction | null>(null);
  const [smartCategoryId, setSmartCategoryId] = useState<string | null>(null);
  const [smartApplying, setSmartApplying] = useState(false);
  const [smartMatchType, setSmartMatchType] = useState<"iban" | "name_contains" | "description_contains">("name_contains");
  const [smartMatchValue, setSmartMatchValue] = useState("");

  // Transaction detail popup
  const [detailTransaction, setDetailTransaction] = useState<Transaction | null>(null);

  // Precomputed lookup Maps (#2 — O(1) instead of O(n) per row)
  const categoryPathMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of flatCategories) map.set(c.id, c.fullPath);
    return map;
  }, [flatCategories]);

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  const loadTransactions = useCallback(async () => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
    let query = supabase
      .from("transactions")
      .select("id, account_id, date, amount, description, counterparty_name, counterparty_iban, category_id, is_categorized, is_transfer, created_at", { count: "exact" })
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .abortSignal(controller.signal);

    if (filterAccount) {
      query = query.eq("account_id", filterAccount);
    }
    if (filterCategory === "__uncategorized__") {
      query = query.eq("is_categorized", false);
    } else if (filterCategory) {
      query = query.eq("category_id", filterCategory);
    }
    if (filterCategorized === "yes") {
      query = query.eq("is_categorized", true);
    } else if (filterCategorized === "no") {
      query = query.eq("is_categorized", false);
    }
    if (filterDateFrom) {
      query = query.gte("date", filterDateFrom);
    }
    if (filterDateTo) {
      query = query.lte("date", filterDateTo);
    }
    if (debouncedSearch) {
      // Sanitize search input: escape special PostgREST filter characters
      const sanitized = debouncedSearch.replace(/[%_\\]/g, "");
      if (sanitized) {
        query = query.or(
          `description.ilike.%${sanitized}%,counterparty_name.ilike.%${sanitized}%`
        );
      }
    }

    const { data, count, error: queryError } = await query;
    if (controller.signal.aborted) return;
    if (queryError) {
      console.error("Fout bij laden transacties:", queryError.message, queryError.details, queryError.hint);
      if (!controller.signal.aborted) {
        setError(`Kon transacties niet laden: ${queryError.message}`);
        setLoading(false);
      }
      return;
    }
    if (!controller.signal.aborted) {
      if (data) setTransactions(data);
      if (count !== null) setTotalCount(count);
      setLoading(false);
    }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = parseError(err);
      if (msg) setError(msg);
      setLoading(false);
    }
  }, [supabase, page, filterAccount, filterCategory, filterCategorized, filterDateFrom, filterDateTo, debouncedSearch]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  function getCategoryPath(categoryId: string | null): string {
    if (!categoryId) return "";
    return categoryPathMap.get(categoryId) || "";
  }

  function getAccountName(accountId: string): string {
    return accountNameMap.get(accountId) || "";
  }

  function updateTransactionLocally(transactionId: string, categoryId: string | null) {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? { ...t, category_id: categoryId, is_categorized: !!categoryId }
          : t
      )
    );
    if (detailTransaction?.id === transactionId) {
      setDetailTransaction((prev) =>
        prev ? { ...prev, category_id: categoryId, is_categorized: !!categoryId } : null
      );
    }
  }

  async function assignCategory(transactionId: string, categoryId: string | null) {
    const transaction = transactions.find((t) => t.id === transactionId);
    if (!transaction || !categoryId) {
      if (!categoryId) {
        updateTransactionLocally(transactionId, null);
        setEditingTransactionId(null);
        await supabase
          .from("transactions")
          .update({ category_id: null, is_categorized: false })
          .eq("id", transactionId);
      }
      return;
    }

    // Check if this is a new IBAN being categorized (for smart popup)
    const isNewCategorization = !transaction.is_categorized;
    const hasCounterparty = transaction.counterparty_name || transaction.counterparty_iban;

    if (isNewCategorization && hasCounterparty) {
      // Show smart popup with defaults (priority: naam > iban > beschrijving)
      setSmartTransaction(transaction);
      setSmartCategoryId(categoryId);
      if (transaction.counterparty_name) {
        setSmartMatchType("name_contains");
        setSmartMatchValue(transaction.counterparty_name);
      } else if (transaction.counterparty_iban) {
        setSmartMatchType("iban");
        setSmartMatchValue(transaction.counterparty_iban);
      } else {
        setSmartMatchType("description_contains");
        setSmartMatchValue(transaction.description);
      }
      setEditingTransactionId(null);
      setSmartPopupOpen(true);
    } else {
      updateTransactionLocally(transactionId, categoryId);
      setEditingTransactionId(null);
      await supabase
        .from("transactions")
        .update({ category_id: categoryId, is_categorized: true })
        .eq("id", transactionId);
    }
  }

  async function smartAssignOnly() {
    if (!smartTransaction || !smartCategoryId) return;
    setSmartApplying(true);
    updateTransactionLocally(smartTransaction.id, smartCategoryId);
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: smartCategoryId, is_categorized: true })
      .eq("id", smartTransaction.id);
    if (error) {
      console.error("Fout bij toewijzen categorie:", error.message);
      updateTransactionLocally(smartTransaction.id, null);
      toast("Kon categorie niet toewijzen");
    } else {
      toast("Categorie toegewezen");
    }
    setSmartApplying(false);
    setSmartPopupOpen(false);
  }

  async function smartAssignAll() {
    if (!smartTransaction || !smartCategoryId || !smartMatchValue) return;
    setSmartApplying(true);

    let query = supabase
      .from("transactions")
      .update({ category_id: smartCategoryId, is_categorized: true });

    if (smartMatchType === "iban") {
      query = query.eq("counterparty_iban", smartMatchValue);
    } else if (smartMatchType === "name_contains") {
      query = query.ilike("counterparty_name", `%${smartMatchValue}%`);
    } else {
      query = query.ilike("description", `%${smartMatchValue}%`);
    }

    const { error } = await query.eq("is_categorized", false);
    if (error) {
      console.error("Fout bij bulk toewijzen:", error.message);
      setError(`Kon transacties niet bijwerken: ${error.message}`);
    } else {
      toast("Alle overeenkomende transacties gecategoriseerd");
    }

    setSmartApplying(false);
    setSmartPopupOpen(false);
    loadTransactions();
  }

  async function smartAssignAndCreateRule() {
    if (!smartTransaction || !smartCategoryId || !householdId || !smartMatchValue) return;
    setSmartApplying(true);

    // Assign all matching transactions
    let query = supabase
      .from("transactions")
      .update({ category_id: smartCategoryId, is_categorized: true });

    if (smartMatchType === "iban") {
      query = query.eq("counterparty_iban", smartMatchValue);
    } else if (smartMatchType === "name_contains") {
      query = query.ilike("counterparty_name", `%${smartMatchValue}%`);
    } else {
      query = query.ilike("description", `%${smartMatchValue}%`);
    }

    await query.eq("is_categorized", false);

    // Create rule
    const { error: ruleError } = await supabase.from("categorization_rules").insert({
      household_id: householdId,
      match_type: smartMatchType,
      match_value: smartMatchValue,
      category_id: smartCategoryId,
      is_active: true,
    });
    if (ruleError) {
      console.error("Fout bij aanmaken regel:", ruleError.message);
      setError(`Kon regel niet aanmaken: ${ruleError.message}`);
    } else {
      toast("Transacties gecategoriseerd + regel aangemaakt");
    }

    setSmartApplying(false);
    setSmartPopupOpen(false);
    loadTransactions();
  }

  // Keyboard shortcuts for smart popup (1, 2, 3)
  useEffect(() => {
    if (!smartPopupOpen || smartApplying) return;
    function handleKey(e: KeyboardEvent) {
      // Don't intercept when typing in an input or select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "1") { e.preventDefault(); smartAssignOnly(); }
      else if (e.key === "2" && smartMatchValue) { e.preventDefault(); smartAssignAll(); }
      else if (e.key === "3" && smartMatchValue) { e.preventDefault(); smartAssignAndCreateRule(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [smartPopupOpen, smartApplying, smartTransaction, smartCategoryId, smartMatchType, smartMatchValue, householdId]);

  function clearFilters() {
    setSearchQuery("");
    setFilterAccount("");
    setFilterCategory("");
    setFilterCategorized("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPage(0);
  }

  function toggleSelect(id: string, rowIndex?: number, shiftKey?: boolean) {
    if (shiftKey && rowIndex !== undefined && lastSelectedIndex.current >= 0) {
      const start = Math.min(lastSelectedIndex.current, rowIndex);
      const end = Math.max(lastSelectedIndex.current, rowIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(transactions[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    if (rowIndex !== undefined) lastSelectedIndex.current = rowIndex;
  }

  function toggleSelectAll() {
    if (transactions.every((t) => selectedIds.has(t.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  async function bulkAssignCategory(categoryId: string) {
    if (selectedIds.size === 0 || !categoryId) return;
    const ids = Array.from(selectedIds);
    setTransactions((prev) =>
      prev.map((t) =>
        ids.includes(t.id) ? { ...t, category_id: categoryId, is_categorized: true } : t
      )
    );
    setSelectedIds(new Set());
    await supabase
      .from("transactions")
      .update({ category_id: categoryId, is_categorized: true })
      .in("id", ids);
  }

  // Find the next uncategorized row index starting from a given index
  function findNextUncategorized(fromIndex: number): number {
    for (let i = fromIndex + 1; i < transactions.length; i++) {
      if (!transactions[i].is_categorized) return i;
    }
    return Math.min(fromIndex + 1, transactions.length - 1);
  }

  // Global keyboard handler for table navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when focus is in an input/select/textarea (except our combobox which handles its own keys)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      // Don't intercept when smart popup is open
      if (smartPopupOpen) return;

      // Handle shortcuts inside the detail popup
      if (detailTransaction) {
        if ((e.key === "c" || e.key === "Enter") && editingTransactionId !== detailTransaction.id) {
          e.preventDefault();
          setEditingTransactionId(detailTransaction.id);
        }
        return; // Don't process table navigation while detail popup is open
      }

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setKeyboardMode(true);
        setFocusedRowIndex((i) => Math.min(i + 1, transactions.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setKeyboardMode(true);
        setFocusedRowIndex((i) => Math.max(i - 1, 0));
      } else if ((e.key === "Enter" || e.key === "c") && focusedRowIndex >= 0 && !editingTransactionId) {
        e.preventDefault();
        const t = transactions[focusedRowIndex];
        if (t) setEditingTransactionId(t.id);
      } else if (e.key === "Escape") {
        if (editingTransactionId) {
          setEditingTransactionId(null);
        } else {
          setKeyboardMode(false);
          setFocusedRowIndex(-1);
        }
      } else if (e.key === "d" && focusedRowIndex >= 0 && !editingTransactionId) {
        e.preventDefault();
        const t = transactions[focusedRowIndex];
        if (t) setDetailTransaction(t);
      } else if (e.key === " " && focusedRowIndex >= 0 && !editingTransactionId) {
        e.preventDefault();
        const t = transactions[focusedRowIndex];
        if (t) toggleSelect(t.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [transactions, focusedRowIndex, editingTransactionId, smartPopupOpen, detailTransaction]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedRowIndex < 0 || !tableRef.current) return;
    const row = tableRef.current.querySelector(`[data-row-index="${focusedRowIndex}"]`) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedRowIndex]);

  const hasActiveFilters =
    searchQuery || filterAccount || filterCategory || filterCategorized || filterDateFrom || filterDateTo;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Transacties</h1>
          <p className="text-muted-foreground mt-1">
            {totalCount} transactie{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search & filter bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op omschrijving of tegenpartij..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9"
          />
        </div>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4 mr-1" />
          Filters
          {hasActiveFilters && (
            <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
              !
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Rekening
              </label>
              <Select
                value={filterAccount}
                onChange={(e) => {
                  setFilterAccount(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Alle rekeningen</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Categorie
              </label>
              <Select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Alle categorieen</option>
                <option value="__uncategorized__">Niet gecategoriseerd</option>
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00A0\u00A0\u00A0\u00A0".repeat(c.depth)}{c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                value={filterCategorized}
                onChange={(e) => {
                  setFilterCategorized(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Alles</option>
                <option value="yes">Gecategoriseerd</option>
                <option value="no">Niet gecategoriseerd</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Van
                </label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Tot
                </label>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="mb-4">
          <CardContent className="p-3 flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedIds.size} geselecteerd
            </span>
            <Select
              className="w-56"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulkAssignCategory(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Categorie toewijzen...</option>
              {flatCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {"\u00A0\u00A0\u00A0\u00A0".repeat(c.depth)}{c.name}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Deselecteren
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transactions table */}
      <Card>
        <CardContent className="p-0">
          {loading && transactions.length > 0 && (
            <div className="h-1 w-full overflow-hidden">
              <div className="h-full w-1/3 bg-primary rounded animate-pulse" />
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={loadTransactions}>
                <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
              </Button>
            </div>
          ) : loading && transactions.length === 0 ? (
            <TableSkeleton rows={8} cols={6} />
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "Geen transacties gevonden met deze filters."
                  : "Nog geen transacties. Importeer een CSV-bestand."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile card layout */}
              <div className="md:hidden divide-y" ref={tableRef}>
                {transactions.map((t, rowIndex) => (
                  <div
                    key={t.id}
                    data-row-index={rowIndex}
                    className={`p-4 ${selectedIds.has(t.id) ? "bg-accent/30" : ""} ${
                      keyboardMode && focusedRowIndex === rowIndex ? "ring-2 ring-inset ring-ring bg-accent/40" : ""
                    }`}
                    onClick={() => {
                      setFocusedRowIndex(rowIndex);
                      setKeyboardMode(true);
                    }}
                    onDoubleClick={() => setDetailTransaction(t)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={(e) => toggleSelect(t.id, rowIndex, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{formatDate(t.date)}</span>
                          <span
                            className={`font-mono text-sm font-medium ${
                              t.amount < 0 ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {formatCurrency(t.amount)}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-0.5 line-clamp-1">
                          {t.counterparty_name || t.description}
                        </p>
                        {t.counterparty_name && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          {t.is_transfer && (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                              <ArrowLeftRight className="h-3 w-3 mr-1" />Overboeking
                            </Badge>
                          )}
                          {editingTransactionId === t.id ? (
                            <CategoryCombobox
                              categories={flatCategories}
                              value={t.category_id}
                              onSelect={(categoryId) => {
                                assignCategory(t.id, categoryId);
                                const nextIndex = findNextUncategorized(rowIndex);
                                setFocusedRowIndex(nextIndex);
                              }}
                              onCancel={() => setEditingTransactionId(null)}
                            />
                          ) : (
                            <button onClick={() => setEditingTransactionId(t.id)}>
                              {t.category_id ? (
                                <Badge variant="secondary" className="cursor-pointer text-xs">
                                  {getCategoryPath(t.category_id)}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="cursor-pointer text-muted-foreground text-xs">
                                  Niet gecategoriseerd
                                </Badge>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id))}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="text-left py-3 px-4 font-medium">Datum</th>
                      <th className="text-left py-3 px-4 font-medium">
                        Omschrijving
                      </th>
                      <th className="text-left py-3 px-4 font-medium">
                        Tegenpartij
                      </th>
                      <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                        Rekening
                      </th>
                      <th className="text-left py-3 px-4 font-medium">
                        Categorie
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        Bedrag
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, rowIndex) => (
                      <tr
                        key={t.id}
                        data-row-index={rowIndex}
                        className={`border-b hover:bg-accent/50 cursor-pointer ${
                          selectedIds.has(t.id) ? "bg-accent/30" : ""
                        } ${keyboardMode && focusedRowIndex === rowIndex ? "ring-2 ring-inset ring-ring bg-accent/40" : ""}`}
                        onClick={() => {
                          setFocusedRowIndex(rowIndex);
                          setKeyboardMode(true);
                        }}
                        onDoubleClick={() => setDetailTransaction(t)}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={(e) => toggleSelect(t.id, rowIndex, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {formatDate(t.date)}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <span className="line-clamp-1">{t.description}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {t.counterparty_name || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap hidden lg:table-cell">
                          {getAccountName(t.account_id)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {t.is_transfer && (
                              <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 whitespace-nowrap">
                                <ArrowLeftRight className="h-3 w-3 mr-1" />Overboeking
                              </Badge>
                            )}
                            {editingTransactionId === t.id ? (
                              <CategoryCombobox
                                categories={flatCategories}
                                value={t.category_id}
                                onSelect={(categoryId) => {
                                  assignCategory(t.id, categoryId);
                                  const nextIndex = findNextUncategorized(rowIndex);
                                  setFocusedRowIndex(nextIndex);
                                }}
                                onCancel={() => setEditingTransactionId(null)}
                              />
                            ) : (
                              <button
                                onClick={() => setEditingTransactionId(t.id)}
                                className="text-left"
                              >
                                {t.category_id ? (
                                  <Badge variant="secondary" className="cursor-pointer">
                                    {getCategoryPath(t.category_id)}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="cursor-pointer text-muted-foreground"
                                  >
                                    Niet gecategoriseerd
                                  </Badge>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td
                          className={`py-3 px-4 text-right whitespace-nowrap font-mono ${
                            t.amount < 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {formatCurrency(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Pagina {page + 1} van {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keyboard hint */}
      {keyboardMode && (
        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span><kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">↑↓</kbd> navigeer</span>
          <span><kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">Enter</kbd> categorie kiezen</span>
          <span><kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">d</kbd> details</span>
          <span><kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">Spatie</kbd> selecteren</span>
          <span><kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">Esc</kbd> sluiten</span>
        </div>
      )}

      {/* Smart Categorization Popup */}
      <Dialog open={smartPopupOpen} onOpenChange={setSmartPopupOpen}>
        <DialogClose onClose={() => setSmartPopupOpen(false)} />
        <DialogHeader>
          <DialogTitle>Categorie toewijzen</DialogTitle>
        </DialogHeader>
        <DialogContent>
          {smartTransaction && smartCategoryId && (
            <div className="space-y-4">
              <p className="text-sm">
                Je wijst <strong>{getCategoryPath(smartCategoryId)}</strong> toe aan een transactie van{" "}
                <strong>{smartTransaction.counterparty_name || smartTransaction.counterparty_iban}</strong>.
              </p>

              {/* Match type controls */}
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <label className="text-xs font-medium text-muted-foreground">
                  Matchen op
                </label>
                <Select
                  value={smartMatchType}
                  onChange={(e) => {
                    const type = e.target.value as "iban" | "name_contains" | "description_contains";
                    setSmartMatchType(type);
                    if (type === "iban") {
                      setSmartMatchValue(smartTransaction.counterparty_iban || "");
                    } else if (type === "name_contains") {
                      setSmartMatchValue(smartTransaction.counterparty_name || "");
                    } else {
                      setSmartMatchValue(smartTransaction.description || "");
                    }
                  }}
                >
                  {smartTransaction.counterparty_iban && (
                    <option value="iban">IBAN</option>
                  )}
                  {smartTransaction.counterparty_name && (
                    <option value="name_contains">Naam tegenpartij bevat</option>
                  )}
                  <option value="description_contains">Beschrijving bevat</option>
                </Select>
                {smartMatchType === "iban" ? (
                  <p className="text-sm font-mono bg-background rounded px-2 py-1.5 border">
                    {smartMatchValue}
                  </p>
                ) : (
                  <Input
                    value={smartMatchValue}
                    onChange={(e) => setSmartMatchValue(e.target.value)}
                    placeholder={smartMatchType === "name_contains" ? "Naam tegenpartij..." : "Beschrijving..."}
                    className="text-sm"
                  />
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Wat wil je doen?
              </p>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <div className="flex flex-col w-full gap-2">
            <Button
              variant="outline"
              onClick={smartAssignOnly}
              disabled={smartApplying}
              className="justify-start"
            >
              <kbd className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded border bg-muted text-xs font-mono">1</kbd>
              Alleen deze transactie
            </Button>
            <Button
              variant="outline"
              onClick={smartAssignAll}
              disabled={smartApplying || !smartMatchValue}
              className="justify-start"
            >
              <kbd className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded border bg-muted text-xs font-mono">2</kbd>
              Alle ongecategoriseerde toewijzen
            </Button>
            <Button
              onClick={smartAssignAndCreateRule}
              disabled={smartApplying || !smartMatchValue}
              className="justify-start"
            >
              <kbd className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded border bg-muted text-xs font-mono">3</kbd>
              Alle toewijzen + regel aanmaken
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* Transaction Detail Popup */}
      <Dialog open={!!detailTransaction} onOpenChange={(open) => { if (!open) setDetailTransaction(null); }}>
        <DialogClose onClose={() => setDetailTransaction(null)} />
        <DialogHeader>
          <DialogTitle>Transactiedetails</DialogTitle>
        </DialogHeader>
        {detailTransaction && (
          <DialogContent>
            <div className="space-y-4">
              {/* Amount prominently displayed */}
              <div className="text-center py-2">
                <span className={`text-3xl font-bold font-mono ${detailTransaction.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(detailTransaction.amount)}
                </span>
              </div>

              {/* Details grid */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Datum</span>
                  <span className="font-medium">{formatDate(detailTransaction.date)}</span>
                </div>

                {detailTransaction.counterparty_name && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Tegenpartij</span>
                    <span className="font-medium">{detailTransaction.counterparty_name}</span>
                  </div>
                )}

                {detailTransaction.counterparty_iban && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">IBAN tegenpartij</span>
                    <span className="font-mono text-xs">{detailTransaction.counterparty_iban}</span>
                  </div>
                )}

                <div className="py-2 border-b">
                  <span className="text-muted-foreground block mb-1">Omschrijving</span>
                  <p className="font-medium whitespace-pre-wrap break-words">{detailTransaction.description}</p>
                </div>

                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Rekening</span>
                  <span className="font-medium">{getAccountName(detailTransaction.account_id)}</span>
                </div>

                {detailTransaction.is_transfer && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                      <ArrowLeftRight className="h-3 w-3 mr-1" />Overboeking
                    </Badge>
                  </div>
                )}

                {/* Category with inline editing */}
                <div className="py-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground">Categorie</span>
                    {editingTransactionId !== detailTransaction.id && (
                      <span className="text-xs text-muted-foreground">
                        Druk <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border bg-muted text-[10px] font-mono mx-0.5">c</kbd> om te wijzigen
                      </span>
                    )}
                  </div>
                  {editingTransactionId === detailTransaction.id ? (
                    <CategoryCombobox
                      categories={flatCategories}
                      value={detailTransaction.category_id}
                      onSelect={(categoryId) => {
                        assignCategory(detailTransaction.id, categoryId);
                        setDetailTransaction(null);
                      }}
                      onCancel={() => setEditingTransactionId(null)}
                    />
                  ) : (
                    <button onClick={() => setEditingTransactionId(detailTransaction.id)}>
                      {detailTransaction.category_id ? (
                        <Badge variant="secondary" className="cursor-pointer">
                          {getCategoryPath(detailTransaction.category_id)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="cursor-pointer text-muted-foreground">
                          Niet gecategoriseerd — klik om toe te wijzen
                        </Badge>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
