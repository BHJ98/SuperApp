import { useState } from "react";
import { useAppData } from "../providers";
import type { Bakje } from "../lib/types";
import { BAKJE_KLEUREN } from "../lib/types";
import {
  bakjesAlsCsv,
  downloadBestand,
  vandaagAlsDatumString,
} from "../lib/bakjes/export";

function nieuwId(): string {
  return crypto.randomUUID();
}

export default function BakjesPage() {
  const { data, ready, mutate } = useAppData();
  const [naam, setNaam] = useState("");
  const [kleur, setKleur] = useState<string>(BAKJE_KLEUREN[0]);
  const tePlaatsen = 6 - data.bakjes.length;

  async function toevoegen(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = naam.trim();
    if (!trimmed) return;
    const id = nieuwId();
    await mutate((prev) => ({
      ...prev,
      bakjes: [...prev.bakjes, { id, naam: trimmed, kleur, succesBeschrijving: "" }],
    }));
    setNaam("");
    const nextKleur = BAKJE_KLEUREN[(data.bakjes.length + 1) % BAKJE_KLEUREN.length];
    setKleur(nextKleur);
  }

  async function hernoem(bakje: Bakje, nieuweNaam: string) {
    await mutate((prev) => ({
      ...prev,
      bakjes: prev.bakjes.map((b) => (b.id === bakje.id ? { ...b, naam: nieuweNaam } : b)),
    }));
  }

  async function zetKleur(bakje: Bakje, nieuweKleur: string) {
    await mutate((prev) => ({
      ...prev,
      bakjes: prev.bakjes.map((b) => (b.id === bakje.id ? { ...b, kleur: nieuweKleur } : b)),
    }));
  }

  async function zetSucces(bakje: Bakje, tekst: string) {
    await mutate((prev) => ({
      ...prev,
      bakjes: prev.bakjes.map((b) =>
        b.id === bakje.id ? { ...b, succesBeschrijving: tekst } : b,
      ),
    }));
  }

  async function zetTarget(bakje: Bakje, uren: number | undefined) {
    await mutate((prev) => ({
      ...prev,
      bakjes: prev.bakjes.map((b) =>
        b.id === bakje.id ? { ...b, targetUrenPerWeek: uren } : b,
      ),
    }));
  }

  function exportCsv() {
    const csv = bakjesAlsCsv(data.bakjes);
    downloadBestand(csv, `bakjes-${vandaagAlsDatumString()}.csv`, "text/csv");
  }

  function exportPdf() {
    // Browser "Opslaan als PDF" via print-dialog; print-CSS verzorgt de opmaak.
    window.print();
  }

  async function verwijder(bakje: Bakje) {
    if (!confirm(`'${bakje.naam}' verwijderen? Bijbehorende regels/toewijzingen verdwijnen ook.`)) return;
    await mutate((prev) => {
      const newAssignments = { ...prev.assignments };
      for (const uid of Object.keys(newAssignments)) {
        if (newAssignments[uid].bakjeId === bakje.id) delete newAssignments[uid];
      }
      return {
        ...prev,
        bakjes: prev.bakjes.filter((b) => b.id !== bakje.id),
        regels: prev.regels.filter((r) => r.bakjeId !== bakje.id),
        assignments: newAssignments,
      };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Bakjes</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Grootenboer adviseert 4–6 bakjes. Meer dan 6 is een signaal dat je functie te
            versnipperd is.{" "}
            {tePlaatsen >= 0 ? (
              <span>Nog ruimte voor {tePlaatsen} bakje(s).</span>
            ) : (
              <span className="text-orange-600">Je hebt meer dan 6 bakjes — alarmsignaal.</span>
            )}
          </p>
        </div>
        {data.bakjes.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
            >
              Exporteer CSV
            </button>
            <button
              onClick={exportPdf}
              className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
            >
              Exporteer PDF
            </button>
          </div>
        )}
      </div>

      <PrintHeader aantal={data.bakjes.length} />

      <section className="card p-5 print:hidden">
        <h2 className="text-lg font-medium mb-3">Nieuw bakje</h2>
        <form className="flex gap-2 items-end flex-wrap" onSubmit={toevoegen}>
          <label className="text-sm flex flex-col flex-1 min-w-[180px]">
            Naam
            <input
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              placeholder="bijv. Overleg, Uitvoerend werk"
              className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
            />
          </label>
          <label className="text-sm flex flex-col">
            Kleur
            <div className="mt-1 flex gap-1 flex-wrap">
              {BAKJE_KLEUREN.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKleur(k)}
                  className={`w-7 h-7 rounded-full border-2 ${
                    kleur === k ? "border-slate-900 dark:border-white" : "border-transparent"
                  }`}
                  style={{ backgroundColor: k }}
                  aria-label={k}
                />
              ))}
            </div>
          </label>
          <button
            type="submit"
            disabled={!ready}
            className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm disabled:opacity-60"
          >
            Toevoegen
          </button>
        </form>
      </section>

      <section className="space-y-3 print:hidden">
        {data.bakjes.length === 0 && (
          <div className="card p-5 text-sm text-slate-600 dark:text-slate-400">
            Nog geen bakjes. Maak hierboven je eerste bakje aan, of ga naar{" "}
            <a href="/bakjes/inventariseren" className="underline">
              Inventariseren
            </a>{" "}
            en maak ze aan tijdens het toewijzen.
          </div>
        )}
        {data.bakjes.map((b) => (
          <BakjeRij
            key={b.id}
            bakje={b}
            onHernoem={(n) => hernoem(b, n)}
            onKleur={(k) => zetKleur(b, k)}
            onSucces={(t) => zetSucces(b, t)}
            onTarget={(u) => zetTarget(b, u)}
            onVerwijder={() => verwijder(b)}
          />
        ))}
      </section>

      <PrintView bakjes={data.bakjes} />
    </div>
  );
}

