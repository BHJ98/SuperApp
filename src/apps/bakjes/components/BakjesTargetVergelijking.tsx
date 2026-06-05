"use client";
import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { format as formatTz, toZonedTime } from "date-fns-tz";
import type { TargetRapport } from "../lib/bakjes/targets";
import { eventMinuten, formatteerUren } from "../lib/bakjes/percentages";

function formatHours(value: number): string {
  if (value === 0) return "0u";
  const u = Math.floor(value);
  const m = Math.round((value - u) * 60);
  if (m === 0) return `${u}u`;
  if (u === 0) return `${m}m`;
  return `${u}u ${m}m`;
}

/**
 * Grouped bar chart: per bakje two bars side-by-side (target vs. werkelijk),
 * both in hours per week. A small percentage label above each werkelijk-bar
 * shows how close to target the user is (100 = exact, >100 = over, <100 = under).
 *
 * Rijen in de tabel zijn klikbaar: uitklappen toont de events die in de gekozen
 * periode aan dit bakje zijn toegewezen.
 */
export function BakjesTargetVergelijking({
  rapport,
  tijdzone,
}: {
  rapport: TargetRapport;
  tijdzone: string;
}) {
  const [openBakjeId, setOpenBakjeId] = useState<string | null>(null);

  if (rapport.perBakje.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        Nog geen targets ingesteld. Ga naar <a href="/bakjes" className="underline">Bakjes</a> en
        vul per bakje een 'target uren per week' in om de vergelijking te zien.
      </div>
    );
  }

  const chartData = rapport.perBakje.map((entry) => ({
    naam: entry.bakje.naam,
    kleur: entry.bakje.kleur,
    target: Number(entry.targetUrenPerWeek.toFixed(2)),
    werkelijk: Number(entry.werkelijkeUrenPerWeek.toFixed(2)),
    percentage: entry.percentageVanTarget,
  }));

  const maxVal = Math.max(
    ...chartData.map((d) => Math.max(d.target, d.werkelijk)),
    1,
  );

  return (
    <div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 24, right: 16, bottom: 8, left: 0 }}
            barCategoryGap="22%"
          >
            <XAxis
              dataKey="naam"
              tick={{ fontSize: 12 }}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              domain={[0, Math.ceil(maxVal * 1.15)]}
              label={{
                value: "uren/week",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, textAnchor: "middle" },
              }}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const label = name === "target" ? "Target" : "Werkelijk";
                return [formatHours(value), label];
              }}
            />
            <Bar dataKey="target" name="target" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            <Bar dataKey="werkelijk" name="werkelijk" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.kleur} />
              ))}
              <LabelList
                dataKey="percentage"
                position="top"
                formatter={(value: number) => `${Math.round(value)}%`}
                style={{ fontSize: 11, fill: "currentColor" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-1">
        {rapport.perBakje.map((entry) => {
          const pct = entry.percentageVanTarget;
          const delta = entry.werkelijkeUrenPerWeek - entry.targetUrenPerWeek;
          const kleurKlasse =
            pct > 110
              ? "text-red-600 dark:text-red-400"
              : pct < 90
                ? "text-amber-600 dark:text-amber-400"
                : "text-green-600 dark:text-green-400";
          const isOpen = openBakjeId === entry.bakje.id;
          const eventCount = entry.events.length;
          return (
            <div key={entry.bakje.id}>
              <button
                type="button"
                onClick={() => setOpenBakjeId(isOpen ? null : entry.bakje.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 text-sm py-1.5 px-1 rounded hover:bg-slate-50 dark:hover:bg-slate-900/40 text-left"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: entry.bakje.kleur }}
                  aria-hidden
                />
                <span className="text-slate-400 w-3 shrink-0" aria-hidden>
                  {isOpen ? "▾" : "▸"}
                </span>
                <span className="flex-1 truncate">{entry.bakje.naam}</span>
                <span className="tabular-nums text-xs text-slate-500 hidden sm:inline">
                  {eventCount} event{eventCount === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {formatHours(entry.werkelijkeUrenPerWeek)} /{" "}
                  {formatHours(entry.targetUrenPerWeek)}
                </span>
                <span
                  className={`tabular-nums font-medium ${kleurKlasse} min-w-[4rem] text-right`}
                >
                  {Math.round(pct)}%
                </span>
                <span className="tabular-nums text-xs text-slate-500 min-w-[4.5rem] text-right">
                  {delta >= 0 ? "+" : ""}
                  {formatHours(Math.abs(delta))}
                  {delta < 0 ? " tekort" : delta > 0 ? " over" : ""}
                </span>
              </button>
              {isOpen && (
                <EventLijst
                  events={entry.events}
                  tijdzone={tijdzone}
                  kleur={entry.bakje.kleur}
                />
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3 text-sm pt-2 mt-2 border-t border-[var(--border)] font-medium px-1">
          <span className="w-3 h-3 shrink-0" aria-hidden />
          <span className="w-3 shrink-0" aria-hidden />
          <span className="flex-1">Totaal (met target)</span>
          <span className="tabular-nums text-xs text-slate-500 hidden sm:inline">
            {rapport.perBakje.reduce((sum, e) => sum + e.events.length, 0)} events
          </span>
          <span className="tabular-nums">
            {formatHours(rapport.totaalWerkelijkeUrenPerWeek)} /{" "}
            {formatHours(rapport.totaalTargetUrenPerWeek)}
          </span>
          <span className="tabular-nums min-w-[4rem] text-right">
            {rapport.totaalTargetUrenPerWeek > 0
              ? `${Math.round(rapport.totaalPercentage)}%`
              : "—"}
          </span>
          <span className="min-w-[4.5rem]" aria-hidden />
        </div>

        <ExtraTotalen rapport={rapport} />
      </div>
    </div>
  );
}

function ExtraTotalen({ rapport }: { rapport: TargetRapport }) {
  const weken = rapport.aantalWeken;
  const totaalUrenAbs = rapport.totaalMinutenAlleEvents / 60;
  const zonderTargetPW = rapport.totaalMinutenBakjesZonderTarget / 60 / weken;
  const ongecatPW = rapport.totaalMinutenOngecategoriseerd / 60 / weken;
  const hasZonderTarget = rapport.totaalMinutenBakjesZonderTarget > 0;
  const hasOngecat = rapport.totaalMinutenOngecategoriseerd > 0;

  return (
    <div className="mt-3 pt-2 border-t border-[var(--border)] space-y-1 text-xs text-slate-600 dark:text-slate-400">
      <div className="flex items-center gap-3 px-1">
        <span className="flex-1">
          Periode: <strong>{weken.toFixed(2).replace(/\.?0+$/, "")} weken</strong>
          {rapport.overloopUitgesloten && " (overloop uitgesloten)"}
        </span>
        <span className="tabular-nums">
          Totaal werkelijk over periode: <strong>{formatHours(totaalUrenAbs)}</strong>
        </span>
      </div>
      {hasZonderTarget && (
        <div className="flex items-center gap-3 px-1">
          <span className="flex-1 text-amber-700 dark:text-amber-400">
            ⚠ Bakjes zonder target (niet in de vergelijking hierboven)
          </span>
          <span className="tabular-nums">{formatHours(zonderTargetPW)}/week</span>
        </div>
      )}
      {hasOngecat && (
        <div className="flex items-center gap-3 px-1">
          <span className="flex-1 text-amber-700 dark:text-amber-400">
            ⚠ Ongecategoriseerd (niet in de vergelijking hierboven)
          </span>
          <span className="tabular-nums">{formatHours(ongecatPW)}/week</span>
        </div>
      )}
      {(hasZonderTarget || hasOngecat) && (
        <p className="px-1 italic">
          Tip: zet een target op alle bakjes en wijs ongecategoriseerde events toe op{" "}
          <a href="/inventariseren" className="underline">
            Inventariseren
          </a>{" "}
          om het volledige beeld te zien.
        </p>
      )}
    </div>
  );
}

function EventLijst({
  events,
  tijdzone,
  kleur,
}: {
  events: import("../lib/types").AgendaEvent[];
  tijdzone: string;
  kleur: string;
}) {
  if (events.length === 0) {
    return (
      <div className="ml-7 mb-2 mt-1 text-xs text-slate-500">
        Geen events in deze periode aan dit bakje toegewezen.
      </div>
    );
  }
  const sorted = [...events].sort((a, b) => b.start.localeCompare(a.start)); // nieuwste eerst
  return (
    <ul
      className="ml-7 mb-2 mt-1 border-l-2 pl-3 space-y-1"
      style={{ borderColor: kleur }}
    >
      {sorted.map((e) => {
        const dur = eventMinuten(e);
        const startLocal = toZonedTime(new Date(e.start), tijdzone);
        return (
          <li key={e.uid} className="flex items-baseline gap-2 text-xs">
            <span className="text-slate-500 w-32 shrink-0 tabular-nums">
              {formatTz(startLocal, "EEE d MMM HH:mm", { timeZone: tijdzone })}
            </span>
            <span className="flex-1 truncate">{e.titel || "(geen titel)"}</span>
            <span className="text-slate-500 tabular-nums shrink-0">
              {formatteerUren(dur)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
