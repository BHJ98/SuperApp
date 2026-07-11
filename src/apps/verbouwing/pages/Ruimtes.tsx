import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import type { Room } from "../types";
import {
  createRoom,
  deleteRoom,
  groupChildrenByParent,
  listRooms,
  subscribeVerbouwing,
  updateRoom,
} from "../lib/data";
import { buildRoomBudgetTree, totalEffectiveBudget } from "../lib/budget";
import { formatCurrency, parseAmount } from "../lib/format";

// Beheer van ruimtes en subdelen (CRUD, zoals Finance-categorieën). Het
// totaalbudget en het budget van een ruimte-met-subdelen worden automatisch
// berekend (som van subdelen resp. som van alle ruimtes) — zie lib/budget.ts.
// Alleen een ruimte zonder subdelen (of een subdeel zelf) heeft nog een
// handmatig budgetveld.

export default function Ruimtes() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline bewerken van één ruimte
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBudget, setEditBudget] = useState("");

  // Toevoeg-formulier: parent_id (null = nieuwe ruimte) of "closed"
  const [addParent, setAddParent] = useState<string | null | "closed">("closed");
  const [addName, setAddName] = useState("");
  const [addBudget, setAddBudget] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await listRooms();
      setRooms(r);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon ruimtes niet laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeVerbouwing("rooms", load);
    return () => unsub();
  }, [load]);

  // Op sort_order gesorteerd zodat optimistische herordening direct zichtbaar is.
  const sortedRooms = useMemo(
    () =>
      [...rooms].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      ),
    [rooms],
  );
  const topRooms = useMemo(() => sortedRooms.filter((r) => !r.parent_id), [sortedRooms]);
  const childrenByParent = useMemo(() => groupChildrenByParent(sortedRooms), [sortedRooms]);
  const roomBudgetTree = useMemo(() => buildRoomBudgetTree(rooms), [rooms]);
  const grandTotal = useMemo(() => totalEffectiveBudget(roomBudgetTree), [roomBudgetTree]);
  const effectiveBudgetByRoomId = useMemo(
    () => new Map(roomBudgetTree.map((n) => [n.room.id, n.effectiveBudget])),
    [roomBudgetTree],
  );

  function startEdit(room: Room) {
    setEditingId(room.id);
    setEditName(room.name);
    setEditBudget(room.budget !== null ? String(room.budget) : "");
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast("Vul een naam in", "error");
      return;
    }
    const hasChildren = (childrenByParent.get(editingId)?.length ?? 0) > 0;
    let budget: number | null = null;
    if (!hasChildren) {
      budget = editBudget.trim() === "" ? null : parseAmount(editBudget);
      if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
        toast("Vul een geldig budget in", "error");
        return;
      }
    }
    try {
      await updateRoom(editingId, hasChildren ? { name } : { name, budget });
      setRooms((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, name, ...(hasChildren ? {} : { budget }) } : r)),
      );
      setEditingId(null);
      toast("Ruimte opgeslagen");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", "error");
    }
  }

  /** Wisselt een ruimte/subdeel van plek met haar buur (via sort_order). */
  async function moveRoom(room: Room, dir: -1 | 1) {
    const siblings = room.parent_id
      ? childrenByParent.get(room.parent_id) ?? []
      : topRooms;
    const idx = siblings.findIndex((r) => r.id === room.id);
    const target = siblings[idx + dir];
    if (!target) return;
    const aOrder = room.sort_order;
    const bOrder = target.sort_order;
    setRooms((prev) =>
      prev.map((r) =>
        r.id === room.id
          ? { ...r, sort_order: bOrder }
          : r.id === target.id
          ? { ...r, sort_order: aOrder }
          : r,
      ),
    );
    try {
      await Promise.all([
        updateRoom(room.id, { sort_order: bOrder }),
        updateRoom(target.id, { sort_order: aOrder }),
      ]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon volgorde niet opslaan", "error");
      load();
    }
  }

  async function handleDelete(room: Room) {
    const isTop = !room.parent_id;
    const childCount = childrenByParent.get(room.id)?.length ?? 0;
    const msg =
      isTop && childCount > 0
        ? `"${room.name}" en de ${childCount} subdelen verwijderen?`
        : `"${room.name}" verwijderen?`;
    if (!confirm(msg)) return;
    try {
      await deleteRoom(room.id);
      setRooms((prev) => prev.filter((r) => r.id !== room.id && r.parent_id !== room.id));
      toast("Ruimte verwijderd");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon ruimte niet verwijderen", "error");
    }
  }

  function startAdd(parentId: string | null) {
    setAddParent(parentId);
    setAddName("");
    setAddBudget("");
  }

  async function saveAdd() {
    if (addParent === "closed") return;
    const name = addName.trim();
    if (!name) {
      toast("Vul een naam in", "error");
      return;
    }
    const budget = addBudget.trim() === "" ? null : parseAmount(addBudget);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast("Vul een geldig budget in", "error");
      return;
    }
    const siblings = addParent === null ? topRooms : childrenByParent.get(addParent) ?? [];
    const sortOrder = Math.max(0, ...siblings.map((r) => r.sort_order)) + 10;
    try {
      const created = await createRoom({
        name,
        parent_id: addParent,
        budget,
        sort_order: sortOrder,
      });
      setRooms((prev) => [...prev, created]);
      setAddParent("closed");
      toast(addParent === null ? "Ruimte toegevoegd" : "Subdeel toegevoegd");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Toevoegen mislukt", "error");
    }
  }

  function renderAddForm(parentId: string | null) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <input
          className="input min-w-0 flex-1 basis-40 !py-1.5 text-sm"
          placeholder={parentId === null ? "Naam nieuwe ruimte" : "Naam subdeel"}
          value={addName}
          autoFocus
          onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveAdd();
            if (e.key === "Escape") setAddParent("closed");
          }}
        />
        <input
          className="input w-28 !py-1.5 text-right font-mono text-sm"
          inputMode="decimal"
          placeholder="Budget"
          value={addBudget}
          onChange={(e) => setAddBudget(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveAdd();
            if (e.key === "Escape") setAddParent("closed");
          }}
        />
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={saveAdd}>
          <Check className="h-4 w-4" />
        </button>
        <button
          className="btn-ghost px-3 py-1.5 text-sm"
          onClick={() => setAddParent("closed")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderRoomRow(room: Room, isChild: boolean) {
    const hasChildren = !isChild && (childrenByParent.get(room.id)?.length ?? 0) > 0;
    if (editingId === room.id) {
      return (
        <div className={`flex flex-wrap items-center gap-2 py-2 ${isChild ? "pl-8" : ""}`}>
          <input
            className="input min-w-0 flex-1 basis-40 !py-1.5 text-sm"
            value={editName}
            autoFocus
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditingId(null);
            }}
          />
          {hasChildren ? (
            <span className="w-28 text-right font-mono text-xs text-muted">
              {formatCurrency(effectiveBudgetByRoomId.get(room.id) ?? 0)}
            </span>
          ) : (
            <input
              className="input w-28 !py-1.5 text-right font-mono text-sm"
              inputMode="decimal"
              placeholder="Budget"
              value={editBudget}
              onChange={(e) => setEditBudget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          )}
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={saveEdit}>
            <Check className="h-4 w-4" />
          </button>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditingId(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }
    const effectiveBudget = hasChildren ? effectiveBudgetByRoomId.get(room.id) ?? null : room.budget;
    const siblings = isChild ? childrenByParent.get(room.parent_id ?? "") ?? [] : topRooms;
    const sibIdx = siblings.findIndex((r) => r.id === room.id);
    const isFirst = sibIdx <= 0;
    const isLast = sibIdx === siblings.length - 1;
    return (
      <div className={`group flex items-center gap-2 py-2 ${isChild ? "pl-8" : ""}`}>
        <span className={`min-w-0 flex-1 truncate text-sm ${isChild ? "" : "font-medium"}`}>
          {room.name}
        </span>
        <div className="flex flex-col items-end">
          <span className="font-mono text-xs text-muted">
            {effectiveBudget !== null ? formatCurrency(effectiveBudget) : "—"}
          </span>
          {hasChildren && (
            <span className="text-[11px] text-muted">Automatisch: som van subdelen</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            className="rounded-lg p-1.5 text-muted transition hover:text-ink disabled:opacity-30"
            onClick={() => moveRoom(room, -1)}
            disabled={isFirst}
            title="Omhoog"
            aria-label={`${room.name} omhoog`}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg p-1.5 text-muted transition hover:text-ink disabled:opacity-30"
            onClick={() => moveRoom(room, 1)}
            disabled={isLast}
            title="Omlaag"
            aria-label={`${room.name} omlaag`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {!isChild && (
            <button
              className="rounded-lg p-1.5 text-muted transition hover:text-ink"
              onClick={() => startAdd(room.id)}
              title="Subdeel toevoegen"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            className="rounded-lg p-1.5 text-muted transition hover:text-ink"
            onClick={() => startEdit(room)}
            title="Bewerken"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg p-1.5 text-muted transition hover:text-danger"
            onClick={() => handleDelete(room)}
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Ruimtes laden…
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
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Ruimtes</h1>
        <p className="mt-1 text-sm text-muted">
          Beheer ruimtes en subdelen, met optioneel een budget per stuk.
        </p>
      </div>

      {/* Totaalbudget */}
      <div className="card">
        <label className="label">Totaalbudget verbouwing</label>
        <p className="mt-1 text-2xl font-bold font-mono">
          {grandTotal !== null ? formatCurrency(grandTotal) : "—"}
        </p>
        <p className="mt-2 text-xs text-muted">
          Automatisch berekend: som van de budgetten van alle ruimtes.
        </p>
      </div>

      {/* Ruimtes-boom */}
      <div className="card">
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {topRooms.map((room) => (
            <div key={room.id}>
              {renderRoomRow(room, false)}
              {(childrenByParent.get(room.id) ?? []).map((child) => (
                <div key={child.id}>{renderRoomRow(child, true)}</div>
              ))}
              {addParent === room.id && <div className="pl-8">{renderAddForm(room.id)}</div>}
            </div>
          ))}
          {topRooms.length === 0 && (
            <p className="py-4 text-sm text-muted">Nog geen ruimtes.</p>
          )}
        </div>
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {addParent === null ? (
            renderAddForm(null)
          ) : (
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => startAdd(null)}>
              <Plus className="h-4 w-4" />
              Ruimte toevoegen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
