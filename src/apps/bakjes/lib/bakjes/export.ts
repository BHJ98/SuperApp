import type { Bakje } from "../types";

/**
 * RFC 4180 CSV: double-quote fields, escape embedded quotes by doubling.
 */
function csvField(value: string | number | undefined | null): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function bakjesAlsCsv(bakjes: Bakje[]): string {
  const header = ["Naam", "Kleur", "Target uren/week", "Succes-beschrijving"]
    .map(csvField)
    .join(",");
  const rows = bakjes.map((b) =>
    [
      csvField(b.naam),
      csvField(b.kleur),
      csvField(b.targetUrenPerWeek ?? ""),
      csvField(b.succesBeschrijving),
    ].join(","),
  );
  return [header, ...rows].join("\r\n");
}

export function downloadBestand(
  inhoud: string,
  bestandsnaam: string,
  mimeType: string,
): void {
  const blob = new Blob(["﻿" + inhoud], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = bestandsnaam;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function vandaagAlsDatumString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
