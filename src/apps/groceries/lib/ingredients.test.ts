import { describe, it, expect } from "vitest";
import { scaleAmount, scaleIngredients, formatIngredientsAsText } from "./ingredients";
import type { Ingredient } from "../types";

describe("scaleAmount", () => {
  it("returns the amount unchanged when factor is 1", () => {
    expect(scaleAmount("200", 1)).toBe("200");
  });

  it("scales a plain number and uses a comma decimal", () => {
    expect(scaleAmount("200", 2)).toBe("400");
    expect(scaleAmount("100", 1.5)).toBe("150");
    expect(scaleAmount("1", 0.5)).toBe("0,5");
  });

  it("accepts a comma decimal as input", () => {
    expect(scaleAmount("1,5", 2)).toBe("3");
  });

  // NOTE: upstream quirk — parseFloat("1/2") === 1 and parseFloat("2-3") === 2,
  // so the number branch fires first and the dedicated fraction/range branches
  // are effectively dead code. These tests pin the ACTUAL ported behaviour, not
  // the (arguably intended) fraction/range math. See docs/ACTION_ITEMS.md.
  it("treats a fraction as its leading number (upstream quirk)", () => {
    expect(scaleAmount("1/2", 2)).toBe("2");
  });

  it("treats a range as its leading number (upstream quirk)", () => {
    expect(scaleAmount("2-3", 2)).toBe("4");
  });

  it("leaves unknown formats untouched", () => {
    expect(scaleAmount("snufje", 2)).toBe("snufje");
    expect(scaleAmount("", 2)).toBe("");
  });
});

describe("scaleIngredients", () => {
  const ings: Ingredient[] = [
    { name: "bloem", amount: "200", unit: "g" },
    { name: "eieren", amount: "2", unit: "" },
  ];

  it("scales every ingredient by new/original servings", () => {
    const out = scaleIngredients(ings, 2, 4);
    expect(out[0].amount).toBe("400");
    expect(out[1].amount).toBe("4");
  });

  it("returns the originals when servings are equal or missing", () => {
    expect(scaleIngredients(ings, 4, 4)).toEqual(ings);
    expect(scaleIngredients(ings, 0, 4)).toEqual(ings);
  });
});

describe("formatIngredientsAsText", () => {
  it("formats a bullet list with amount/unit and optional recipe title", () => {
    const text = formatIngredientsAsText([
      { name: "bloem", amount: "200", unit: "g" },
      { name: "zout", amount: "", unit: "", recipeTitle: "Brood" },
    ]);
    expect(text).toBe("- 200 g bloem\n- zout (Brood)");
  });
});
