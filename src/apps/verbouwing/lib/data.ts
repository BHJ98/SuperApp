import { supabase } from "@/lib/supabase";
import type {
  Category,
  Expense,
  ExpenseWithDetails,
  InboxTransaction,
  ParsedReceipt,
  Receipt,
  Room,
  RoomOption,
} from "../types";
import { compressImage } from "./image";

// Alle verbouwing-data leeft in het `verbouwing`-schema (RLS via
// public.is_allowed(), household-gedeeld — zie migration/verbouwing_schema.sql).
// Banktransacties leven in `public.transactions` (Finance's bank-sync).

export function vdb() {
  if (!supabase) throw new Error("Supabase client niet geconfigureerd");
  return supabase.schema("verbouwing");
}

function pdb() {
  if (!supabase) throw new Error("Supabase client niet geconfigureerd");
  return supabase;
}

function bonnen() {
  if (!supabase) throw new Error("Supabase client niet geconfigureerd");
  return supabase.storage.from("bonnen");
}

// ---- Ruimtes ----------------------------------------------------------------

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await vdb()
    .from("rooms")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Room[];
}

export async function createRoom(room: {
  name: string;
  parent_id?: string | null;
  budget?: number | null;
  sort_order?: number;
}): Promise<Room> {
  const { data, error } = await vdb().from("rooms").insert(room).select().single();
  if (error) throw new Error(error.message);
  return data as Room;
}

export async function updateRoom(
  id: string,
  patch: Partial<Pick<Room, "name" | "budget" | "sort_order">>,
): Promise<void> {
  const { error } = await vdb().from("rooms").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Verwijdert een ruimte (subdelen casceren mee). Gooit een duidelijke fout als
 * de ruimte (of een subdeel) nog door uitgaven gebruikt wordt — expense_parts
 * heeft een FK met `on delete restrict`.
 */
export async function deleteRoom(id: string): Promise<void> {
  const { error } = await vdb().from("rooms").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Deze ruimte (of een subdeel ervan) wordt nog gebruikt door uitgaven en kan niet verwijderd worden.",
      );
    }
    throw new Error(error.message);
  }
}

/** Groepeert ruimtes per parent_id (subdelen per top-level ruimte). */
export function groupChildrenByParent(rooms: Room[]): Map<string, Room[]> {
  const map = new Map<string, Room[]>();
  for (const r of rooms) {
    if (r.parent_id) {
      const list = map.get(r.parent_id) ?? [];
      list.push(r);
      map.set(r.parent_id, list);
    }
  }
  return map;
}

/** Platte lijst voor selects: ruimtes met hun subdelen ingesprongen eronder. */
export function flattenRooms(rooms: Room[]): RoomOption[] {
  const byParent = groupChildrenByParent(rooms);
  const out: RoomOption[] = [];
  for (const top of rooms.filter((r) => !r.parent_id)) {
    out.push({ id: top.id, name: top.name, depth: 0, fullName: top.name });
    for (const child of byParent.get(top.id) ?? []) {
      out.push({
        id: child.id,
        name: child.name,
        depth: 1,
        fullName: `${top.name} › ${child.name}`,
      });
    }
  }
  return out;
}

/** Ids van een ruimte plus al haar (klein)subdelen. */
export function roomWithDescendantIds(rooms: Room[], roomId: string): Set<string> {
  const ids = new Set<string>([roomId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rooms) {
      if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) {
        ids.add(r.id);
        grew = true;
      }
    }
  }
  return ids;
}

// ---- Categorieën -------------------------------------------------------------

/**
 * Tweede snijvlak naast ruimtes. Geeft [] terug zolang de
 * verbouwing_categories-migratie nog niet gedraaid is (tabel bestaat dan niet),
 * zodat de categorie-UI zichzelf verbergt in plaats van de pagina te breken.
 */
