import Papa from "papaparse";

export type RabobankTransaction = {
  date: string; // YYYY-MM-DD
  amount: number;
  description: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  account_iban: string | null;
  import_hash: string;
  is_transfer: boolean;
};

// Patterns that indicate a creditcard/internal transfer
const TRANSFER_PATTERNS = [
  /kaartnummer/i,
  /creditcard\s*(afschrijving|betaling)/i,
  /ics\s*creditcard/i,
];

async function generateHash(date: string, amount: number, description: string, sequence: string): Promise<string> {
  const str = `${date}|${amount}|${description}|${sequence}`;
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `rabo_${hex.slice(0, 16)}_${date}_${sequence}`;
}

export async function parseRabobankCSV(csvText: string): Promise<{
  transactions: RabobankTransaction[];
  errors: string[];
  accountIban: string | null;
  accountIbans: string[];
}> {
  const errors: string[] = [];
  const transactions: RabobankTransaction[] = [];
  let accountIban: string | null = null;
  const accountIbanSet = new Set<string>();

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      if (error.type !== "FieldMismatch") {
        errors.push(`Rij ${error.row}: ${error.message}`);
      }
    }
  }

  const headers = result.meta.fields || [];

  // Try to detect column names (handle both Dutch and mapped names)
  const dateCol = headers.find((h) => h === "Datum" || h.toLowerCase().includes("datum"));
  const amountCol = headers.find((h) => h === "Bedrag" || h.toLowerCase().includes("bedrag"));
  const counterpartyNameCol = headers.find(
    (h) => h === "Naam tegenpartij" || h.toLowerCase().includes("naam tegenpartij")
  );
  const counterpartyIbanCol = headers.find(
    (h) => h === "Tegenrekening IBAN/BBAN" || h.toLowerCase().includes("tegenrekening")
  );
  const accountIbanCol = headers.find(
    (h) => h === "IBAN/BBAN" || (h.toLowerCase().includes("iban") && !h.toLowerCase().includes("tegenrekening"))
  );
  const desc1Col = headers.find(
    (h) => h === "Omschrijving-1" || h.toLowerCase().includes("omschrijving")
  );
  const desc2Col = headers.find((h) => h === "Omschrijving-2");
  const desc3Col = headers.find((h) => h === "Omschrijving-3");
  const seqCol = headers.find((h) => h === "Volgnr" || h.toLowerCase().includes("volgnr"));

  if (!dateCol || !amountCol) {
    errors.push("Kon de kolommen 'Datum' en 'Bedrag' niet vinden. Is dit een Rabobank CSV?");
    return { transactions, errors, accountIban, accountIbans: Array.from(accountIbanSet) };
  }

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];

    try {
      // Parse date (Rabobank uses YYYY-MM-DD)
      const dateStr = row[dateCol]?.trim();
      if (!dateStr) continue;

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        errors.push(`Rij ${i + 1}: Ongeldig datumformaat "${dateStr}" (verwacht JJJJ-MM-DD)`);
        continue;
      }
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 1990 || parsedDate.getFullYear() > 2100) {
        errors.push(`Rij ${i + 1}: Ongeldige datum "${dateStr}"`);
        continue;
      }

      // Parse amount (Dutch format: comma as decimal separator)
      const amountStr = row[amountCol]?.trim().replace(",", ".");
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || !isFinite(amount)) {
        errors.push(`Rij ${i + 1}: Ongeldig bedrag "${row[amountCol]}"`);
        continue;
      }
      if (Math.abs(amount) > 1_000_000_000) {
        errors.push(`Rij ${i + 1}: Bedrag te groot "${row[amountCol]}"`);
        continue;
      }

      // Build description from all description columns
      const descParts = [
        desc1Col ? row[desc1Col]?.trim() : "",
        desc2Col ? row[desc2Col]?.trim() : "",
        desc3Col ? row[desc3Col]?.trim() : "",
      ].filter(Boolean);
      const description = descParts.join(" ") || "Geen omschrijving";

      const counterpartyName = counterpartyNameCol
        ? row[counterpartyNameCol]?.trim() || null
        : null;
      const counterpartyIban = counterpartyIbanCol
        ? row[counterpartyIbanCol]?.trim() || null
        : null;

      // Detect account IBAN per row
      const rowAccountIban = accountIbanCol ? row[accountIbanCol]?.trim() || null : null;
      if (rowAccountIban) {
        if (!accountIban) accountIban = rowAccountIban;
        accountIbanSet.add(rowAccountIban);
      }

      const sequence = seqCol ? row[seqCol]?.trim() || String(i) : String(i);
      const importHash = await generateHash(dateStr, amount, description, sequence);

      // Detect creditcard / internal transfers
      const isTransfer = TRANSFER_PATTERNS.some((p) => p.test(description));

      transactions.push({
        date: dateStr,
        amount,
        description,
        counterparty_name: counterpartyName,
        counterparty_iban: counterpartyIban,
        account_iban: rowAccountIban,
        import_hash: importHash,
        is_transfer: isTransfer,
      });
    } catch {
      errors.push(`Rij ${i + 1}: Kon niet worden verwerkt`);
    }
  }

  return { transactions, errors, accountIban, accountIbans: Array.from(accountIbanSet) };
}
