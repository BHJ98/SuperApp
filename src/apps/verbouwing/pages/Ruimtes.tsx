import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import type { Room, VerbouwingSettings } from "../types";
import {
  createRoom,
  deleteRoom,
  getSettings,
  listRooms,
  subscribeVerbouwing,
  updateRoom,
  updateTotalBudget,
} from "../lib/data";
import { formatCurrency, parseAmount } from "../lib/format";

// Beheer van ruimtes en subdelen (CRUD, zoals Finance-categorieën) plus
// budgetten: totaalbudget (settings-singleton) en budget per ruimte/subdeel.

export default function Ruimtes() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [settings, setSettings] = useState<VerbouwingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Totaalbudget-invoer
  const [totalBudgetStr, setTotalBudgetStr] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

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
      const [r, s] = await Promise.all([listRooms(), getSettings()]);
      setRooms(r);
      setSettings(s);
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

  useEffect(() => {
    if (settings) {
      setTotalBudgetStr(settings.total_budget !== null ? String(settings.total_budget) : "");
    }
  }, [settings]);

  const topRooms = useMemo(() => rooms.filter((r) => !r.parent_id), [rooms]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Room[]>();
    for (const r of rooms) {
      if (r.parent_id) {
        const list = map.get(r.parent_id) ?? [];
        list.push(r);
        map.set(r.parent_id, list);
      }
    }
    return map;
  }, [rooms]);

  async function saveTotalBudget() {
    const value = totalBudgetStr.trim() === "" ? null : parseAmount(totalBudgetStr);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast("Vul een geldig totaalbudget in", "error");
      return;
    }
    setSavingBudget(true);
    try {
      await updateTotalBudget(value);
      setSettings({ id: 1, total_budget: value });
      toast("Totaalbudget opgeslagen");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", "error");
    } finally {
      setSavingBudget(false);
    }
  }

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
    const budget = editBudget.trim() === "" ? null : parseAmount(editBudget);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast("Vul een geldig budget in", "error");
      return;
    }
    try {
      await updateRoom(editingId, { name, budget });
      setRooms((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, name, budget } : r)),
      );
      setEditingId(null);
      toast("Ruimte opgeslagen");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", "error");
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
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={saveEdit}>
            <Check className="h-4 w-4" />
          </button>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditingId(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }
    return (
      <div className={`group flex items-center gap-2 py-2 ${isChild ? "pl-8" : ""}`}>
        <span className={`min-w-0 flex-1 truncate text-sm ${isChild ? "" : "font-medium"}`}>
          {room.name}
        </span>
        <span className="font-mono text-xs text-muted">
          {room.budget !== null ? formatCurrency(room.budget) : "—"}
        </span>
        <div className="flex gap-1">
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
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-40 text-right font-mono"
            inputMode="decimal"
            placeholder="Geen budget"
            value={totalBudgetStr}
            onChange={(e) => setTotalBudgetStr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTotalBudget();
            }}
          />
          <button className="btn-primary px-4 py-2 text-sm" onClick={saveTotalBudget} disabled={savingBudget}>
            {savingBudget && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Opslaan
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Leeg laten = geen totaalbudget. Budgetten per ruimte/subdeel stel je hieronder in.
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