export async function listCategories(): Promise<Category[]> {
  try {
    const { data, error } = await vdb()
      .from("categories")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) return [];
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

// ---- Uitgaven + parts ---------------------------------------------------------

const EXPENSE_SELECT = "*, expense_parts(*), receipts(*)";

export async function listExpenses(): Promise<ExpenseWithDetails[]> {
  const { data, error } = await vdb()
    .from("expenses")
    .select(EXPENSE_SELECT)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseWithDetails[];
}

export type NewExpense = {
  transaction_id: string | null;
  date: string;
  description: string;
  supplier: string | null;
  total_amount: number;
};

export type NewPart = {
  room_id: string;
  amount: number;
  note: string | null;
  /** null = geen categorie; de RPC schrijft hem naar expense_parts.category_id. */
  category_id: string | null;
};

/**
 * Nieuwe uitgave + verdeling in één transactie via een RPC (zie
 * migration/verbouwing_atomic_writes.sql). De DB valideert dat de parts
 * optellen tot het totaal en rolt bij een fout alles terug — er blijft nooit
 * een uitgave zonder verdeling achter.
 */
export async function createExpense(expense: NewExpense, parts: NewPart[]): Promise<Expense> {
  const { data, error } = await vdb().rpc("create_expense_with_parts", {
    p_expense: expense,
    p_parts: parts,
  });
  if (error) throw new Error(error.message);
  return data as Expense;
}

/** Bewerken: update de expense en vervang de parts, atomair via dezelfde RPC-laag. */
export async function updateExpense(
  id: string,
  patch: Omit<NewExpense, "transaction_id">,
  parts: NewPart[],
): Promise<void> {
  const { error } = await vdb().rpc("update_expense_with_parts", {
    p_id: id,
    p_patch: patch,
    p_parts: parts,
  });
  if (error) throw new Error(error.message);
}

/**
 * Verwijdert een uitgave. Eerst de DB-rij (receipts casceren mee: de
 * bron-van-waarheid is direct consistent), dán best-effort de storage-objecten
 * opruimen — een storage-fout laat hooguit een wees-bestand achter, nooit een
 * dangling receipts-rij die naar een verdwenen bestand wijst. Bij een
 * bank-gekoppelde uitgave zet de DB-trigger is_verbouwing terug op false,
 * waardoor de transactie vanzelf weer in de beoordelen-inbox verschijnt; een
 * eventueel (defensief) aanwezige dismissed-rij wordt ook opgeruimd.
 */
export async function deleteExpense(expense: Expense): Promise<void> {
  const { error } = await vdb().from("expenses").delete().eq("id", expense.id);
  if (error) throw new Error(error.message);

  if (expense.transaction_id) {
    await vdb()
      .from("dismissed_transactions")
      .delete()
      .eq("transaction_id", expense.transaction_id);
  }

  // Storage best-effort opruimen, met paginatie (bucket.list pagineert per 100).
  try {
    const toRemove: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data: files } = await bonnen().list(expense.id, { limit: 100, offset });
      if (!files || files.length === 0) break;
      for (const f of files) toRemove.push(`${expense.id}/${f.name}`);
      if (files.length < 100) break;
    }
    if (toRemove.length > 0) await bonnen().remove(toRemove);
  } catch {
    // Wees-bestanden zijn onschadelijk; de DB is al consistent.
  }
}

// ---- Beoordelen-inbox ----------------------------------------------------------

export async function dismissTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await vdb()
    .from("dismissed_transactions")
    .upsert(
      ids.map((id) => ({ transaction_id: id })),
      { onConflict: "transaction_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

/** Zet weggezette ("niet relevant") transacties terug naar de inbox. */
export async function undismissTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await vdb()
    .from("dismissed_transactions")
    .delete()
    .in("transaction_id", ids);
  if (error) throw new Error(error.message);
}

/**
 * De weggezette transacties, verrijkt met hun banktransactie-details, nieuwste
 * eerst — voor de "Niet relevant"-lijst in Beoordelen (met terugzet-actie).
 */
export async function listDismissedTransactions(): Promise<InboxTransaction[]> {
  const { data: dismissed, error } = await vdb()
    .from("dismissed_transactions")
    .select("transaction_id")
    .order("dismissed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (dismissed ?? [])
    .map((d) => (d as { transaction_id: string }).transaction_id)
    .filter(Boolean);
  if (ids.length === 0) return [];

  // De details in behapbare brokken ophalen (vermijdt een te lange URL).
  const byId = new Map<string, InboxTransaction>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error: txError } = await pdb()
      .from("transactions")
      .select("id, date, amount, description, counterparty_name")
      .in("id", chunk);
    if (txError) throw new Error(txError.message);
    for (const t of (data ?? []) as InboxTransaction[]) byId.set(t.id, t);
  }
  // Volgorde van dismissed_at behouden.
  return ids.map((id) => byId.get(id)).filter((t): t is InboxTransaction => !!t);
}

