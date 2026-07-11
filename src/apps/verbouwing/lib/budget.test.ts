import { describe, expect, it } from "vitest";
import {
  buildRoomBudgetTree,
  effectiveRoomBudget,
  sumOrNull,
  totalEffectiveBudget,
} from "./budget";
import type { Room } from "../types";

function room(overrides: Partial<Room>): Room {
  return {
    id: "id",
    name: "Ruimte",
    parent_id: null,
    budget: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("sumOrNull", () => {
  it("geeft null als alle waarden null zijn", () => {
    expect(sumOrNull([null, null])).toBeNull();
    expect(sumOrNull([])).toBeNull();
  });

  it("telt null als 0 zodra er minstens één waarde is", () => {
    expect(sumOrNull([100, null, 50])).toBe(150);
  });

  it("telt gewoon op als alles gezet is", () => {
    expect(sumOrNull([10, 20, 30])).toBe(60);
  });
});

describe("effectiveRoomBudget", () => {
  it("een ruimte zonder subdelen gebruikt haar eigen budget", () => {
    expect(effectiveRoomBudget(room({ budget: 500 }), [])).toBe(500);
    expect(effectiveRoomBudget(room({ budget: null }), [])).toBeNull();
  });

  it("een ruimte met subdelen negeert haar eigen budget en somt de subdelen", () => {
    const parent = room({ id: "p", budget: 999 });
    const children = [room({ id: "c1", parent_id: "p", budget: 100 }), room({ id: "c2", parent_id: "p", budget: 200 })];
    expect(effectiveRoomBudget(parent, children)).toBe(300);
  });

  it("null als alle subdelen budgetloos zijn", () => {
    const parent = room({ id: "p" });
    const children = [room({ id: "c1", parent_id: "p", budget: null }), room({ id: "c2", parent_id: "p", budget: null })];
    expect(effectiveRoomBudget(parent, children)).toBeNull();
  });

  it("telt een null-subdeel als 0 zodra een ander subdeel wel budget heeft", () => {
    const parent = room({ id: "p" });
    const children = [room({ id: "c1", parent_id: "p", budget: 150 }), room({ id: "c2", parent_id: "p", budget: null })];
    expect(effectiveRoomBudget(parent, children)).toBe(150);
  });
});

describe("buildRoomBudgetTree + totalEffectiveBudget", () => {
  it("berekent per top-level ruimte en het totaal", () => {
    const rooms = [
      room({ id: "keuken", budget: 1000 }),
      room({ id: "woonkamer" }),
      room({ id: "vloer", parent_id: "woonkamer", budget: 300 }),
      room({ id: "kachel", parent_id: "woonkamer", budget: 200 }),
      room({ id: "zolder" }),
    ];
    const tree = buildRoomBudgetTree(rooms);
    expect(tree.find((n) => n.room.id === "keuken")?.effectiveBudget).toBe(1000);
    expect(tree.find((n) => n.room.id === "woonkamer")?.effectiveBudget).toBe(500);
    expect(tree.find((n) => n.room.id === "zolder")?.effectiveBudget).toBeNull();
    expect(totalEffectiveBudget(tree)).toBe(1500);
  });

  it("totaal is null als geen enkele ruimte een budget heeft", () => {
    const rooms = [room({ id: "a" }), room({ id: "b" })];
    expect(totalEffectiveBudget(buildRoomBudgetTree(rooms))).toBeNull();
  });
});
