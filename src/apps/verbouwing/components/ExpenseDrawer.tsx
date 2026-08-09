import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import type { EditablePart, Expense, ExpenseWithDetails, Receipt, Room } from "../types";
import {
  createExpense,
  deleteExpense,
  flattenRooms,
  getReceiptSignedUrl,
  isPdfFile,
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
  // Na een geslaagde create maar met mislukte bon-uploads: de expense bestaat,
  // maar de drawer blijft open zodat de gebruiker het opnieuw kan proberen.
  const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState<File[]>([]);
  const [retrying, setRetrying] = useState(false);
  // Snapshot van de begintoestand voor de "niet-opgeslagen wijzigingen"-check.
  const snapshotRef = useRef<string>("");

  const serialize = useCallback(
    (v: {
      date: string;
      description: string;
      supplier: string;
      totalStr: string;
      mode: "single" | "split";
      singleRoomId: string;
      parts: EditablePart[];
    }) =>
      JSON.stringify({
        date: v.date,
        description: v.description.trim(),
        supplier: v.supplier.trim(),
        totalStr: v.totalStr,
        mode: v.mode,
        singleRoomId: v.singleRoomId,
        parts: v.parts.map((p) => ({ room_id: p.room_id, amount: p.amount, note: p.note })),
      }),
    [],
  );

  // Reset alle velden bij openen (op basis van expense / prefill / handmatig).
  useEffect(() => {
    if (!open) return;
    const init = {
      date: todayISO(),
      description: "",
      supplier: "",
      totalStr: "",
      mode: "single" as "single" | "split",
      singleRoomId: "",
      parts: [] as EditablePart[],
      receipts: [] as Receipt[],
    };
    if (expense) {
      init.date = expense.date;
      init.description = expense.description;
      init.supplier = expense.supplier ?? "";
      init.totalStr = String(expense.total_amount);
      init.receipts = expense.receipts ?? [];
      const existing = expense.expense_parts ?? [];
      if (existing.length > 1) {
        init.mode = "split";
        init.parts = existing.map((p) => ({
          key: p.id,
          room_id: p.room_id,
          amount: String(p.amount),
          note: p.note ?? "",
        }));
      } else {
        init.singleRoomId = existing[0]?.room_id ?? "";
      }
    } else if (prefill) {
      init.date = prefill.date;
      init.description = prefill.description;
      init.supplier = prefill.supplier ?? "";
      init.totalStr = String(prefill.total);
    }
    setDate(init.date);
    setDescription(init.description);
    setSupplier(init.supplier);
    setTotalStr(init.totalStr);
    setMode(init.mode);
    setSingleRoomId(init.singleRoomId);
    setParts(init.parts);
    setReceipts(init.receipts);
    setPendingFiles([]);
    setSaving(false);
    setDeleting(false);
    setSavedExpenseId(null);
    setUploadFailed([]);
    setRetrying(false);
    snapshotRef.current = serialize(init);
  }, [open, expense, prefill, serialize]);

  const total = useMemo(() => {
    const n = parseAmount(totalStr);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [totalStr]);

  const hasUnsavedChanges =
    pendingFiles.length > 0 ||
    serialize({ date, description, supplier, totalStr, mode, singleRoomId, parts }) !==
      snapshotRef.current;

  // Sluiten met bevestiging als er niet-opgeslagen wijzigingen zijn. Zodra de
  // uitgave is aangemaakt (savedExpenseId) is het formulier al bewaard; de
  // waarschuwing over niet-geüploade bonnen staat dan apart in beeld.
  const requestClose = useCallback(() => {
    if (savedExpenseId) {
      onClose();
      return;
    }
    if (hasUnsavedChanges && !confirm("Niet-opgeslagen wijzigingen verliezen?")) return;
    onClose();
  }, [savedExpenseId, hasUnsavedChanges, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Staat de bon-lightbox (in ReceiptGallery) open, dan handelt die de
      // Escape af — niet de drawer sluiten.
      if (document.querySelector("[data-receipt-lightbox]")) return;
      requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  function switchToSplit() {
    if (parts.length === 0) {
      // Start met één regel over het volle bedrag (evt. met de al gekozen ruimte).
      setParts([newEditablePart({ room_id: singleRoomId, amount: totalStr })]);
    }
    setMode("split");
  }

  function switchToSingle() {
    // Bij >1 regel zou terugschakelen alle extra regels weggooien — bevestig eerst.
    if (
      parts.length > 1 &&
      !confirm("Terug naar één ruimte? De extra split-regels worden verwijderd.")
    ) {
      return;
    }
    setSingleRoomId(parts[0]?.room_id ?? singleRoomId);
    setMode("single");
  }

  /** Uploadt bestanden naar een bestaande expense; geeft de mislukte terug. */
  async function uploadFiles(expenseId: string, files: File[]): Promise<File[]> {
    const failed: File[] = [];
    for (const file of files) {
      try {
        await uploadReceipt(expenseId, file);
      } catch {
        failed.push(file);
      }
    }
    return failed;
  }

  async function retryUploads() {
    if (!savedExpenseId) return;
    setRetrying(true);
    try {
      const stillFailed = await uploadFiles(savedExpenseId, uploadFailed);
      if (stillFailed.length === 0) {
        toast("Bonfoto's geüpload");
        onClose();
      } else {
        setUploadFailed(stillFailed);
        toast(`${stillFailed.length} bonfoto('s) nog steeds niet geüpload`, "error");
      }
    } finally {
      setRetrying(false);
    }
  }

  /** Eerste bon als base64 voor de AI-uitlezing (lokaal of uit storage).
   *  Foto's worden gecomprimeerd; PDF's gaan ongewijzigd mee (Claude leest ze direct). */
  async function getReceiptImage(): Promise<{ data: string; mediaType: string } | null> {
    if (pendingFiles.length > 0) {
      const file = pendingFiles[0];
      if (isPdfFile(file)) {
        return { data: await blobToBase64(file), mediaType: "application/pdf" };
      }
      const compressed = await compressImage(file);
      return { data: await blobToBase64(compressed), mediaType: "image/jpeg" };
    }
    if (receipts.length > 0) {
      const url = await getReceiptSignedUrl(receipts[0].storage_path);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Kon bon niet ophalen");
      const blob = await res.blob();
      return { data: await blobToBase64(blob), mediaType: blob.type || "image/jpeg" };
    }
    return null;
  }

  async function handleSave() {
    if (roomOptions.length === 0) {
      toast("Maak eerst een ruimte aan onder Ruimtes", "error");
      return;
    }
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
      const failed = pendingFiles.length > 0 ? await uploadFiles(saved.id, pendingFiles) : [];
      onSaved(saved);
      if (failed.length > 0) {
        // Uitgave staat er; laat de drawer open zodat de mislukte uploads
        // opnieuw geprobeerd kunnen worden (zonder ze opnieuw te hoeven kiezen).
        setSavedExpenseId(saved.id);
        setUploadFailed(failed);
        setPendingFiles([]);
        toast(`Uitgave opgeslagen, ${failed.length} bonfoto('s) niet geüpload`, "error");
      } else {
        toast("Uitgave opgeslagen");
        onClose();
      }
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
      onClick={requestClose}
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
            onClick={requestClose}
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
          {roomOptions.length === 0 ? (
            <div
              className="rounded-xl border p-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
            >
              <p className="text-muted">
                Er zijn nog geen ruimtes. Maak eerst een ruimte aan om deze uitgave aan toe te
                wijzen.
              </p>
              <Link
                to="/verbouwing/ruimtes"
                onClick={requestClose}
                className="mt-2 inline-block font-medium text-info"
              >
                Naar Ruimtes →
              </Link>
            </div>
          ) : (
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
          )}

          {/* Bonnen */}
          <ReceiptGallery
            expenseId={expense?.id ?? savedExpenseId}
            receipts={receipts}
            onReceiptsChange={setReceipts}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
          />

          {/* Mislukte bon-uploads: opnieuw proberen zonder opnieuw te kiezen */}
          {uploadFailed.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm"
              style={{ borderColor: "rgba(239,68,68,0.5)", background: "var(--subtle)" }}
            >
              <AlertTriangle className="h-4 w-4 text-danger" />
              <span className="flex-1">
                {uploadFailed.length} bonfoto('s) zijn niet geüpload.
              </span>
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-sm"
                onClick={retryUploads}
                disabled={retrying}
              >
                {retrying && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Opnieuw proberen
              </button>
            </div>
          )}
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
            <button type="button" className="btn-ghost" onClick={requestClose} disabled={saving}>
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
