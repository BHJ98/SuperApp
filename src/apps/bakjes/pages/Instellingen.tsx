import { useState } from "react";
import { useAppData } from "../providers";
import { parseIcs } from "../lib/ical/parse";
import { expandEvents } from "../lib/ical/expand";
import { saveEvents, clearEvents, allEvents } from "../lib/storage/events";
import {
  backupAlsJson,
  backupBestandsnaam,
  leesBackupJson,
  samenvatBackup,
} from "../lib/storage/backup";

export default function InstellingenPage() {
  const { data, ready, mutate, replaceAll, syncStatus } = useAppData();
  const [status, setStatus] = useState<string>("");
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function ontvangIcs(file: File) {
    try {
      setBusy(true);
      setStatus(`Bezig met inlezen van ${file.name}…`);
      const text = await file.text();
      const raw = parseIcs(text);
      const now = Date.now();
      const start = new Date(now - 26 * 7 * 24 * 3600 * 1000);
      const end = new Date(now + 4 * 7 * 24 * 3600 * 1000);
      const events = expandEvents(raw, start, end);
      await saveEvents(events, true);
      setEventCount(events.length);
      setStatus(`${events.length} events geïmporteerd over de afgelopen 26 + volgende 4 weken.`);
    } catch (err) {
      setStatus(`Import mislukt: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function telEvents() {
    const all = await allEvents();
    setEventCount(all.length);
  }

  async function wisEvents() {
    if (!confirm("Weet je zeker dat je alle geïmporteerde events wilt wissen?")) return;
    await clearEvents();
    setEventCount(0);
    setStatus("Alle events gewist.");
  }

  async function werkurenOpslaan(start: string, eind: string) {
    await mutate((prev) => ({
      ...prev,
      instellingen: { ...prev.instellingen, werkurenStart: start, werkurenEind: eind },
    }));
    setStatus(`Werkuren opgeslagen: ${start}–${eind}.`);
  }

  function exporteerBackup() {
    const json = backupAlsJson(data);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupBestandsnaam();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    const s = samenvatBackup(data);
    setStatus(
      `Backup gedownload: ${s.bakjes} bakjes · ${s.regels} regels · ${s.assignments} toewijzingen · ${s.reflecties} reflecties · ${s.intakes} intakes.`,
    );
  }

  async function importeerBackup(file: File) {
    try {
      setBusy(true);
      const text = await file.text();
      const nieuw = leesBackupJson(text);
      const s = samenvatBackup(nieuw);
      const huidige = samenvatBackup(data);
      const bevestiging = confirm(
        `Backup laden uit '${file.name}'?\n\n` +
          `Nieuw: ${s.bakjes} bakjes · ${s.regels} regels · ${s.assignments} toewijzingen · ${s.reflecties} reflecties · ${s.intakes} intakes\n` +
          `Huidig: ${huidige.bakjes} bakjes · ${huidige.regels} regels · ${huidige.assignments} toewijzingen · ${huidige.reflecties} reflecties · ${huidige.intakes} intakes\n\n` +
          `Dit overschrijft je huidige data op de server.`,
      );
      if (!bevestiging) {
        setStatus("Import geannuleerd.");
        return;
      }
      await replaceAll(nieuw);
      setStatus(
        `Backup geladen: ${s.bakjes} bakjes · ${s.regels} regels · ${s.assignments} toewijzingen.`,
      );
    } catch (err) {
      setStatus(`Import mislukt: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Instellingen</h1>

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-medium">Synchronisatie</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Je bakjes-data wordt automatisch opgeslagen in SuperApp's gedeelde Supabase
          project. Wijzigingen worden binnen 1 seconde gesynchroniseerd. Geen aparte
          inlog of Drive-koppeling nodig.
        </p>
        <p className="text-xs text-slate-500">
          Sync-status: <strong>{syncStatus}</strong>
        </p>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-medium">Backup &amp; herstel</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Download een JSON-bestand met al je bakjes, regels, targets, toewijzingen,
          reflecties, intakes en instellingen. Upload een eerder backup-bestand
          (bijvoorbeeld vanuit de oude Bakjesmethode-app) om alles terug te zetten.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={exporteerBackup}
            disabled={!ready}
            className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm disabled:opacity-60"
          >
            Download backup (JSON)
          </button>
          <label
            className={`px-3 py-1.5 rounded border border-[var(--border)] text-sm cursor-pointer ${
              busy ? "opacity-60" : "hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Upload backup…
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importeerBackup(f);
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>
          <span className="text-xs text-slate-500">
            Huidig: {data.bakjes.length} bakjes · {data.regels.length} regels ·{" "}
            {Object.keys(data.assignments).length} toewijzingen
          </span>
        </div>
        <p className="text-xs text-slate-500">
          ⚠ Bij upload wordt je huidige data overschreven. Maak eerst een backup van je
          huidige situatie als je niet zeker bent.
        </p>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-medium">Werkuren</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Events binnen deze uren tellen als 'echt werk'. Events die buiten dit venster
          (deels) plaatsvinden worden gemarkeerd als 'overloop' — ze tellen wel mee in
          percentages, maar zijn zichtbaar als signaal.
        </p>
        <WerkurenForm
          start={data.instellingen.werkurenStart}
          eind={data.instellingen.werkurenEind}
          onOpslaan={werkurenOpslaan}
          disabled={!ready}
        />
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-medium">Agenda importeren (ICS)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Exporteer je Google Calendar als .ics en upload het hier. Events worden lokaal
          opgeslagen op dit apparaat; elke upload vervangt de hele voorraad. Periodieke
          re-import houdt je dashboard up-to-date.
        </p>
        <input
          type="file"
          accept=".ics,text/calendar"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) ontvangIcs(f);
            e.target.value = "";
          }}
          className="block text-sm"
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={telEvents}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
          >
            Aantal events tellen
          </button>
          <button
            onClick={wisEvents}
            className="px-3 py-1.5 rounded border border-red-300 text-red-700 text-sm"
          >
            Events wissen
          </button>
          {eventCount !== null && (
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {eventCount} events opgeslagen
            </span>
          )}
        </div>
      </section>

      {status && (
        <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded px-3 py-2">
          {status}
        </p>
      )}
    </div>
  );
}

function WerkurenForm({
  start,
  eind,
  onOpslaan,
  disabled,
}: {
  start: string;
  eind: string;
  onOpslaan: (start: string, eind: string) => void;
  disabled?: boolean;
}) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(eind);
  return (
    <form
      className="flex gap-3 items-end flex-wrap"
      onSubmit={(ev) => {
        ev.preventDefault();
        onOpslaan(s, e);
      }}
    >
      <label className="text-sm flex flex-col">
        Start
        <input
          type="time"
          value={s}
          onChange={(ev) => setS(ev.target.value)}
          className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
        />
      </label>
      <label className="text-sm flex flex-col">
        Einde
        <input
          type="time"
          value={e}
          onChange={(ev) => setE(ev.target.value)}
          className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
        />
      </label>
      <button
        type="submit"
        disabled={disabled}
        className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm disabled:opacity-60"
      >
        Opslaan
      </button>
    </form>
  );
}
