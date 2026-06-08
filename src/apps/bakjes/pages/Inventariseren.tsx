import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../providers";
import type { AgendaEvent, AppData, Bakje } from "../lib/types";
import { allEvents } from "../lib/storage/events";
import { resolveAssignment } from "../lib/bakjes/assign";
import { suggereerKeyword } from "../lib/bakjes/rules";
import { eventMinuten, formatteerUren } from "../lib/bakjes/percentages";
import { toZonedTime, format as formatTz } from "date-fns-tz";

type Filter = "alles" | "ongecategoriseerd" | string;

export default function InventariserenPage() {
  const { data, mutate } = useAppData();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ongecategoriseerd");
  const [zoekterm, setZoekterm] = useState("");
  const [suggestie, setSuggestie] = useState<{
    event: AgendaEvent;
    bakjeId: string;
    keyword: string;
  } | null>(null);

  useEffect(() => {
    allEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  const rijen = useMemo(() => {
    const decorated = events
      .filter((e) => !e.heelDag)
      .map((e) => ({ event: e, assignment: resolveAssignment(e, data) }));
    const sorted = [...decorated].sort((a, b) => a.event.start.localeCompare(b.event.start));
    const zoek = zoekterm.trim().toLowerCase();
    return sorted.filter((r) => {
      if (filter === "ongecategoriseerd" && r.assignment.bakjeId !== null) return false;
      if (filter !== "alles" && filter !== "ongecategoriseerd" && r.assignment.bakjeId !== filter)
        return false;
      if (zoek && !(r.event.titel || "").toLowerCase().includes(zoek)) return false;
      return true;
    });
  }, [events, data, filter, zoekterm]);

  async function wijsToe(event: AgendaEvent, bakjeId: string) {
    const nu = new Date().toISOString();
    await mutate((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [event.uid]: { bakjeId, handmatig: true, geupdatet: nu },
      },
    }));
    // propose rule if there's a useful keyword and no existing rule matches
    const keyword = suggereerKeyword(event.titel);
    if (keyword.length >= 3 && !regelBestaat(data, keyword, bakjeId)) {
      setSuggestie({ event, bakjeId, keyword });
    }
  }

  async function hefOp(event: AgendaEvent) {
    await mutate((prev) => {
      const next = { ...prev.assignments };
      delete next[event.uid];
      return { ...prev, assignments: next };
    });
  }

  async function regelAanmaken(kw: string, bakjeId: string) {
    await mutate((prev) => ({
      ...prev,
      regels: [
        ...prev.regels,
        {
          id: crypto.randomUUID(),
          keyword: kw,
          bakjeId,
          matchVeld: "titel",
          caseSensitive: false,
          actief: true,
        },
      ],
    }));
    setSuggestie(null);
  }

  if (loading) return <p>Events laden…</p>;
  if (events.length === 0)
    return (
      <div className="card p-5">
        <h1 className="text-xl font-semibold mb-2">Nog geen events</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Upload eerst een ICS-bestand op de{" "}
          <a href="/bakjes/instellingen" className="underline">
            instellingenpagina
          </a>
          .
        </p>
      </div>
    );

  const ongecatCount = events.filter(
    (e) => !e.heelDag && resolveAssignment(e, data).bakjeId === null,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Inventariseren</h1>
        <span className="text-sm text-slate-500">
          {events.filter((e) => !e.heelDag).length} events · {ongecatCount} ongecategoriseerd
        </span>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="search"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          placeholder="Zoek op titel…"
          className="border border-[var(--border)] rounded px-3 py-1.5 bg-transparent text-sm flex-1 min-w-[200px]"
        />
        <label className="text-sm flex items-center gap-2">
          <span className="text-slate-500">Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="border border-[var(--border)] rounded px-2 py-1.5 bg-transparent text-sm"
          >
            <option value="alles">Alle events</option>
            <option value="ongecategoriseerd">Ongecategoriseerd</option>
            {data.bakjes.length > 0 && <option disabled>──────</option>}
            {data.bakjes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.naam}
              </option>
            ))}
          </select>
        </label>
        {(zoekterm || filter !== "ongecategoriseerd") && (
          <button
            type="button"
            onClick={() => {
              setZoekterm("");
              setFilter("ongecategoriseerd");
            }}
            className="text-sm text-slate-500 hover:underline"
          >
            Wissen
          </button>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          {rijen.length} resultaat{rijen.length === 1 ? "" : "en"}
        </span>
      </div>
      {data.bakjes.length === 0 && (
        <div className="card p-4 text-sm">
          Nog geen bakjes — maak er een aan op <a href="/bakjes/bakjes" className="underline">Bakjes</a>.
        </div>
      )}
      <div className="space-y-2">
        {rijen.slice(0, 200).map(({ event, assignment }) => (
          <EventRij
            key={event.uid}
            event={event}
            bakjes={data.bakjes}
            huidig={assignment.bakjeId}
            bron={assignment.bron}
            tijdzone={data.instellingen.tijdzone}
            onKies={(id) => wijsToe(event, id)}
            onHefOp={() => hefOp(event)}
          />
        ))}
      </div>
      {rijen.length > 200 && (
        <p className="text-xs text-slate-500">
          Eerste 200 van {rijen.length} getoond — filter of categoriseer om er doorheen te komen.
        </p>
      )}
      {suggestie && (
        <RegelSuggestie
          event={suggestie.event}
          keyword={suggestie.keyword}
          bakje={data.bakjes.find((b) => b.id === suggestie.bakjeId)!}
          onAccepteer={(kw) => regelAanmaken(kw, suggestie.bakjeId)}
          onAnnuleer={() => setSuggestie(null)}
        />
      )}
    </div>
  );
}

