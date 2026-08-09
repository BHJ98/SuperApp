import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Paperclip, Plus, Receipt, Split, Tag } from "lucide-react";
import type { Category, ExpenseWithDetails, Room } from "../types";
import {
  flattenRooms,
  listCategories,
  listExpenses,
  listRooms,
  roomWithDescendantIds,
  subscribeVerbouwing,
  type VerbouwingTable,
} from "../lib/data";
import { formatCurrency, formatDate } from "../lib/format";
import { useDebouncedCallback } from "../lib/useDebouncedCallback";
import ExpenseDrawer from "../components/ExpenseDrawer";

const LIVE_TABLES: VerbouwingTable[] = ["expenses", "expense_parts", "receipts"];

export default function Uitgaven() {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRoomId, setFilterRoomId] = useState("");
  // "" = alle, "__none" = zonder categorie, anders een category-id.
  const [filterCategoryId, setFilterCategoryId] = useState("");

  // Drawer: bewerken (expense gezet) of nieuwe handmatige uitgave (open zonder expense)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, r, c] = await Promise.all([listExpenses(), listRooms(), listCategories()]);
      setExpenses(e);
      setRooms(r);
      setCategories(c);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon uitgaven niet laden");
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime-events gedebounced: één opgeslagen (split)uitgave vuurt meerdere
  // events af, maar dat hoeft maar één herlaad op te leveren.
  const debouncedLoad = useDebouncedCallback(load);

  useEffect(() => {
    load();
    // Live meebewegen met wijzigingen (ook vanaf andere toestellen).
    const unsubs = LIVE_TABLES.map((t) => subscribeVerbouwing(t, debouncedLoad));
    return () => unsubs.forEach((u) => u());
  }, [load, debouncedLoad]);

  const roomOptions = useMemo(() => flattenRooms(rooms), [rooms]);
  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of roomOptions) map.set(o.id, o.fullName);
    return map;
  }, [roomOptions]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  // Filter op ruimte (inclusief subdelen) en/of categorie.
  const filtered = useMemo(() => {
    let result = expenses;
    if (filterRoomId) {
      const ids = roomWithDescendantIds(rooms, filterRoomId);
      result = result.filter((e) => e.expense_parts.some((p) => ids.has(p.room_id)));
    }
    if (filterCategoryId) {
      result = result.filter((e) =>
        e.expense_parts.some((p) =>
          filterCategoryId === "__none"
            ? !p.category_id
            : p.category_id === filterCategoryId,
        ),
      );
    }
    return result;
  }, [expenses, rooms, filterRoomId, filterCategoryId]);

  const totalShown = filtered.reduce((sum, e) => sum + e.total_amount, 0);

  function openEdit(expense: ExpenseWithDetails) {
    setEditingExpense(expense);
    setDrawerOpen(true);
  }

  function openNew() {
    setEditingExpense(null);
    setDrawerOpen(true);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Uitgaven</h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} uitgave{filtered.length !== 1 ? "n" : ""} ·{" "}
            {formatCurrency(totalShown)}
          </p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Handmatige uitgave
        </button>
      </div>

      {/* Filters op ruimte en categorie */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <label className="label">Filter op ruimte</label>
          <select
            className="input"
            value={filterRoomId}
            onChange={(e) => setFilterRoomId(e.target.value)}
          >
            <option value="">Alle ruimtes</option>
            {roomOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {"    ".repeat(o.depth)}
                {o.name}
              </option>
            ))}
          </select>
        </div>
        {categories.length > 0 && (
          <div className="w-full max-w-xs">
            <label className="label">Filter op categorie</label>
            <select
              className="input"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
            >
              <option value="">Alle categorieën</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__none">Zonder categorie</option>
            </select>
          </div>
        )}
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Uitgaven laden…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <p className="text-sm text-muted">{error}</p>
            <button className="btn-ghost" onClick={load}>
              Opnieuw proberen
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Receipt className="mx-auto mb-3 h-10 w-10 text-faint" />
            <p className="text-sm text-muted">
              {filterRoomId || filterCategoryId
                ? "Geen uitgaven voor dit filter."
                : "Nog geen uitgaven. Beoordeel banktransacties of voeg een handmatige uitgave toe."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((e) => {
              const uniqueRoomNames = Array.from(
                new Set(
                  e.expense_parts.map((p) => roomNameById.get(p.room_id) ?? "Onbekend"),
                ),
              );
              const uniqueCategoryNames = Array.from(
                new Set(
                  e.expense_parts
                    .map((p) => (p.category_id ? categoryNameById.get(p.category_id) : null))
                    .filter((n): n is string => !!n),
                ),
              );
              return (
                <button
                  key={e.id}
                  onClick={() => openEdit(e)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-subtle"
                >
                  <span className="w-20 shrink-0 text-xs text-muted">
                    {formatDate(e.date)}
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">
                      {e.supplier || e.description || "(zonder omschrijving)"}
                    </p>
                    {e.supplier && e.description && (
                      <p className="truncate text-xs text-muted">{e.description}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {uniqueRoomNames.map((name) => (
                        <span key={name} className="chip">
                          {name}
                        </span>
                      ))}
                      {uniqueCategoryNames.map((name) => (
                        <span key={`cat-${name}`} className="chip inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {name}
                        </span>
                      ))}
                      {e.expense_parts.length > 1 && (
                        <span className="chip inline-flex items-center gap-1">
                          <Split className="h-3 w-3" />
                          {e.expense_parts.length} delen
                        </span>
                      )}
                      {!e.transaction_id && <span className="chip">Handmatig</span>}
                    </div>
                  </div>
                  {e.receipts.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Paperclip className="h-3.5 w-3.5" />
                      {e.receipts.length}
                    </span>
                  )}
                  <span className="font-mono text-sm font-medium">
                    {formatCurrency(e.total_amount)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ExpenseDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        rooms={rooms}
        expense={editingExpense}
        onSaved={load}
        onDeleted={load}
      />
    </div>
  );
}
