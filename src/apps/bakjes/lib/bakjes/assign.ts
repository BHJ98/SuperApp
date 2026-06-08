import type { AgendaEvent, AppData, Regel } from "../types";
import { regelMatcht } from "./rules";

export interface ResolvedAssignment {
  bakjeId: string | null;
  bron: "handmatig" | "regel" | "geen";
  regelId?: string;
}

/**
 * Resolve which bakje an event belongs to.
 * Priority:
 *   1. Manual assignment in appData.assignments (if bakje still exists).
 *   2. First matching active rule.
 *   3. null (unclassified).
 */
export function resolveAssignment(event: AgendaEvent, data: AppData): ResolvedAssignment {
  const handmatig = data.assignments[event.uid];
  if (handmatig && handmatig.handmatig) {
    const bestaat = data.bakjes.some((b) => b.id === handmatig.bakjeId);
    if (bestaat) {
      return { bakjeId: handmatig.bakjeId, bron: "handmatig" };
    }
  }

  for (const regel of data.regels) {
    if (!regel.actief) continue;
    if (!data.bakjes.some((b) => b.id === regel.bakjeId)) continue;
    if (regelMatcht(regel, event)) {
      return { bakjeId: regel.bakjeId, bron: "regel", regelId: regel.id };
    }
  }

  return { bakjeId: null, bron: "geen" };
}

export function matchingRule(event: AgendaEvent, regels: Regel[]): Regel | null {
  for (const regel of regels) {
    if (regelMatcht(regel, event)) return regel;
  }
  return null;
}