function PrintHeader({ aantal }: { aantal: number }) {
  const datum = new Date().toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="hidden print:block mb-4">
      <h1 className="text-2xl font-semibold">Bakjes</h1>
      <p className="text-sm text-slate-600">
        {aantal} bakje{aantal === 1 ? "" : "s"} · geprint op {datum}
      </p>
    </div>
  );
}

function PrintView({ bakjes }: { bakjes: Bakje[] }) {
  if (bakjes.length === 0) return null;
  return (
    <section className="hidden print:block space-y-4">
      {bakjes.map((b) => (
        <div
          key={b.id}
          className="border border-slate-300 rounded p-4 break-inside-avoid"
        >
          <div className="flex items-center gap-3 mb-2">
            <span
              className="w-5 h-5 rounded-full inline-block border border-slate-300"
              style={{ backgroundColor: b.kleur }}
              aria-hidden
            />
            <h2 className="text-lg font-semibold">{b.naam}</h2>
            {b.targetUrenPerWeek != null && (
              <span className="ml-auto text-sm text-slate-700">
                Target: {b.targetUrenPerWeek} uur/week
              </span>
            )}
          </div>
          <div className="text-sm">
            <div className="font-medium mb-0.5">Succes-beschrijving</div>
            {b.succesBeschrijving ? (
              <p className="whitespace-pre-wrap">{b.succesBeschrijving}</p>
            ) : (
              <p className="text-slate-500 italic">(nog niet ingevuld)</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function BakjeRij({
  bakje,
  onHernoem,
  onKleur,
  onSucces,
  onTarget,
  onVerwijder,
}: {
  bakje: Bakje;
  onHernoem: (n: string) => void;
  onKleur: (k: string) => void;
  onSucces: (t: string) => void;
  onTarget: (u: number | undefined) => void;
  onVerwijder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [naam, setNaam] = useState(bakje.naam);
  const [succes, setSucces] = useState(bakje.succesBeschrijving);
  const [target, setTarget] = useState<string>(
    bakje.targetUrenPerWeek != null ? String(bakje.targetUrenPerWeek) : "",
  );

  function commitTarget() {
    const trimmed = target.trim();
    if (trimmed === "") {
      if (bakje.targetUrenPerWeek != null) onTarget(undefined);
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (parsed !== bakje.targetUrenPerWeek) onTarget(parsed);
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="w-5 h-5 rounded-full inline-block"
          style={{ backgroundColor: bakje.kleur }}
          aria-hidden
        />
        <input
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
          onBlur={() => naam.trim() && naam !== bakje.naam && onHernoem(naam.trim())}
          className="flex-1 min-w-[160px] bg-transparent font-medium text-base focus:outline-none border-b border-transparent focus:border-[var(--border)]"
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm text-slate-600 dark:text-slate-400 underline"
        >
          {open ? "Minder" : "Meer"}
        </button>
        <button
          onClick={onVerwijder}
          className="text-sm text-red-600 hover:underline"
          aria-label={`Bakje ${bakje.naam} verwijderen`}
        >
          Verwijder
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <label className="text-sm flex flex-col">
            Kleur
            <div className="mt-1 flex gap-1 flex-wrap">
              {BAKJE_KLEUREN.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => onKleur(k)}
                  className={`w-7 h-7 rounded-full border-2 ${
                    bakje.kleur === k
                      ? "border-slate-900 dark:border-white"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: k }}
                />
              ))}
            </div>
          </label>
          <label className="text-sm flex flex-col max-w-xs">
            Target uren per week
            <input
              type="number"
              min={0}
              step={0.5}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={commitTarget}
              placeholder="bijv. 8"
              className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
            />
            <span className="text-xs text-slate-500 mt-1">
              Ideaalwaarde. Leeg laten om geen target te zetten. Dashboard toont werkelijk vs.
              target.
            </span>
          </label>
          <label className="text-sm flex flex-col">
            Wanneer is dit bakje een succes? (stap 4)
            <textarea
              value={succes}
              onChange={(e) => setSucces(e.target.value)}
              onBlur={() => succes !== bakje.succesBeschrijving && onSucces(succes)}
              rows={3}
              placeholder="Beschrijf in eigen woorden wat succes betekent voor dit bakje."
              className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
            />
          </label>
        </div>
      )}
    </div>
  );
}
