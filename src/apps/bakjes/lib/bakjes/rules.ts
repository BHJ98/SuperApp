import type { Regel, AgendaEvent } from "../types";

export function regelMatcht(regel: Regel, event: AgendaEvent): boolean {
  if (!regel.actief) return false;
  const veld = regel.matchVeld === "titel" ? event.titel : event.beschrijving;
  if (!veld) return false;
  if (regel.caseSensitive) {
    return veld.includes(regel.keyword);
  }
  return veld.toLowerCase().includes(regel.keyword.toLowerCase());
}

/**
 * Given a just-classified event, propose a keyword rule from its title.
 * Heuristic: take the longest "meaningful" token from the title (>= 3 chars,
 * not a stopword). Fall back to the whole title if nothing fits.
 */
const STOPWOORDEN = new Set([
  "met",
  "voor",
  "over",
  "van",
  "naar",
  "tot",
  "de",
  "het",
  "een",
  "en",
  "of",
  "is",
  "op",
  "in",
  "aan",
  "bij",
  "uit",
  "door",
  "als",
  "dat",
  "dit",
  "die",
  "ben",
  "zijn",
  "was",
  "zal",
  "ja",
  "nee",
  "ik",
  "jij",
  "hij",
  "zij",
  "wij",
]);

export function suggereerKeyword(titel: string): string {
  const schoon = titel.trim();
  if (!schoon) return "";
  // Strip common prefix separators like "Overleg:" or "[Project]"
  const noPrefix = schoon.replace(/^\[[^\]]+\]\s*/, "").replace(/^[A-Za-z]+:\s*/, "");
  const base = noPrefix || schoon;
  const tokens = base
    .split(/[\s\-–—_/,.]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 3 && !STOPWOORDEN.has(t.toLowerCase()));
  if (tokens.length === 0) return base;
  // Prefer the first longer token (usually the most distinctive one).
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0];
}