/**
 * Alle transaction_ids die al beoordeeld zijn: gekoppeld aan een expense óf
 * als "niet relevant" gemarkeerd. Deze sets zijn klein (alleen wat je zelf
 * beoordeeld hebt), dus we halen ze in één keer op en filteren de inbox er
 * client-side mee — simpeler en robuuster dan een NOT IN met honderden ids in
 * de query-string.
 */
export async function listExcludedTransactionIds(): Promise<Set<string>> {
  const [expensesRes, dismissedRes] = await Promise.all([
    vdb().from("expenses").select("transaction_id").not("transaction_id", "is", null),
    vdb().from("dismissed_transactions").select("transaction_id"),
  ]);
  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (dismissedRes.error) throw new Error(dismissedRes.error.message);

  const set = new Set<string>();
  for (const row of (expensesRes.data ?? []) as { transaction_id: string | null }[]) {
    if (row.transaction_id) set.add(row.transaction_id);
  }
  for (const row of (dismissedRes.data ?? []) as { transaction_id: string }[]) {
    set.add(row.transaction_id);
  }
  return set;
}

const INBOX_SERVER_CHUNK = 100;

export type InboxPage = {
  rows: InboxTransaction[];
  /** Server-offset om vanaf verder te laden (niet gelijk aan rows.length!). */
  nextServerOffset: number;
  hasMore: boolean;
};

/**
 * Inbox = uitgaande, niet-overboekings-banktransacties die nog niet beoordeeld
 * zijn. Aanpak: server-side pagineren/zoeken op public.transactions (nieuwste
 * eerst, zoals Finance's Transactions-pagina) en de al-beoordeelde ids
 * client-side wegfilteren; er wordt bijgeladen tot er minstens `pageSize`
 * zichtbare regels zijn of de bron op is. De caller pagineert met
 * `nextServerOffset` (cursor over de server-rijen), dus geen gaten of
 * duplicaten, ook als vrijwel alles al beoordeeld is.
 */