function regelBestaat(data: AppData, keyword: string, bakjeId: string): boolean {
  return data.regels.some(
    (r) =>
      r.actief &&
      r.bakjeId === bakjeId &&
      r.keyword.toLowerCase() === keyword.toLowerCase(),
  );
}

function EventRij({
  event,
  bakjes,
  huidig,
  bron,
  tijdzone,
  onKies,
  onHefOp,
}: {
  event: AgendaEvent;
  bakjes: Bakje[];
  huidig: string | null;
  bron: "handmatig" | "regel" | "geen";
  tijdzone: string;
  onKies: (bakjeId: string) => void;
  onHefOp: () => void;
}) {
  const start = toZonedTime(new Date(event.start), tijdzone);
  const eind = toZonedTime(new Date(event.eind), tijdzone);
  const label = formatTz(start, "EEE d MMM HH:mm", { timeZone: tijdzone });
  const tot = formatTz(eind, "HH:mm", { timeZone: tijdzone });
  const bakje = bakjes.find((b) => b.id === huidig);

  return (
    <div className="card p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <div className="font-medium">{event.titel || "(geen titel)"}</div>
        <div className="text-xs text-slate-500">
          {label}–{tot} · {formatteerUren(eventMinuten(event))}
        </div>
      </div>
      {bakje && (
        <span
          className="text-xs px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: bakje.kleur }}
          title={bron === "handmatig" ? "Handmatig toegewezen" : "Via regel"}
        >
          {bakje.naam} {bron === "regel" && "· regel"}
        </span>
      )}
      <select
        value={huidig ?? ""}
        onChange={(e) => (e.target.value ? onKies(e.target.value) : onHefOp())}
        className="border border-[var(--border)] rounded px-2 py-1 bg-transparent text-sm"
      >
        <option value="">— kies bakje —</option>
        {bakjes.map((b) => (
          <option key={b.id} value={b.id}>
            {b.naam}
          </option>
        ))}
      </select>
    </div>
  );
}

function RegelSuggestie({
  event,
  keyword,
  bakje,
  onAccepteer,
  onAnnuleer,
}: {
  event: AgendaEvent;
  keyword: string;
  bakje: Bakje;
  onAccepteer: (keyword: string) => void;
  onAnnuleer: () => void;
}) {
  const [kw, setKw] = useState(keyword);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onAnnuleer}
    >
      <div className="card p-5 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Regel maken?</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Wil je voortaan álle events waarvan de titel "{kw}" bevat automatisch toewijzen aan{" "}
          <b style={{ color: bakje.kleur }}>{bakje.naam}</b>?
        </p>
        <p className="text-xs text-slate-500">
          (Voorstel op basis van "{event.titel}". Je kunt het trefwoord aanpassen of de regel
          later bewerken bij <em>Regels</em>.)
        </p>
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          className="w-full border border-[var(--border)] rounded px-2 py-1 bg-transparent"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onAnnuleer}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-sm"
          >
            Alleen dit event
          </button>
          <button
            onClick={() => kw.trim() && onAccepteer(kw.trim())}
            className="px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm"
          >
            Ja, regel maken
          </button>
        </div>
      </div>
    </div>
  );
}
