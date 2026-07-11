import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import type { EditablePart, Expense, ExpenseWithDetails, Receipt, Room } from "../types";
import {
  createExpense,
  deleteExpense,
  flattenRooms,
  getReceiptSignedUrl,
  updateExpense,
  uploadReceipt,
  type NewPart,
} from "../lib/data";
import { blobToBase64, compressImage } from "../lib/image";
import { formatCurrency, parseAmount, todayISO } from "../lib/format";
import { validateParts } from "../lib/split";
import ReceiptGallery from "./ReceiptGallery";
import SplitEditor, { newEditablePart } from "./SplitEditor";

/** Prefill vanuit een banktransactie in de beoordelen-inbox. */
export type DrawerPrefill = {
  transaction_id: string;
  date: string;
  description: string;
  supplier: string | null;
  total: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: Room[];
  /** Bestaande uitgave bewerken. */
  expense?: ExpenseWithDetails | null;
  /** Nieuwe uitgave vanuit een banktransactie; beide null/undefined = handmatig. */
  prefill?: DrawerPrefill | null;
  onSaved: (expense: Expense) => void;
  onDeleted?: (expense: Expense) => void;
};

export default function ExpenseDrawer({
  open,
  onClose,
  rooms,
  expense = null,
  prefill = null,
  onSaved,
  onDeleted,
}: Props) {
  const { toast } = useToast();
  const roomOptions = useMemo(() => flattenRooms(rooms), [rooms]);

  const transactionId = expense?.transaction_id ?? prefill?.transaction_id ?? null;
  const isBank = transactionId !== null;

  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [mode, setMode] = useState<"single" | "split">("single");
  const [singleRoomId, setSingleRoomId] = useState("");
  const [parts, setParts] = useState<EditablePart[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset alle velden bij openen (op basis van expense / prefill / handmatig).
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setDate(expense.date);
      setDescription(expense.description);
      setSupplier(expense.supplier ?? "");
      setTotalStr(String(expense.total_amount));
      setReceipts(expense.receipts ?? []);
      const existing = expense.expense_parts ?? [];
      if (existing.length > 1) {
        setMode("split");
        setSingleRoomId("");
        setParts(
          existing.map((p) => ({
            key: p.id,
            room_id: p.room_id,
            amount: String(p.amount),
            note: p.note ?? "",
          })),
        );
      } else {
        setMode("single");
        setSingleRoomId(existing[0]?.room_id ?? "");
        setParts([]);
      }
    } else if (prefill) {
      setDate(prefill.date);
      setDescription(prefill.description);
      setSupplier(prefill.supplier ?? "");
      setTotalStr(String(prefill.total));
      setMode("single");
      setSingleRoomId("");
      setParts([]);
      setReceipts([]);
    } else {
      setDate(todayISO());
      setDescription("");
      setSupplier("");
      setTotalStr("");
      setMode("single");
      setSingleRoomId("");
      setParts([]);
      setReceipts([]);
    }
    setPendingFiles([]);
    setSaving(false);
    setDeleting(false);
  }, [open, expense, prefill]);

  const total = useMemo(() => {
    const n = parseAmount(totalStr);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [totalStr]);

  function switchToSplit() {
    if (parts.length === 0) {
      // Start met één regel over het volle bedrag (evt. met de al gekozen ruimte).
      setParts([newEditablePart({ room_id: singleRoomId, amount: totalStr })]);
    }
    setMode("split");
  }

  function switchToSingle() {
    setSingleRoomId(parts[0]?.room_id ?? singleRoomId);
    setMode("single");
  }

  /** Eerste bonfoto als base64 voor de AI-uitlezing (lokaal of uit storage). */
  async function getReceiptImage(): Promise<{ data: string; mediaType: string } | null> {
    if (pendingFiles.length > 0) {
      const compressed = await compressImage(pendingFiles[0]);
      return { data: await blobToBase64(compressed), mediaType: "image/jpeg" };
    }
    if (receipts.length > 0) {
      const url = await getReceiptSignedUrl(receipts[0].storage_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Kon bonfoto niet ophalen");
      const blob = await res.blob();
      return { data: await blobToBase64(blob), mediaType: blob.type || "image/jpeg" };
    }
    return null;
  }

  async function handleSave() {
    if (total === null) {
      toast("Vul een geldig totaalbedrag in", "error");
      return;
    }
    if (!description.trim() && !supplier.trim()) {
      toast("Vul een omschrijving of leverancier in", "error");
      return;
    }
    if (!date) {
      toast("Kies een datum", "error");
      return;
    }

    let partsPayload: NewPart[];
    if (mode === "single") {
      if (!singleRoomId) {
        toast("Kies een ruimte", "error");
        return;
      }
      partsPayload = [{ room_id: singleRoomId, amount: total, note: null }];
    } else {
      if (parts.some((p) => !p.room_id)) {
        toast("Kies een ruimte voor elke split-regel", "error");
        return;
      }
      const amounts = parts.map((p) => parseAmount(p.amount));
      const validation = validateParts(total, amounts.map((amount) => ({ amount })));
      if (!validation.ok) {
        toast(
          parts.length === 0
            ? "Voeg minstens één split-regel toe"
            : validation.remainder >= 0
            ? `Splitsing klopt niet: er is nog ${formatCurrency(
                validation.remainder,
              )} te verdelen`
            : `Splitsing klopt niet: ${formatCurrency(
                -validation.remainder,
              )} te veel verdeeld`,
          "error",
        );
        return;
      }
      partsPayload = parts.map((p, i) => ({
        room_id: p.room_id,
        amount: amounts[i],
        note: p.note.trim() || null,
      }));
    }

    setSaving(true);
    try {
      const fields = {
        date,
        description: description.trim(),
        supplier: supplier.trim() || null,
        total_amount: total,
      };
      let saved: Expense;
      if (expense) {
        await updateExpense(expense.id, fields, partsPayload);
        saved = { ...expense, ...fields };
      } else {
        saved = await createExpense({ ...fields, transaction_id: transactionId }, partsPayload);
      }
      // Nieuwe uitgave: nu pas de lokaal vastgehouden bonfoto's uploaden.
      let uploadFailures = 0;
      for (const file of pendingFiles) {
        try {
          await uploadReceipt(saved.id, file);
        } catch {
          uploadFailures++;
        }
      }
      if (uploadFailures > 0) {
        toast(
          `Uitgave opgeslagen, maar ${uploadFailures} bonfoto('s) konden niet geüpload worden`,
          "error",
        );
      } else {
        toast("Uitgave opgeslagen");
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opslaan mislukt", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!expense) return;
    const msg = expense.transaction_id
      ? "Uitgave verwijderen? De banktransactie komt dan terug in de beoordelen-lijst."
      : "Handmatige uitgave verwijderen?";
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      await deleteExpense(expense);
      toast("Uitgave verwijderd");
      onDeleted?.(expense);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon uitgave niet verwijderen", "error");
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="card max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-b-none sm:rounded-b-xl"
        data-app="verbouwing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {expense ? "Uitgave bewerken" : prefill ? "Verbouwing-uitgave" : "Handmatige uitgave"}
            </h2>
            <p className="text-xs text-muted">
              {isBank ? "Gekoppeld aan een banktransactie" : "Handmatig (contant / andere rekening)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:text-ink"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Basisvelden */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Datum</label>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Totaalbedrag</label>
              {isBank ? (
                <div
                  className="input flex items-center bg-subtle font-mono"
                  title="Bedrag komt uit de banktransactie"
                >
                  {total !== null ? formatCurrency(total) : totalStr}
                </div>
              ) : (
                <input
                  className="input text-right font-mono"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                />
              )}
            </div>
          </div>
          <div>
            <label className="label">Omschrijving</label>
            <input
              className="input"
              placeholder="Bijv. laminaat en plinten"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Leverancier</label>
            <input
              className="input"
              placeholder="Bijv. Hornbach"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>

          {/* Ruimte-toewijzing: één ruimte of splitsen */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label !mb-0">Ruimte</span>
              <div
                className="flex rounded-lg border p-0.5 text-xs"
                style={{ borderColor: "var(--border-strong)" }}
              >
                <button
                  type="button"
                  onClick={switchToSingle}
                  className="rounded-md px-2.5 py-1 font-medium transition"
                  style={
                    mode === "single"
                      ? { background: "var(--accent)", color: "var(--surface)" }
                      : { color: "var(--muted)" }
                  }
                >
                  Eén ruimte
                </button>
                <button
                  type="button"
                  onClick={switchToSplit}
                  className="rounded-md px-2.5 py-1 font-medium transition"
                  style={
                    mode === "split"
                      ? { background: "var(--accent)", color: "var(--surface)" }
                      : { color: "var(--muted)" }
                  }
                >
                  Splitsen
                </button>
              </div>
            </div>
            {mode === "single" ? (
              <select
                className="input"
                value={singleRoomId}
                onChange={(e) => setSingleRoomId(e.target.value)}
              >
                <option value="">Kies ruimte…</option>
                {roomOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {"    ".repeat(o.depth)}
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <SplitEditor
                total={total}
                parts={parts}
                onPartsChange={setParts}
                roomOptions={roomOptions}
                getReceiptImage={getReceiptImage}
              />
            )}
          </div>

          {/* Bonnen */}
          <ReceiptGallery
            expenseId={expense?.id ?? null}
            receipts={receipts}
            onReceiptsChange={setReceipts}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
          />
        </div>

        {/* Acties */}
        <div className="mt-5 flex items-center justify-between gap-2">
          {expense ? (
            <button
              type="button"
              className="btn-danger px-3 py-2 text-sm"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Verwijderen
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
              Annuleren
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Opslaan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
