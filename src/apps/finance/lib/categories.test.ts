import { describe, it, expect } from "vitest";
import {
  buildCategoryTree,
  flattenTree,
  getAllChildIds,
  type CategoryBase,
} from "./categories";

const cats: CategoryBase[] = [
  { id: "wonen", name: "Wonen", parent_id: null },
  { id: "huur", name: "Huur", parent_id: "wonen" },
  { id: "energie", name: "Energie", parent_id: "wonen" },
  { id: "gas", name: "Gas", parent_id: "energie" },
  { id: "eten", name: "Boodschappen", parent_id: null },
];

describe("buildCategoryTree", () => {
  it("nests children under their parents", () => {
    const roots = buildCategoryTree(cats);
    expect(roots.map((r) => r.id).sort()).toEqual(["eten", "wonen"]);
    const wonen = roots.find((r) => r.id === "wonen")!;
    expect(wonen.children.map((c) => c.id).sort()).toEqual(["energie", "huur"]);
  });

  it("computes depth and a breadcrumb fullPath", () => {
    const flat = flattenTree(buildCategoryTree(cats));
    const gas = flat.find((c) => c.id === "gas")!;
    expect(gas.depth).toBe(2);
    expect(gas.fullPath).toBe("Wonen → Energie → Gas");
  });

  it("treats an orphan (missing parent) as a root", () => {
    const roots = buildCategoryTree([
      { id: "x", name: "Orphan", parent_id: "does-not-exist" },
    ]);
    expect(roots).toHaveLength(1);
    expect(roots[0].fullPath).toBe("Orphan");
  });
});

describe("flattenTree", () => {
  it("returns every node in pre-order", () => {
    const flat = flattenTree(buildCategoryTree(cats));
    expect(flat.map((c) => c.id)).toEqual([
      "wonen",
      "huur",
      "energie",
      "gas",
      "eten",
    ]);
  });
});

describe("getAllChildIds", () => {
  it("collects the node and all descendants", () => {
    expect([...getAllChildIds(cats, "wonen")].sort()).toEqual([
      "energie",
      "gas",
      "huur",
      "wonen",
    ]);
  });

  it("returns just the node for a leaf", () => {
    expect([...getAllChildIds(cats, "gas")]).toEqual(["gas"]);
  });
});
