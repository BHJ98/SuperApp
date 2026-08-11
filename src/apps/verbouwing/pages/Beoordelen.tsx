import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { useBankSyncRefresh } from "@/lib/bankAutoSync";
import { useToast } from "@/lib/toast";
import type { InboxTransaction, Room } from "../types";
import {
  dismissTransactions,
  fetchInboxPage,
  listDismissedTransactions,
  listExcludedTransactionIds,
  listRooms,
  subscribeVerbouwing,
  undismissTransactions,
} from "../lib/data";
import { formatCurrency, formatDate } from "../lib/format";
import { useDebouncedCallback } from "../lib/useDebouncedCallback";
import ExpenseDrawer, { type DrawerPrefill } from "../components/ExpenseDrawer";

type View = "open" | "dismissed";

// De inbox: alle uitgaande banktransacties die nog niet beoordeeld zijn.
// Geladen als één doorlopende lijst met "Meer laden" (cursor over de
// server-rijen) — zie fetchInboxPage in lib/data.ts voor de aanpak.

export default function Beoordelen() {
  const { toast } = useToast();

  const [view, setView] = useState<View>("open");

  const [rows, setRows] = useState<InboxTransaction[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // "Niet relevant"-lijst
  const [dismissedRows, setDismissedRows] = useState<InboxTransaction[]>([]);
  const [dismissedLoading, setDismissedLoading] = useState(false);

  // Selectie (met shift-bereik, zelfde interactie als Finance Transactions)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedIndex = useRef<number>(-1);

  // Drawer
  const [drawerPrefill, setDrawerPrefill] = useState<DrawerPrefill | null>(null);

  const excludedRef = useRef<Set<string>>(new Set());
  const serverOffsetRef = useRef(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadFirstPage = useCallback(async (search: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const [excluded, roomList] = await Promise.all([
        listExcludedTransactionIds(),
        listRooms(),
      ]);
      if (seq !== requestSeq.current) return;
      excludedRef.current = excluded;
      setRooms(roomList);
      const page = await fetchInboxPage({ search, serverOffset: 0, excluded });
      if (seq !== requestSeq.current) return;
      serverOffsetRef.current = page.nextServerOffset;
      setRows(page.rows);
      setHasMore(page.hasMore);
      setSelectedIds(new Set());
      lastSelectedIndex.current = -1;
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : "Kon transacties niet laden");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage(debouncedSearch);
  }, [debouncedSearch, loadFirstPage]);

  const loadDismissed = useCallback(async () => {
    setDismissedLoading(true);
    try {
      const list = await listDismissedTransactions();
      setDismissedRows(list);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon lijst niet laden", "error");
    } finally {
      setDismissedLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (view === "dismissed") loadDismissed();
  }, [view, loadDismissed]);

  // Live meebewegen met wijzigingen elders (ander toestell, andere tab): houdt
  // de excluded-set vers en corrigeert de inbox. Gedebounced tegen event-storms.
  const refreshActiveView = useCallback(() => {
    if (view === "open") loadFirstPage(debouncedSearch);
    else loadDismissed();
  }, [view, debouncedSearch, loadFirstPage, loadDismissed]);
  const debouncedRefresh = useDebouncedCallback(refreshActiveView);

  useEffect(() => {
    const unsubExpenses = subscribeVerbouwing("expenses", debouncedRefresh);
    const unsubDismissed = subscribeVerbouwing("dismissed_transactions", debouncedRefresh);
    return () => {
      unsubExpenses();
      unsubDismissed();
    };
  }, [debouncedRefresh]);

  // Nieuwe transacties uit de automatische banksync direct in de inbox tonen.
  useBankSyncRefresh(debouncedRefresh);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchInboxPage({
        search: debouncedSearch,
        serverOffset: serverOffsetRef.current,
        excluded: excludedRef.current,
      });
      serverOffsetRef.current = page.nextServerOffset;
      setRows((prev) => [...prev, ...page.rows]);
      setHasMore(page.hasMore);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon meer transacties niet laden", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleSelect(id: string, rowIndex: number, shiftKey: boolean) {
    if (shiftKey && lastSelectedIndex.current >= 0) {
      const start = Math.min(lastSelectedIndex.current, rowIndex);
      const end = Math.max(lastSelectedIndex.current, rowIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(rows[i].id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    lastSelectedIndex.current = rowIndex;
  }

  function toggleSelectAll() {
    if (rows.length > 0 && rows.every((t) => selectedIds.has(t.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((t) => t.id)));
    }
  }

  /** Optimistisch dismissen: rijen direct weg, terugdraaien bij een fout. */
  async function dismiss(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previousRows = rows;
    setRows((prev) => prev.filter((t) => !idSet.has(t.id)));
    setSelectedIds(new Set());
    lastSelectedIndex.current = -1;
    ids.forEach((id) => excludedRef.current.add(id));
    try {
      await dismissTransactions(ids);
      toast(
        ids.length === 1
          ? "Transactie gemarkeerd als niet relevant"
          : `${ids.length} transacties gemarkeerd als niet relevant`,
      );
    } catch (err) {
      setRows(previousRows);
      ids.forEach((id) => excludedRef.current.delete(id));
      toast(err instanceof Error ? err.message : "Kon niet opslaan", "error");
    }
  }

  /** Zet weggezette transacties terug: optimistisch uit de dismissed-lijst. */
  async function undismiss(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previous = dismissedRows;
    setDismissedRows((prev) => prev.filter((t) => !idSet.has(t.id)));
    ids.forEach((id) => excludedRef.current.delete(id));
    try {
      await undismissTransactions(ids);
      toast(
        ids.length === 1
          ? "Transactie teruggezet naar de inbox"
          : `${ids.length} transacties teruggezet`,
      );
    } catch (err) {
      setDismissedRows(previous);
      ids.forEach((id) => excludedRef.current.add(id));
      toast(err instanceof Error ? err.message : "Kon niet terugzetten", "error");
    }
  }

  /**
   * Zet álle transacties die aan de huidige zoekopdracht voldoen op "niet
   * relevant" — niet alleen de geladen rijen. Pagineert de bron leeg, verzamelt
   * de ids en dismisst ze in brokken.
   */
  async function dismissAllMatching() {
    setBulkBusy(true);
    try {
      const ids: string[] = [];
      let offset = 0;
      let more = true;
      while (more) {
        const page = await fetchInboxPage({
          search: debouncedSearch,
          serverOffset: offset,
          excluded: excludedRef.current,
          pageSize: 200,
        });
        for (const t of page.rows) ids.push(t.id);
        offset = page.nextServerOffset;
        more = page.hasMore;
      }
      if (ids.length === 0) {
        toast("Geen transacties om weg te zetten");
        return;
      }
      if (
        !confirm(
          `${ids.length} transactie${ids.length !== 1 ? "s" : ""} die aan de zoekopdracht ` +
            `voldoen als niet relevant markeren?`,
        )
      ) {
        return;
      }
      for (let i = 0; i < ids.length; i += 200) {
        await dismissTransactions(ids.slice(i, i + 200));
      }
      ids.forEach((id) => excludedRef.current.add(id));
      toast(`${ids.length} transacties gemarkeerd als niet relevant`);
      await loadFirstPage(debouncedSearch);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon niet opslaan", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  function openDrawer(t: InboxTransaction) {
    setDrawerPrefill({
      transaction_id: t.id,
      date: t.date,
      description: t.description,
      supplier: t.counterparty_name,
      total: Math.abs(t.amount),
    });
  }

  function handleSaved() {
    if (!drawerPrefill) return;
    const id = drawerPrefill.transaction_id;
    excludedRef.current.add(id);
    setRows((prev) => prev.filter((t) => t.id !== id));
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((t) => selectedIds.has(t.id));

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Beoordelen</h1>
        <p className="mt-1 text-sm text-muted">
          Markeer banktransacties als verbouwing-uitgave of als niet relevant.
        </p>
      </div>

      {/* Openstaand ↔ Niet relevant */}
      <div
        className="mb-4 inline-flex rounded-lg border p-0.5 text-sm"
        style={{ borderColor: "var(--border-strong)" }}
      >
        {(["open", "dismissed"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className="rounded-md px-3 py-1.5 font-medium transition"
            style={
              view === v
                ? { background: "var(--accent)", color: "var(--surface)" }
                : { color: "var(--muted)" }
            }
          >
            {v === "open" ? "Openstaand" : "Niet relevant"}
          </button>
        ))}
      </div>

      {view === "dismissed" ? (
        <div className="card !p-0 overflow-hidden">
          {dismissedLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Laden…
            </div>
          ) : dismissedRows.length === 0 ? (
            <div className="py-12 text-center">
              <Inbox className="mx-auto mb-3 h-10 w-10 text-faint" />
              <p className="text-sm text-muted">
                Nog niets als niet relevant gemarkeerd.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {dismissedRows.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-20 shrink-0 text-xs text-muted">{formatDate(t.date)}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">
                      {t.counterparty_name || t.description}
                    </p>
                    {t.counterparty_name && (
                      <p className="truncate text-xs text-muted">{t.description}</p>
                    )}
                  </div>
                  <span className="font-mono text-sm text-danger">{formatCurrency(t.amount)}</span>
                  <button
                    className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    onClick={() => undismiss([t.id])}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Terugzetten
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Zoekbalk */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-faint" />
        <input
          className="input pl-9"
          placeholder="Zoek op omschrijving of tegenpartij…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Bulk-acties */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {selectedIds.size > 0 && (
          <>
            <span className="text-sm font-medium">{selectedIds.size} geselecteerd</span>
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={() => dismiss(Array.from(selectedIds))}
            >
              Selectie niet relevant
            </button>
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Deselecteren
            </button>
          </>
        )}
        {rows.length > 0 && selectedIds.size === 0 && (
          <>
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={() => {
                if (
                  confirm(
                    `Alle ${rows.length} getoonde transacties als niet relevant markeren?`,
                  )
                ) {
                  dismiss(rows.map((t) => t.id));
                }
              }}
            >
              Alles op deze pagina niet relevant
            </button>
            <button
              className="btn-ghost px-3 py-1.5 text-sm"
              onClick={dismissAllMatching}
              disabled={bulkBusy}
            >
              {bulkBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {debouncedSearch ? "Alles wat matcht niet relevant" : "Alles niet relevant"}
            </button>
          </>
        )}
      </div>

      {/* Lijst */}
      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Transacties laden…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <p className="text-sm text-muted">{error}</p>
            <button className="btn-ghost" onClick={() => loadFirstPage(debouncedSearch)}>
              Opnieuw proberen
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-faint" />
            <p className="text-sm text-muted">
              {debouncedSearch
                ? "Geen onbeoordeelde transacties gevonden voor deze zoekopdracht."
                : "Alles is beoordeeld — geen openstaande transacties."}
            </p>
          </div>
        ) : (
          <>
            <div
              className="flex items-center gap-3 border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted"
              style={{ borderColor: "var(--border)" }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="rounded border-gray-300"
                aria-label="Alles selecteren"
              />
              <span>
                {rows.length} transactie{rows.length !== 1 ? "s" : ""}
                {hasMore ? "+" : ""}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {rows.map((t, rowIndex) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={
                    selectedIds.has(t.id)
                      ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" }
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={(e) =>
                      toggleSelect(
                        t.id,
                        rowIndex,
                        e.nativeEvent instanceof MouseEvent &&
                          (e.nativeEvent as MouseEvent).shiftKey,
                      )
                    }
                    className="rounded border-gray-300"
                    aria-label={`Selecteer ${t.counterparty_name || t.description}`}
                  />
                  <span className="w-20 shrink-0 text-xs text-muted">{formatDate(t.date)}</span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">
                      {t.counterparty_name || t.description}
                    </p>
                    {t.counterparty_name && (
                      <p className="truncate text-xs text-muted">{t.description}</p>
                    )}
                  </div>
                  <span className="font-mono text-sm text-danger">
                    {formatCurrency(t.amount)}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      className="btn-primary px-3 py-1.5 text-xs"
                      onClick={() => openDrawer(t)}
                    >
                      Verbouwing
                    </button>
                    <button
                      className="btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => dismiss([t.id])}
                    >
                      Niet relevant
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="border-t p-3 text-center" style={{ borderColor: "var(--border)" }}>
                <button className="btn-ghost px-4 py-2 text-sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  Meer laden
                </button>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      <ExpenseDrawer
        open={drawerPrefill !== null}
        onClose={() => setDrawerPrefill(null)}
        rooms={rooms}
        prefill={drawerPrefill}
        onSaved={handleSaved}
      />
    </div>
  );
}
