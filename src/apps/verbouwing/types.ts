// Types voor de Verbouwing-app. De data leeft in het `verbouwing`-schema
// (zie migration/verbouwing_schema.sql); banktransacties in `public`.

export type Room = {
  id: string;
  name: string;
  parent_id: string | null;
  budget: number | null;
  sort_order: number;
  created_at: string;
};

/** Platte optie voor ruimte-selects: subdelen ingesprongen onder hun ruimte. */
export type RoomOption = {
  id: string;
  name: string;
  depth: number;
  /** "Woonkamer › Vloer" voor subdelen, anders de eigen naam. */
  fullName: string;
};

export type Expense = {
  id: string;
  /** Gekoppelde banktransactie; null = handmatige uitgave. */
  transaction_id: string | null;
  date: string;
  description: string;
  supplier: string | null;
  total_amount: number;
  created_at: string;
};

export type ExpensePart = {
  id: string;
  expense_id: string;
  room_id: string;
  amount: number;
  note: string | null;
  /** Tweede snijvlak naast ruimte (verbouwing.categories); optioneel omdat de
   *  kolom pas na de verbouwing_categories-migratie bestaat. */
  category_id?: string | null;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Receipt = {
  id: string;
  expense_id: string;
  storage_path: string;
  created_at: string;
};

export type ExpenseWithDetails = Expense & {
  expense_parts: ExpensePart[];
  receipts: Receipt[];
};

/** Banktransactie zoals de beoordelen-inbox hem toont (public.transactions). */
export type InboxTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
};

/** Antwoord van /api/parse-receipt. `category` is de door de AI voorgestelde
 *  categorienaam (uit de meegestuurde lijst) of null. */
export type ParsedReceiptLine = {
  description: string;
  amount: number;
  category: string | null;
};
export type ParsedReceipt = {
  supplier: string | null;
  date: string | null;
  total: number | null;
  lines: ParsedReceiptLine[];
};

/** Bewerkbare split-regel in de drawer (bedragen als string tijdens invoer). */
export type EditablePart = {
  key: string;
  room_id: string;
  amount: string;
  note: string;
  /** Lege string = geen categorie. */
  category_id: string;
};
