import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

// Automatische banksync bij het openen van de Finance- of Verbouwing-app.
//
// Twee remmen, omdat banken via PSD2 maar ~4 onbeheerde ophaalacties per dag
// toestaan per machtiging:
// - een verbinding wordt alleen gesynct als de laatste sync ouder is dan
//   STALE_MS (6 uur) — dat komt uit op maximaal 4 syncs per dag;
// - per toestel doen we hooguit één poging per ATTEMPT_MS, zodat heen en weer
//   navigeren tussen apps geen query-regen veroorzaakt.
//
// Fouten (bijv. een verlopen machtiging) worden hier stil overgeslagen: dit is
// een achtergrond-verversing. De BankSync-pagina toont de status en geeft bij
// een handmatige sync wél de foutmelding.

const ATTEMPT_KEY = "bank-auto-sync:last-attempt";
const ATTEMPT_MS = 10 * 60_000;
const STALE_MS = 6 * 60 * 60_000;

/** Wordt op `window` gedispatcht zodra een auto-sync nieuwe transacties
 *  importeerde; detail = { imported: number }. */
export const BANK_AUTO_SYNCED_EVENT = "bank-auto-synced";

let inFlight: Promise<number> | null = null;

/** Eén (gethrottlede) auto-sync-poging; geeft het aantal nieuwe transacties terug. */
export function maybeAutoSyncBanks(): Promise<number> {
  if (!inFlight) {
    inFlight = run().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function run(): Promise<number> {
  if (!supabase) return 0;

  try {
    const lastAttempt = Number(localStorage.getItem(ATTEMPT_KEY) ?? 0);
    if (Date.now() - lastAttempt < ATTEMPT_MS) return 0;
    localStorage.setItem(ATTEMPT_KEY, String(Date.now()));
  } catch {
    // localStorage onbeschikbaar (privémodus): geen toestel-throttle, de
    // 6-uursdrempel per verbinding beschermt de banklimiet alsnog.
  }

  const { data, error } = await supabase
    .from("bank_connections")
    .select("requisition_id, last_synced_at")
    .eq("status", "active");
  if (error || !data) return 0;

  const staleBefore = Date.now() - STALE_MS;
  const stale = data.filter(
    (c) => !c.last_synced_at || Date.parse(c.last_synced_at) < staleBefore,
  );

  let imported = 0;
  for (const conn of stale) {
    // Sequentieel: vriendelijker voor Enable Banking dan alles tegelijk.
    const { data: result, error: syncError } = await supabase.functions.invoke("bank-sync", {
      body: { requisition_id: conn.requisition_id },
    });
    if (!syncError && typeof result?.imported === "number") {
      imported += result.imported;
    }
  }

  if (imported > 0) {
    window.dispatchEvent(new CustomEvent(BANK_AUTO_SYNCED_EVENT, { detail: { imported } }));
  }
  return imported;
}

/**
 * Handmatige "sync alles"-actie: synct álle actieve koppelingen, zonder de
 * throttles van de automatische variant (de gebruiker vraagt er expliciet om).
 * Telt wel mee in het daglimiet-budget van de bank — de knop is er voor "ik heb
 * nét gepind", niet om op te blijven rammen. Gooit een Error als de
 * koppelingen-lijst niet geladen kan worden.
 */
export async function syncAllBanksNow(): Promise<{ imported: number; failed: number }> {
  if (!supabase) throw new Error("Supabase client niet geconfigureerd");
  const { data, error } = await supabase
    .from("bank_connections")
    .select("requisition_id")
    .eq("status", "active");
  if (error) throw new Error(error.message);

  let imported = 0;
  let failed = 0;
  for (const conn of data ?? []) {
    const { data: result, error: syncError } = await supabase.functions.invoke("bank-sync", {
      body: { requisition_id: conn.requisition_id },
    });
    if (syncError) failed += 1;
    else if (typeof result?.imported === "number") imported += result.imported;
  }

  if (imported > 0) {
    window.dispatchEvent(new CustomEvent(BANK_AUTO_SYNCED_EVENT, { detail: { imported } }));
  }
  return { imported, failed };
}

/** Start bij mount één auto-sync-poging; meldt het aantal nieuwe transacties. */
export function useBankAutoSync(onImported?: (imported: number) => void) {
  const onImportedRef = useRef(onImported);
  onImportedRef.current = onImported;
  useEffect(() => {
    let cancelled = false;
    maybeAutoSyncBanks().then((n) => {
      if (!cancelled && n > 0) onImportedRef.current?.(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

/** Roept de callback aan zodra een auto-sync nieuwe transacties importeerde,
 *  zodat een al geopende pagina zijn data kan verversen. */
export function useBankSyncRefresh(onSynced: () => void) {
  useEffect(() => {
    const handler = () => onSynced();
    window.addEventListener(BANK_AUTO_SYNCED_EVENT, handler);
    return () => window.removeEventListener(BANK_AUTO_SYNCED_EVENT, handler);
  }, [onSynced]);
}
