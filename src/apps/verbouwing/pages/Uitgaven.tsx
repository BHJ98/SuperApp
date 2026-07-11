import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Paperclip, Plus, Receipt, Split } from "lucide-react";
import type { ExpenseWithDetails, Room } from "../types";
import {
  flattenRooms,
  listExpenses,
  listRooms,
  roomWithDescendantIds,
  subscribeVerbouwing,
  type VerbouwingTable,
} from "../lib/data";
import { formatCurrency, formatDate } from "../lib/format";
import ExpenseDrawer from "../components/ExpenseDrawer";

const LIVE_TABLES: VerbouwingTable[] = ["expenses", "expense_parts", "receipts"];

export default function Uitgaven() {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRoomId, setFilterRoomId] = useState("");

  // Drawer: bewerken (expense gezet) of nieuwe handmatige uitgave (open zonder expense)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([listExpenses(), listRooms()]);
      setExpenses(e);
      setRooms(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon uitgaven niet laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Live meebewegen met wijzigingen (ook vanaf andere toestellen).
    const unsubs = LIVE_TABLES.map((t) => subscribeVerbouwing(t, load));
    return () => unsubs.forEach((u) => u());
  }, [load]);

  const roomOptions = useMemo(() => flattenRooms(rooms), [rooms]);
  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of roomOptions) map.set(o.id, o.fullName);
    return map;
  }, [roomOptions]);

  // Filter op ruimte: een gekozen ruimte telt inclusief haar subdelen.
  const filtered = useMemo(() => {
    if (!filterRoomId) return expenses;
    const ids = roomWithDescendantIds(rooms, filterRoomId);
    return expenses.filter((e) => e.expense_parts.some((p) => ids.has(p.room_id)));
  }, [expenses, rooms, filterRoomId]);

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

      {/* Filter op ruimte */}
      <div className="mb-4 max-w-xs">
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
              {filterRoomId
                ? "Geen uitgaven voor deze ruimte."
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
