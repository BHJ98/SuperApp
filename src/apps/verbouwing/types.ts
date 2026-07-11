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

export type VerbouwingSettings = {
  id: number;
  total_budget: number | null;
};

/** Banktransactie zoals de beoordelen-inbox hem toont (public.transactions). */
export type InboxTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
};

/** Antwoord van /api/parse-receipt. */
export type ParsedReceiptLine = { description: string; amount: number };
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
};
