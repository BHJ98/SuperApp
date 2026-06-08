import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../providers";
import type { AgendaEvent } from "../lib/types";
import { eventsInRange } from "../lib/storage/events";
import { currentWeekWindow, shiftWeek, formatDateRange } from "../lib/ical/week";
import { percentagesBerekenen, formatteerUren } from "../lib/bakjes/percentages";
import { targetVergelijkingBerekenen } from "../lib/bakjes/targets";
import { resolveAssignment } from "../lib/bakjes/assign";
import { BakjesDonut } from "../components/BakjesDonut";
import { BakjesTargetVergelijking } from "../components/BakjesTargetVergelijking";
import { toZonedTime, format as formatTz } from "date-fns-tz";

const PERIODE_OPTIES = [
  { weken: 1, label: "1 week" },
  { weken: 4, label: "4 weken" },
  { weken: 8, label: "8 weken" },
  { weken: 12, label: "12 weken" },
  { weken: 26, label: "26 weken" },
] as const;

type PeriodeModus = "preset" | "aangepast";

function dateInputValue(d: Date): string {
  // YYYY-MM-DD voor <input type="date">
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dag}`;
}

function parseDateInput(value: string, endOfDay: boolean): Date {
  // Lokale datum (geen tijdzone-shift). Eind = einde van die dag.
  const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
}

export default function Dashboard() {
  const { data, ready } = useAppData();
  const [window, setWindow] = useState(() =>
    currentWeekWindow(data.instellingen.tijdzone),
  );
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [periodeWeken, setPeriodeWeken] = useState<number>(4);
  const [periodeModus, setPeriodeModus] = useState<PeriodeModus>("preset");
  const [aangepastStart, setAangepastStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return dateInputValue(d);
  });
  const [aangepastEind, setAangepastEind] = useState<string>(() => dateInputValue(new Date()));
  const [periodeEvents, setPeriodeEvents] = useState<AgendaEvent[]>([]);
  const [sluitOverloopUit, setSluitOverloopUit] = useState(false);
  const [sluitOverloopUitWeek, setSluitOverloopUitWeek] = useState(false);
  const [openWeekBakjeId, setOpenWeekBakjeId] = useState<string | null>(null);

  // Compute effective period [start, end] + aantalWeken op basis van modus.
  const periodeRange = useMemo(() => {
    if (periodeModus === "aangepast") {
      const start = parseDateInput(aangepastStart, false);
      const eind = parseDateInput(aangepastEind, true);
      const ms = Math.max(1, eind.getTime() - start.getTime());
      const weken = ms / (7 * 24 * 3600 * 1000);
      return { start, eind, weken };
    }
    // Preset: eindigt op nu (niet op zondag), zodat partiële weken niet de gemiddeldes verdunnen.
    const eind = new Date();
    const start = new Date(eind.getTime() - periodeWeken * 7 * 24 * 3600 * 1000);
    return { start, eind, weken: periodeWeken };
  }, [periodeModus, periodeWeken, aangepastStart, aangepastEind]);

  // Recompute window when timezone changes
  useEffect(() => {
    setWindow(currentWeekWindow(data.instellingen.tijdzone));
  }, [data.instellingen.tijdzone]);

  useEffect(() => {
    eventsInRange(window.start.toISOString(), window.end.toISOString()).then(setEvents);
  }, [window]);

  useEffect(() => {
    eventsInRange(periodeRange.start.toISOString(), periodeRange.eind.toISOString()).then(
      setPeriodeEvents,
    );
  }, [periodeRange]);

  const targetRapport = useMemo(
    () =>
      targetVergelijkingBerekenen(periodeEvents, data, periodeRange.weken, {
        sluitOverloopUit,
      }),
    [periodeEvents, data, periodeRange.weken, sluitOverloopUit],
  );

  const heeftTargets = data.bakjes.some((b) => b.targetUrenPerWeek != null);

  const report = useMemo(
    () =>
      percentagesBerekenen(events, data, { sluitOverloopUit: sluitOverloopUitWeek }),
    [events, data, sluitOverloopUitWeek],
  );
  const overloopEvents = useMemo(
    () =>
      events
        .filter((e) => !e.heelDag)
        .map((e) => ({
          event: e,
          assignment: resolveAssignment(e, data),
          startLocal: toZonedTime(new Date(e.start), data.instellingen.tijdzone),
        }))
        .filter(({ startLocal }) => {
          const minOfDay = startLocal.getHours() * 60 + startLocal.getMinutes();
          const [sH, sM] = data.instellingen.werkurenStart.split(":").map(Number);
          const [eH, eM] = data.instellingen.werkurenEind.split(":").map(Number);
          const start = sH * 60 + sM;
          const eind = eH * 60 + eM;
          return minOfDay < start || minOfDay >= eind;
        })
        .sort((a, b) => a.event.start.localeCompare(b.event.start)),
    [events, data],
  );

  const hasEvents = events.length > 0;
  const hasBakjes = data.bakjes.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Week {formatDateRange(window, data.instellingen.tijdzone)}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setWindow((w) => shiftWeek(w, -1, data.instellingen.tijdzone))}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
            aria-label="Vorige week"
          >
            ← Vorige
          </button>
          <button
            onClick={() => setWindow(currentWeekWindow(data.instellingen.tijdzone))}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
          >
            Vandaag
          </button>
          <button
            onClick={() => setWindow((w) => shiftWeek(w, 1, data.instellingen.tijdzone))}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
            aria-label="Volgende week"
          >
            Volgende →
          </button>
        </div>
      </header>

      {!ready && (
        <div className="card p-4 text-sm text-slate-500">Laden…</div>
      )}

      {!hasEvents && (
        <div className="card p-5 space-y-2">
          <h2 className="text-lg font-medium">Nog geen events in deze week</h2>
          <p className="text-sm text-slate-500">
            Exporteer je Google Calendar als ICS en upload het bestand in{" "}
            <a href="/bakjes/instellingen" className="underline">
              Instellingen
            </a>
            . Daarna kun je beginnen met{" "}
            <a href="/bakjes/inventariseren" className="underline">
              Inventariseren
            </a>
            .
          </p>
        </div>
      )}

      {hasEvents && !hasBakjes && (
        <div className="card p-5 text-sm">
          Events zijn ingeladen. Maak nu je eerste bakjes aan op{" "}
          <a href="/bakjes/bakjes" className="underline">
            Bakjes
          </a>{" "}
          (of direct in{" "}
          <a href="/bakjes/inventariseren" className="underline">
            Inventariseren
          </a>
          ).
        </div>
      )}

      {hasEvents && (
        <section className="grid md:grid-cols-[1fr_1.2fr] gap-6">
          <div className="card p-5">
            <BakjesDonut report={report} />
            <div className="mt-3 text-center text-sm text-slate-500">
              Totaal {formatteerUren(report.totaalMinuten)}
              {report.totaalMinutenOverloop > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-600">
                    {formatteerUren(report.totaalMinutenOverloop)} overloop
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-medium">Per bakje</h2>
              <label className="text-sm inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sluitOverloopUitWeek}
                  onChange={(e) => setSluitOverloopUitWeek(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                <span>Overloop uitsluiten</span>
              </label>
            </div>
            <ul className="space-y-1">
              {report.perBakje.map((b) => {
                const isOpen = openWeekBakjeId === b.bakje.id;
                return (
                  <li key={b.bakje.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenWeekBakjeId(isOpen ? null : b.bakje.id)
                      }
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 py-1.5 px-1 rounded hover:bg-slate-50 dark:hover:bg-slate-900/40 text-left"
                    >
                      <span
                        className="w-3 h-3 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: b.bakje.kleur }}
                        aria-hidden
                      />
                      <span className="text-slate-400 w-3 shrink-0" aria-hidden>
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="font-medium flex-1 truncate">{b.bakje.naam}</span>
                      <span className="text-xs text-slate-500 hidden sm:inline tabular-nums">
                        {b.events.length} event{b.events.length === 1 ? "" : "s"}
                      </span>
                      <span className="text-sm tabular-nums">
                        {b.percentage.toFixed(0)}% · {formatteerUren(b.minuten)}
                      </span>
                      {!sluitOverloopUitWeek && b.minutenOverloop > 0 && (
                        <span
                          className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                          title="Aantal minuten buiten werkuren"
                        >
                          +{formatteerUren(b.minutenOverloop)} overloop
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <WeekEventLijst
                        events={b.events}
                        tijdzone={data.instellingen.tijdzone}
                        kleur={b.bakje.kleur}
                      />
                    )}
                  </li>
                );
              })}
              {report.ongecategoriseerd.minuten > 0 && (
                <li className="flex items-center gap-3 pt-2 mt-1 border-t border-[var(--border)] px-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-slate-400" aria-hidden />
                  <span className="w-3 shrink-0" aria-hidden />
                  <span className="flex-1 text-slate-600 dark:text-slate-400">
                    Ongecategoriseerd
                  </span>
                  <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                    {formatteerUren(report.ongecategoriseerd.minuten)}
                  </span>
                  <a href="/bakjes/inventariseren" className="text-xs underline">
                    toewijzen
                  </a>
                </li>
              )}
              <li className="flex items-center gap-3 pt-2 mt-1 border-t border-[var(--border)] px-1 font-medium">
                <span className="w-3 h-3 shrink-0" aria-hidden />
                <span className="w-3 shrink-0" aria-hidden />
                <span className="flex-1">Totaal</span>
                <span className="text-xs text-slate-500 hidden sm:inline tabular-nums">
                  {report.perBakje.reduce((sum, b) => sum + b.events.length, 0) +
                    report.ongecategoriseerd.events.length}{" "}
                  events
                </span>
                <span className="text-sm tabular-nums">
                  {formatteerUren(report.totaalMinuten)}
                </span>
              </li>
            </ul>
          </div>
        </section>
      )}

      {hasBakjes && (
        <section className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-medium">Target vs. werkelijk</h2>
              <p className="text-sm text-slate-500">
                Gemiddeld per week over de gekozen periode. 100% = precies op target.
              </p>
            </div>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="text-sm inline-flex rounded border border-[var(--border)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPeriodeModus("preset")}
                  className={`px-3 py-1 ${
                    periodeModus === "preset"
                      ? "bg-[var(--accent)] text-white"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Vast
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeModus("aangepast")}
                  className={`px-3 py-1 ${
                    periodeModus === "aangepast"
                      ? "bg-[var(--accent)] text-white"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  Aangepast
                </button>
              </div>
              {periodeModus === "preset" ? (
                <label className="text-sm flex flex-col">
                  Periode
                  <select
                    value={periodeWeken}
                    onChange={(e) => setPeriodeWeken(Number(e.target.value))}
                    className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
                  >
                    {PERIODE_OPTIES.map((opt) => (
                      <option key={opt.weken} value={opt.weken}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="text-sm flex flex-col">
                    Van
                    <input
                      type="date"
                      value={aangepastStart}
                      max={aangepastEind}
                      onChange={(e) => setAangepastStart(e.target.value)}
                      className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
                    />
                  </label>
                  <label className="text-sm flex flex-col">
                    T/m
                    <input
                      type="date"
                      value={aangepastEind}
                      min={aangepastStart}
                      onChange={(e) => setAangepastEind(e.target.value)}
                      className="mt-1 border border-[var(--border)] rounded px-2 py-1 bg-transparent"
                    />
                  </label>
                </>
              )}
              <label className="text-sm inline-flex items-center gap-2 pb-1.5">
                <input
                  type="checkbox"
                  checked={sluitOverloopUit}
                  onChange={(e) => setSluitOverloopUit(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
                <span>Overloop uitsluiten</span>
              </label>
            </div>
          </div>

          {!heeftTargets ? (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Nog geen targets ingesteld. Ga naar{" "}
              <a href="/bakjes/bakjes" className="underline">
                Bakjes
              </a>{" "}
              en vul per bakje een 'target uren per week' in.
            </div>
          ) : periodeEvents.length === 0 ? (
            <div className="text-sm text-slate-500">
              Geen events in deze periode.
            </div>
          ) : (
            <BakjesTargetVergelijking
              rapport={targetRapport}
              tijdzone={data.instellingen.tijdzone}
            />
          )}
        </section>
      )}

      {hasEvents && overloopEvents.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-medium mb-3">
            Overloop-events ({overloopEvents.length})
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            Events die (deels) buiten {data.instellingen.werkurenStart}–
            {data.instellingen.werkurenEind} vallen. Signaal van werkdruk buiten kantooruren.
          </p>
          <ul className="space-y-1 text-sm">
            {overloopEvents.slice(0, 20).map(({ event, assignment, startLocal }) => {
              const bakje = data.bakjes.find((b) => b.id === assignment.bakjeId);
              return (
                <li key={event.uid} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-28 shrink-0">
                    {formatTz(startLocal, "EEE d MMM HH:mm", {
                      timeZone: data.instellingen.tijdzone,
                    })}
                  </span>
                  <span className="flex-1">{event.titel || "(geen titel)"}</span>
                  {bakje && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: bakje.kleur }}
                    >
                      {bakje.naam}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {overloopEvents.length > 20 && (
            <p className="text-xs text-slate-500 mt-2">
              …en {overloopEvents.length - 20} meer.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function WeekEventLijst({
  events,
  tijdzone,
  kleur,
}: {
  events: AgendaEvent[];
  tijdzone: string;
  kleur: string;
}) {
  if (events.length === 0) {
    return (
      <div className="ml-7 my-1 text-xs text-slate-500">
        Geen events deze week aan dit bakje toegewezen.
      </div>
    );
  }
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <ul
      className="ml-7 mb-2 mt-1 border-l-2 pl-3 space-y-1"
      style={{ borderColor: kleur }}
    >
      {sorted.map((e) => {
        const start = new Date(e.start).getTime();
        const end = new Date(e.eind).getTime();
        const minuten = Math.max(0, Math.round((end - start) / 60000));
        const startLocal = toZonedTime(new Date(e.start), tijdzone);
        return (
          <li key={e.uid} className="flex items-baseline gap-2 text-xs">
            <span className="text-slate-500 w-32 shrink-0 tabular-nums">
              {formatTz(startLocal, "EEE d MMM HH:mm", { timeZone: tijdzone })}
            </span>
            <span className="flex-1 truncate">{e.titel || "(geen titel)"}</span>
            <span className="text-slate-500 tabular-nums shrink-0">
              {formatteerUren(minuten)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
