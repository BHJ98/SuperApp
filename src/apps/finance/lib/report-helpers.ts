// Shared types and helpers for reports

export type PeriodType = "month" | "quarter" | "year" | "custom";

export type ReportFilters = {
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  accountIds: string[];
};

// Default category colors for charts
const CATEGORY_COLORS: Record<string, string> = {
  Wonen: "#3b82f6",
  Boodschappen: "#22c55e",
  Vervoer: "#f59e0b",
  Verzekeringen: "#8b5cf6",
  Abonnementen: "#ec4899",
  "Uit eten & Drinken": "#f97316",
  Kleding: "#06b6d4",
  Gezondheid: "#10b981",
  Vakanties: "#6366f1",
  "Cadeaus & Donaties": "#e11d48",
  Huisdieren: "#84cc16",
  "Interieur & Tuin": "#14b8a6",
  Sparen: "#0ea5e9",
  Inkomen: "#16a34a",
  Overig: "#6b7280",
};

// Fallback colors for categories not in the map
const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899",
  "#f97316", "#06b6d4", "#10b981", "#6366f1", "#e11d48",
  "#84cc16", "#14b8a6", "#0ea5e9", "#a855f7", "#ef4444",
];

export function getCategoryColor(name: string, index: number): string {
  return CATEGORY_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function getDateRange(periodType: PeriodType, refDate: Date = new Date()): { start: string; end: string } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  switch (periodType) {
    case "month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "quarter": {
      const qStart = Math.floor(month / 3) * 3;
      const start = new Date(year, qStart, 1);
      const end = new Date(year, qStart + 3, 0);
      return { start: fmt(start), end: fmt(end) };
    }
    case "year": {
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    default:
      return { start: fmt(new Date(year, month - 1, 1)), end: fmt(new Date(year, month, 0)) };
  }
}

export function getPreviousPeriodRange(
  _periodType: PeriodType,
  startDate: string,
  endDate: string
): { start: string; end: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);

  return { start: fmt(prevStart), end: fmt(prevEnd) };
}

export function getSameMonthLastYear(startDate: string, endDate: string): { start: string; end: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setFullYear(start.getFullYear() - 1);
  end.setFullYear(end.getFullYear() - 1);
  return { start: fmt(start), end: fmt(end) };
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatPeriodLabel(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startMonth = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(start);
  const endMonth = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" }).format(end);

  if (startMonth === endMonth) return startMonth;
  return `${startMonth} - ${endMonth}`;
}

export function formatChangePercent(current: number, previous: number): { text: string; isPositive: boolean } {
  if (previous === 0) return { text: "N/A", isPositive: true };
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}%`,
    isPositive: pct <= 0, // for expenses, decrease is positive
  };
}

export function formatChangeCurrency(current: number, previous: number): string {
  const diff = current - previous;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(diff)}`;
}
