import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Category, EditablePart, RoomOption } from "../types";
import { parseReceipt } from "../lib/data";
import { formatCurrency, parseAmount } from "../lib/format";
import { validateParts } from "../lib/split";

export function newEditablePart(overrides: Partial<EditablePart> = {}): EditablePart {
  return {
    key: crypto.randomUUID(),
    room_id: "",
    amount: "",
    note: "",
    category_id: "",
    ...overrides,
  };
}

type AiLine = {
  key: string;
  checked: boolean;
  description: string;
  amount: number;
  room_id: string;
};

type Props = {
  /** Geparsed totaalbedrag van de uitgave (null zolang ongeldig). */
  total: number | null;
  parts: EditablePart[];
  onPartsChange: (parts: EditablePart[]) => void;
  roomOptions: RoomOption[];
  /** Leeg = categorie-UI verbergen (migratie nog niet gedraaid). */
  categories: Category[];
  /** Levert de eerste bonfoto als base64 (of null als er nog geen foto is). */
  getReceiptImage: () => Promise<{ data: string; mediaType: string } | null>;
};

export default function SplitEditor({
  total,
  parts,
  onPartsChange,
  roomOptions,
  categories,
  getReceiptImage,
}: Props) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLines, setAiLines] = useState<AiLine[] | null>(null);
  const [groupRoomId, setGroupRoomId] = useState("");

  const validation = useMemo(() => {
    if (total === null) return null;
    return validateParts(
      total,
      parts.map((p) => ({ amount: parseAmount(p.amount) })),
    );
  }, [total, parts]);

  function updatePart(key: string, patch: Partial<EditablePart>) {
    onPartsChange(parts.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function removePart(key: string) {
    onPartsChange(parts.filter((p) => p.key !== key));
  }

  function addPart() {
    onPartsChange([...parts, newEditablePart()]);
  }

  // ---- AI-bonuitlezing: uitsluitend hier en uitsluitend op klik ----

  async function runAi() {
    setAiError(null);
    setAiLoading(true);
    try {
      const image = await getReceiptImage();
      if (!image) {
        setAiError("Upload eerst een bon (foto of PDF, hieronder bij Bonnen) om uit te lezen.");
        return;
      }
      const parsed = await parseReceipt(image.data, image.mediaType);
      if (parsed.lines.length === 0) {
        setAiError("Geen regelitems gevonden op de bon.");
        return;
      }
      setAiLines(
        parsed.lines.map((l) => ({
          key: crypto.randomUUID(),
          checked: true,
          description: l.description,
          amount: l.amount,
          room_id: "",
        })),
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Bon uitlezen mislukt");
    } finally {
      setAiLoading(false);
    }
  }

  function updateAiLine(key: string, patch: Partial<AiLine>) {
    setAiLines((lines) =>
      lines ? lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) : lines,
    );
  }

  function applyGroupRoom(roomId: string) {
    setGroupRoomId(roomId);
    if (!roomId) return;
    setAiLines((lines) =>
      lines ? lines.map((l) => (l.checked ? { ...l, room_id: roomId } : l)) : lines,
    );
  }

  function addAiLinesAsParts() {
    if (!aiLines) return;
    const selected = aiLines.filter((l) => l.checked);
    if (selected.length === 0) {
      setAiError("Vink minstens één regel aan.");
      return;
    }
    if (selected.some((l) => !l.room_id)) {
      setAiError("Kies een ruimte voor elke aangevinkte regel (of gebruik de groepskeuze).");
      return;
    }
    const newParts = selected.map((l) =>
      newEditablePart({
        room_id: l.room_id,
        amount: String(l.amount),
        note: l.description,
      }),
    );
    // Eén lege of totaal-brede prefill-regel wordt vervangen; echte handmatige
    // parts blijven staan en de AI-regels komen erbij.
    const keep = parts.filter((p) => {
      const amount = parseAmount(p.amount);
      const isBlank = !p.room_id && !p.note && (p.amount === "" || Number.isNaN(amount));
      const isFullPrefill =
        parts.length === 1 && total !== null && amount === total && !p.note;
      return !isBlank && !isFullPrefill;
    });
    onPartsChange([...keep, ...newParts]);
    setAiLines(null);
    setAiError(null);
    setGroupRoomId("");
  }

  const aiSum = aiLines
    ? aiLines.filter((l) => l.checked).reduce((s, l) => s + l.amount, 0)
    : 0;

  return (
    <div className="space-y-3">
      {/* Parts-regels */}
      <div className="space-y-2">
        {parts.map((p) => (
          <div key={p.key} className="flex flex-wrap items-center gap-2">
            <select
              className="input min-w-0 flex-1 basis-40 !py-1.5 text-sm"
              value={p.room_id}
              onChange={(e) => updatePart(p.key, { room_id: e.target.value })}
            >
              <option value="">Kies ruimte…</option>
              {roomOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {"    ".repeat(o.depth)}
                  {o.name}
                </option>
              ))}
            </select>
            <input
              className="input w-24 !py-1.5 text-right font-mono text-sm"
              inputMode="decimal"
              placeholder="0,00"
              value={p.amount}
              onChange={(e) => updatePart(p.key, { amount: e.target.value })}
            />
            {categories.length > 0 && (
              <select
                className="input w-40 min-w-0 basis-36 !py-1.5 text-sm"
                value={p.category_id}
                onChange={(e) => updatePart(p.key, { category_id: e.target.value })}
              >
                <option value="">Categorie…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              className="input min-w-0 flex-1 basis-32 !py-1.5 text-sm"
              placeholder="Notitie (optioneel)"
              value={p.note}
              onChange={(e) => updatePart(p.key, { note: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removePart(p.key)}
              className="rounded-lg p-1.5 text-muted transition hover:text-danger"
              aria-label="Regel verwijderen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={addPart}>
          <Plus className="h-4 w-4" />
          Regel toevoegen
        </button>
        {validation && (
          <span
            className={`text-sm font-medium ${
              validation.ok ? "text-ok" : "text-danger"
            }`}
          >
            {validation.ok
              ? "Splitsing klopt"
              : validation.remainder >= 0
              ? `Nog te verdelen: ${formatCurrency(validation.remainder)}`
              : `Te veel verdeeld: ${formatCurrency(-validation.remainder)}`}
          </span>
        )}
      </div>

      {/* AI-bonuitlezing — nooit automatisch, alleen op klik */}
      <div
        className="rounded-xl border p-3"
        style={{ borderColor: "var(--border)", background: "var(--subtle)" }}
      >
        {aiLines === null ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={runAi}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Bon uitlezen met AI
            </button>
            <span className="text-xs text-muted">
              Leest de regelitems van de eerste bonfoto en helpt ze aan ruimtes toe te wijzen.
              Gebruikt de AI-service — alleen als je hierop klikt.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">Uitgelezen bonregels</span>
              <label className="flex items-center gap-2 text-xs text-muted">
                Ruimte voor aangevinkte regels
                <select
                  className="input w-40 !py-1 text-sm"
                  value={groupRoomId}
                  onChange={(e) => applyGroupRoom(e.target.value)}
                >
                  <option value="">Kies…</option>
                  {roomOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {"    ".repeat(o.depth)}
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {aiLines.map((l) => (
                <div key={l.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={l.checked}
                    onChange={(e) => updateAiLine(l.key, { checked: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="min-w-0 flex-1 truncate" title={l.description}>
                    {l.description || "(zonder omschrijving)"}
                  </span>
                  <span className="w-20 text-right font-mono">{formatCurrency(l.amount)}</span>
                  <select
                    className="input w-36 !py-1 text-sm"
                    value={l.room_id}
                    onChange={(e) => updateAiLine(l.key, { room_id: e.target.value })}
                  >
                    <option value="">Ruimte…</option>
                    {roomOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {"    ".repeat(o.depth)}
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted">
                Aangevinkt: {formatCurrency(aiSum)}
                {total !== null && ` van ${formatCurrency(total)}`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm"
                  onClick={() => {
                    setAiLines(null);
                    setAiError(null);
                    setGroupRoomId("");
                  }}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-sm"
                  onClick={addAiLinesAsParts}
                >
                  Voeg toe als splitsing
                </button>
              </div>
            </div>
          </div>
        )}
        {aiError && <p className="mt-2 text-sm text-danger">{aiError}</p>}
      </div>
    </div>
  );
}
