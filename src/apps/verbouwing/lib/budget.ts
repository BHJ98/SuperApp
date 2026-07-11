// Budgetten worden automatisch berekend, niet los ingevoerd: een ruimte mét
// subdelen krijgt haar budget uit de som van haar subdelen, en het
// totaalbudget uit de som van alle (top-level) ruimtes. Alleen een ruimte
// zonder subdelen (of een subdeel zelf) heeft nog een handmatig budgetveld.

import type { Room } from "../types";
import { groupChildrenByParent } from "./data";

export type RoomBudgetNode = {
  room: Room;
  children: Room[];
  effectiveBudget: number | null;
};

/** null als alle waarden null zijn, anders de som (null telt als 0). */
export function sumOrNull(values: (number | null)[]): number | null {
  if (values.every((v) => v === null)) return null;
  return values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

export function effectiveRoomBudget(room: Room, children: Room[]): number | null {
  if (children.length === 0) return room.budget;
  return sumOrNull(children.map((c) => c.budget));
}

export function buildRoomBudgetTree(rooms: Room[]): RoomBudgetNode[] {
  const childrenByParent = groupChildrenByParent(rooms);
  return rooms
    .filter((r) => !r.parent_id)
    .map((room) => {
      const children = childrenByParent.get(room.id) ?? [];
      return { room, children, effectiveBudget: effectiveRoomBudget(room, children) };
    });
}

export function totalEffectiveBudget(nodes: RoomBudgetNode[]): number | null {
  return sumOrNull(nodes.map((n) => n.effectiveBudget));
}