export async function fetchInboxPage(opts: {
  search: string;
  serverOffset: number;
  excluded: Set<string>;
  pageSize?: number;
}): Promise<InboxPage> {
  const pageSize = opts.pageSize ?? 50;
  const rows: InboxTransaction[] = [];
  let offset = opts.serverOffset;
  let hasMore = true;

  while (rows.length < pageSize && hasMore) {
    let query = pdb()
      .from("transactions")
      .select("id, date, amount, description, counterparty_name")
      .lt("amount", 0)
      .eq("is_transfer", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + INBOX_SERVER_CHUNK - 1);

    // Zelfde sanitering als Finance Transactions, plus komma's/haakjes die de
    // .or()-filtersyntax zouden breken.
    const sanitized = opts.search.replace(/[%_\\,()]/g, "").trim();
    if (sanitized) {
      query = query.or(
        `description.ilike.%${sanitized}%,counterparty_name.ilike.%${sanitized}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as InboxTransaction[];
    offset += chunk.length;
    if (chunk.length < INBOX_SERVER_CHUNK) hasMore = false;
    for (const t of chunk) {
      if (!opts.excluded.has(t.id)) rows.push(t);
    }
  }

  return { rows, nextServerOffset: offset, hasMore };
}

/**
 * Teller voor de badge: alle uitgaande niet-overboekingen minus wat al
 * beoordeeld is. Beoordeelde ids komen per definitie uit deze zelfde inbox
 * (negatief, geen overboeking), dus het verschil van de aantallen klopt.
 */
export async function fetchInboxCount(): Promise<number> {
  const [excluded, countRes] = await Promise.all([
    listExcludedTransactionIds(),
    pdb()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .lt("amount", 0)
      .eq("is_transfer", false),
  ]);
  if (countRes.error) throw new Error(countRes.error.message);
  return Math.max(0, (countRes.count ?? 0) - excluded.size);
}

// ---- Realtime -------------------------------------------------------------------

export type VerbouwingTable =
  | "rooms"
  | "expenses"
  | "expense_parts"
  | "receipts"
  | "dismissed_transactions";

let channelSeq = 0;

/**
 * Abonneer op wijzigingen in één verbouwing-tabel (zelfde patroon als
 * groceries' subscribeToShoppingListItems): de caller herlaadt zijn eigen data
 * bij elk event. Kanaalnamen zijn uniek ("verbouwing-<tabel>-<n>") zodat
 * meerdere componenten tegelijk op dezelfde tabel kunnen luisteren.
 */
export function subscribeVerbouwing(table: VerbouwingTable, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`verbouwing-${table}-${++channelSeq}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "verbouwing", table },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}

// ---- Bonnen (storage-bucket "bonnen") ----------------------------------------------

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** PDF's herkennen we aan het storage-pad; er is geen apart mime-veld in de DB. */
export function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function isPdfFile(file: Blob): boolean {
  return file.type === "application/pdf";
}

/** Uploadt een bon (foto → gecomprimeerd JPEG, PDF → ongewijzigd) en registreert de receipts-rij. */
export async function uploadReceipt(expenseId: string, file: Blob): Promise<Receipt> {
  const pdf = isPdfFile(file);
  if (pdf && file.size > MAX_PDF_BYTES) {
    throw new Error("PDF te groot (max 15MB)");
  }
  const body = pdf ? file : await compressImage(file);
  const path = `${expenseId}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;

  const { error: uploadError } = await bonnen().upload(path, body, {
    contentType: pdf ? "application/pdf" : "image/jpeg",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await vdb()
    .from("receipts")
    .insert({ expense_id: expenseId, storage_path: path })
    .select()
    .single();
  if (error) {
    await bonnen().remove([path]);
    throw new Error(error.message);
  }
  return data as Receipt;
}

export async function deleteReceipt(receipt: Receipt): Promise<void> {
  const { error: removeError } = await bonnen().remove([receipt.storage_path]);
  if (removeError) throw new Error(removeError.message);
  const { error } = await vdb().from("receipts").delete().eq("id", receipt.id);
  if (error) throw new Error(error.message);
}

export async function getReceiptSignedUrl(path: string): Promise<string> {
  const { data, error } = await bonnen().createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Kon bonfoto niet laden");
  }
  return data.signedUrl;
}

// ---- AI-bonuitlezing (alleen op verzoek, alleen in de split-editor) -----------------

export async function parseReceipt(
  imageBase64: string,
  mediaType: string,
): Promise<ParsedReceipt> {
  // Stuur het Supabase-access-token mee zodat het endpoint de aanvraag kan
  // authenticeren (het endpoint roept anders een betaalde AI-service open aan).
  const { data: sessionData } = await pdb().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Geen actieve sessie — log opnieuw in");
  const res = await fetch("/api/parse-receipt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image: imageBase64, mediaType }),
  });
  const body: unknown = await res.json().catch(() => null);
  const obj = (body ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof obj.error === "string" ? obj.error : "Bon uitlezen mislukt");
  }
  const rawLines = Array.isArray(obj.lines) ? obj.lines : [];
  return {
    supplier: typeof obj.supplier === "string" ? obj.supplier : null,
    date: typeof obj.date === "string" ? obj.date : null,
    total: typeof obj.total === "number" ? obj.total : null,
    lines: rawLines
      .filter(
        (l): l is { description?: unknown; amount: number } =>
          !!l && typeof (l as { amount?: unknown }).amount === "number",
      )
      .map((l) => ({
        description: typeof l.description === "string" ? l.description : "",
        amount: l.amount,
      })),
  };
}
