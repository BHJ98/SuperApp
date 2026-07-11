// Kleine, lokale formatters — bewust niet uit de Finance-app geïmporteerd om
// cross-app-koppeling te vermijden.

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Math.round(amount * 100) / 100);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return new Intl.DateTimeFormat("nl-NL", { month: "short", year: "2-digit" }).format(
    new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1),
  );
}

/** Parse "12,50" of "12.50" naar een bedrag in centen-precisie; NaN indien ongeldig. */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
