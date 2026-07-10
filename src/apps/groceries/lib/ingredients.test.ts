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

  it("scales a fraction as fraction math, not as its leading number", () => {
    expect(scaleAmount("1/2", 2)).toBe("1");
    expect(scaleAmount("1/2", 3)).toBe("1.5");
    expect(scaleAmount("3/4", 2)).toBe("1.5");
  });

  it("rounds fraction results to at most 2 decimals without trailing zeros", () => {
    expect(scaleAmount("1/3", 2)).toBe("0.67");
    expect(scaleAmount("1/4", 3)).toBe("0.75");
  });

  it("scales both ends of a range", () => {
    expect(scaleAmount("2-3", 2)).toBe("4-6");
    expect(scaleAmount("2-3", 1.5)).toBe("3-4.5");
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
