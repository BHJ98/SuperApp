import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Inbox, LoaderCircle } from "lucide-react";
import type { Category, ExpenseWithDetails, Room } from "../types";
import {
  fetchInboxCount,
  groupChildrenByParent,
  listCategories,
  listExpenses,
  listRooms,
  subscribeVerbouwing,
  type VerbouwingTable,
} from "../lib/data";
import { buildRoomBudgetTree, effectiveRoomBudget, totalEffectiveBudget } from "../lib/budget";
import { formatCurrency, formatMonth } from "../lib/format";
import { useDebouncedCallback } from "../lib/useDebouncedCallback";

// Eigen financiële rapportage van de verbouwing: besteed vs. budget (totaal,
// per ruimte en per subdeel), verdeling per ruimte en verloop per maand.
// Bewust simpele CSS-balken/donut i.p.v. recharts — houdt de bundel klein.

const LIVE_TABLES: VerbouwingTable[] = [
  "rooms",
  "expenses",
  "expense_parts",
  "dismissed_transactions",
];

const DONUT_PALETTE = [
  "#C0772F",
  "#3B6FD4",
  "#3D8B57",
  "#B04343",
  "#1F8B8B",
  "#5558D9",
  "#A97618",
  "#75845F",
  "#8B8DF2",
  "#D97F7F",
];

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const over = spent > budget;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 100;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-subtle">
      <div
        className={`h-full rounded-full ${over ? "bg-danger" : "bg-ok"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Overzicht() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [r, e, c, cats] = await Promise.all([
        listRooms(),
        listExpenses(),
        fetchInboxCount(),
        listCategories(),
      ]);
      setRooms(r);
      setExpenses(e);
      setInboxCount(c);
      setCategories(cats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon overzicht niet laden");
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoad = useDebouncedCallback(load);

  useEffect(() => {
    load();
    const unsubs = LIVE_TABLES.map((t) => subscribeVerbouwing(t, debouncedLoad));
    return () => unsubs.forEach((u) => u());
  }, [load, debouncedLoad]);

  const spentByRoom = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      for (const p of e.expense_parts) {
        map.set(p.room_id, (map.get(p.room_id) ?? 0) + p.amount);
      }
    }
    return map;
  }, [expenses]);

  const totalSpent = useMemo(
    () => expenses.reduce((sum, e) => sum + e.total_amount, 0),
    [expenses],
  );

  // Besteed per categorie (tweede snijvlak naast ruimtes); parts zonder
  // categorie vallen in de "Zonder categorie"-bucket onderaan.
  const categoryBreakdown = useMemo(() => {
    if (categories.length === 0) return [];
    const spentByCategory = new Map<string, number>();
    let uncategorised = 0;
    for (const e of expenses) {
      for (const p of e.expense_parts) {
        if (p.category_id) {
          spentByCategory.set(p.category_id, (spentByCategory.get(p.category_id) ?? 0) + p.amount);
        } else {
          uncategorised += p.amount;
        }
      }
    }
    const rows = categories
      .map((c) => ({ id: c.id, name: c.name, spent: spentByCategory.get(c.id) ?? 0 }))
      .filter((r) => r.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    if (uncategorised > 0) {
      rows.push({ id: "__none", name: "Zonder categorie", spent: uncategorised });
    }
    return rows;
  }, [categories, expenses]);
  const maxCategorySpent = Math.max(1, ...categoryBreakdown.map((r) => r.spent));

  // Per top-level ruimte: eigen + subdeel-besteding, met de subdeel-regels erbij.
  const roomBreakdown = useMemo(() => {
    const childrenByParent = groupChildrenByParent(rooms);
    return rooms
      .filter((r) => !r.parent_id)
      .map((room) => {
        const childRooms = childrenByParent.get(room.id) ?? [];
        const children = childRooms.map((child) => ({
          room: child,
          spent: spentByRoom.get(child.id) ?? 0,
        }));
        const ownSpent = spentByRoom.get(room.id) ?? 0;
        const spent = ownSpent + children.reduce((s, c) => s + c.spent, 0);
        const effectiveBudget = effectiveRoomBudget(room, childRooms);
        return { room, spent, ownSpent, children, effectiveBudget };
      });
  }, [rooms, spentByRoom]);

  // Donut: verdeling van het bestede bedrag over de (top-level) ruimtes.
  const distribution = useMemo(() => {
    const withSpent = roomBreakdown
      .filter((r) => r.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    const total = withSpent.reduce((s, r) => s + r.spent, 0);
    let angle = 0;
    const segments = withSpent.map((r, i) => {
      const from = angle;
      const fraction = total > 0 ? r.spent / total : 0;
      angle += fraction * 360;
      return {
        name: r.room.name,
        spent: r.spent,
        fraction,
        color: DONUT_PALETTE[i % DONUT_PALETTE.length],
        from,
        to: angle,
      };
    });
    return { segments, total };
  }, [roomBreakdown]);

  const donutGradient =
    distribution.segments.length > 0
      ? `conic-gradient(${distribution.segments
          .map((s) => `${s.color} ${s.from.toFixed(2)}deg ${s.to.toFixed(2)}deg`)
          .join(", ")})`
      : undefined;

  // Uitgaven per maand (chronologisch), inclusief tussenliggende maanden zonder
  // uitgaven (op €0) zodat de tijdlijn geen misleidende gaten overslaat.
  const perMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + e.total_amount);
    }
    const keys = Array.from(map.keys()).sort();
    if (keys.length === 0) return [] as [string, number][];
    const [firstYear, firstMonth] = keys[0].split("-").map(Number);
    const [lastYear, lastMonth] = keys[keys.length - 1].split("-").map(Number);
    const out: [string, number][] = [];
    let y = firstYear;
    let m = firstMonth;
    while (y < lastYear || (y === lastYear && m <= lastMonth)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      out.push([key, map.get(key) ?? 0]);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }, [expenses]);
  const maxMonth = Math.max(1, ...perMonth.map(([, v]) => v));

  const totalBudget = useMemo(
    () => totalEffectiveBudget(buildRoomBudgetTree(rooms)),
    [rooms],
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Overzicht laden…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <p className="text-sm text-muted">{error}</p>
        <button className="btn-ghost" onClick={load}>
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 font-display text-2xl font-bold tracking-tight">Overzicht</h1>

      {/* Samenvattende kaarten */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-muted">Totaal besteed</p>
          <p className="mt-1 text-2xl font-bold font-mono">{formatCurrency(totalSpent)}</p>
          {totalBudget !== null && totalBudget > 0 && (
            <div className="mt-3">
              <BudgetBar spent={totalSpent} budget={totalBudget} />
              <p className="mt-1 text-xs text-muted">
                van {formatCurrency(totalBudget)} totaalbudget
              </p>
            </div>
          )}
        </div>
        <div className="card">
          <p className="text-sm text-muted">
            {totalBudget !== null ? "Resterend budget" : "Aantal uitgaven"}
          </p>
          {totalBudget !== null ? (
            <p
              className={`mt-1 text-2xl font-bold font-mono ${
                totalBudget - totalSpent < 0 ? "text-danger" : "text-ok"
              }`}
            >
              {formatCurrency(totalBudget - totalSpent)}
            </p>
          ) : (
            <p className="mt-1 text-2xl font-bold font-mono">{expenses.length}</p>
          )}
        </div>
        <Link to="/verbouwing/beoordelen" className="card block transition hover:shadow-e2">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Inbox className="h-4 w-4" />
            Nog te beoordelen
          </p>
          <p className="mt-1 text-2xl font-bold font-mono">{inboxCount}</p>
          <p className="mt-1 text-xs text-info">Naar beoordelen →</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Besteed vs budget per ruimte, uitklapbaar naar subdelen */}
        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-display text-base font-semibold">Per ruimte</h2>
          {roomBreakdown.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Nog geen ruimtes. Maak ze aan onder Ruimtes.
            </p>
          ) : (
            <div className="space-y-1">
              {roomBreakdown.map(({ room, spent, ownSpent, children, effectiveBudget }) => {
                const isOpen = expanded.has(room.id);
                const hasChildren = children.length > 0;
                return (
                  <div key={room.id}>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-subtle"
                      onClick={() => hasChildren && toggleExpand(room.id)}
                    >
                      {hasChildren ? (
                        isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                        )
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{room.name}</span>
                          <span
                            className={`whitespace-nowrap font-mono text-sm ${
                              effectiveBudget !== null && spent > effectiveBudget
                                ? "text-danger"
                                : ""
                            }`}
                          >
                            {formatCurrency(spent)}
                            {effectiveBudget !== null && (
                              <span className="text-muted"> / {formatCurrency(effectiveBudget)}</span>
                            )}
                          </span>
                        </div>
                        {effectiveBudget !== null && effectiveBudget > 0 && (
                          <div className="mt-1">
                            <BudgetBar spent={spent} budget={effectiveBudget} />
                          </div>
                        )}
                      </div>
                    </button>
                    {isOpen &&
                      hasChildren &&
                      [
                        ...(ownSpent > 0
                          ? [
                              {
                                room: {
                                  ...room,
                                  id: `${room.id}-own`,
                                  name: "(direct op de ruimte)",
                                  budget: null,
                                } as Room,
                                spent: ownSpent,
                              },
                            ]
                          : []),
                        ...children,
                      ].map(({ room: child, spent: childSpent }) => (
                        <div key={child.id} className="ml-8 px-2 py-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm text-muted">{child.name}</span>
                            <span
                              className={`whitespace-nowrap font-mono text-xs ${
                                child.budget !== null && childSpent > child.budget
                                  ? "text-danger"
                                  : "text-muted"
                              }`}
                            >
                              {formatCurrency(childSpent)}
                              {child.budget !== null && ` / ${formatCurrency(child.budget)}`}
                            </span>
                          </div>
                          {child.budget !== null && child.budget > 0 && (
                            <div className="mt-1">
                              <BudgetBar spent={childSpent} budget={child.budget} />
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Verdeling per ruimte (donut) */}
        <div className="card">
          <h2 className="mb-3 font-display text-base font-semibold">Verdeling per ruimte</h2>
          {distribution.segments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nog geen uitgaven.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <div
                className="relative h-36 w-36 shrink-0 rounded-full"
                style={{ background: donutGradient }}
                role="img"
                aria-label="Verdeling van uitgaven per ruimte"
              >
                <div
                  className="absolute inset-4 flex items-center justify-center rounded-full text-center"
                  style={{ background: "var(--surface)" }}
                >
                  <span className="px-1 font-mono text-xs text-muted">
                    {formatCurrency(distribution.total)}
                  </span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {distribution.segments.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="font-mono text-xs text-muted">
                      {formatCurrency(s.spent)} · {Math.round(s.fraction * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Besteed per categorie (verschijnt zodra de categorieën-migratie er is) */}
        {categories.length > 0 && (
          <div className="card">
            <h2 className="mb-3 font-display text-base font-semibold">Per categorie</h2>
            {categoryBreakdown.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                Nog geen uitgaven met een categorie. Kies er één bij het opslaan van een
                uitgave (per regel bij een splitsing).
              </p>
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map((row) => (
                  <div key={row.id}>
                    <div className="flex justify-between text-sm">
                      <span className={row.id === "__none" ? "text-muted" : ""}>
                        {row.name}
                      </span>
                      <span className="font-mono">{formatCurrency(row.spent)}</span>
                    </div>
                    <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(row.spent / maxCategorySpent) * 100}%`,
                          background:
                            row.id === "__none" ? "var(--border-strong)" : "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Uitgaven per maand */}
        <div className="card">
          <h2 className="mb-3 font-display text-base font-semibold">Uitgaven per maand</h2>
          {perMonth.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nog geen uitgaven.</p>
          ) : (
            <div className="space-y-2">
              {perMonth.map(([month, amount]) => (
                <div key={month}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">{formatMonth(month)}</span>
                    <span className="font-mono">{formatCurrency(amount)}</span>
                  </div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(amount / maxMonth) * 100}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
