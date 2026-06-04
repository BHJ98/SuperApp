import { format, formatDistanceToNow } from "date-fns";

export function fmtWeight(kg: number): string {
  if (!kg) return "0";
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

export function fmtDate(iso: string): string {
  return format(new Date(iso), "EEE d MMM yyyy");
}

export function fmtRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}
