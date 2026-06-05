import { useMemo, useState } from "react";
import { useAppData } from "../providers";
import type { Regel } from "../lib/types";

export default function RegelsPage() {
  const { data, mutate } = useAppData();
  const [keyword, setKeyword] = useState("");
  const [bakjeId, setBakjeId] = useState(data.bakjes[0]?.id ?? "");
  const [matchVeld, setMatchVeld] = useState<"titel" | "beschrijving">("titel");

  const bakjenaamById = useMemo(
    () => Object.fromEntries(data.bakjes.map((b) => [b.id, b.naam])),
    [data.bakjes],
  );

  async function toevoegen(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || !bakjeId) return;
    const nieuw: Regel = {
      id: crypto.randomUUID(),
      keyword: keyword.trim(),
      bakjeId,
      matchVeld,
      caseSensitive: false,
      actief: true,
    };
    await mutate((prev) => ({ ...prev, regels: [...prev.regels, nieuw] }));
    setKeyword("");
  }

  async function update(id: string, patch: Partial<Regel>) {
    await mutate((prev) => ({
      ...prev,
      regels: prev.regels.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  async function verwijder(id: string) {
    await mutate((prev) => ({ ...prev, regels: prev.regels.filter((r) => r.id !== id) }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regels</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Een regel koppelt events met een bepaald trefwoord automatisch aan een bakje. Handmatige
          toewijzingen hebben altijd voorrang op regels.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-medium mb-3">Nieuwe regel</h2>
        {data.bakjes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Maak eerst een bakje aan op <a href="/bakjes/bakjes" className="underline">Bakjes</a>.
          </p>
        ) : (
          <form className="flex gap-2 items-end flex-wrap" onSubmit={toevoegen}>
            <label className="text-sm flex flex-col flex-1 min-w-[180px]">
              Trefwoord
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="bijv. standup"
                className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
              />
            </label>
            <label className="text-sm flex flex-col">
              Bakje
              <select
                value={bakjeId}
                onChange={(e) => setBakjeId(e.target.value)}
                className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
              >
                {data.bakjes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.naam}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex flex-col">
              Match in
              <select
                value={matchVeld}
                onChange={(e) => setMatchVeld(e.target.value as "titel" | "beschrijving")}
                className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
              >
                <option value="titel">Titel</option>
                <option value="beschrijving">Beschrijving</option>
              </select>
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm"
            >
              Toevoegen
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        {data.regels.length === 0 && (
          <div className="card p-5 text-sm text-slate-600 dark:text-slate-400">
            Nog geen regels. Ze worden automatisch voorgesteld tijdens inventariseren.
          </div>
        )}
        {data.regels.map((r) => (
          <div key={r.id} className="card p-3 flex items-center gap-3 flex-wrap">
            <input
              type="checkbox"
              checked={r.actief}
              onChange={(e) => update(r.id, { actief: e.target.checked })}
              aria-label="actief"
            />
            <input
              value={r.keyword}
              onChange={(e) => update(r.id, { keyword: e.target.value })}
              className="bg-transparent border-b border-transparent focus:border-[var(--border)] px-1 py-0.5 font-mono"
            />
            <span className="text-sm text-slate-500">in {r.matchVeld}</span>
            <span className="text-sm text-slate-500">→</span>
            <select
              value={r.bakjeId}
              onChange={(e) => update(r.id, { bakjeId: e.target.value })}
              className="border border-[var(--border)] rounded px-2 py-1 bg-transparent text-sm"
            >
              {data.bakjes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.naam}
                </option>
              ))}
            </select>
            {!bakjenaamById[r.bakjeId] && (
              <span className="text-xs text-red-600">bakje ontbreekt</span>
            )}
            <label className="text-xs text-slate-500 flex items-center gap-1 ml-auto">
              <input
                type="checkbox"
                checked={r.caseSensitive}
                onChange={(e) => update(r.id, { caseSensitive: e.target.checked })}
              />
              case sensitive
            </label>
            <button
              onClick={() => verwijder(r.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Verwijder
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
