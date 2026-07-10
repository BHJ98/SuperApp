import { describe, it, expect } from "vitest";
import { categorizeIngredient, CATEGORY_ORDER } from "./categorize";

describe("categorizeIngredient", () => {
  it("categorizes produce", () => {
    expect(categorizeIngredient("2 rode uien")).toBe("Groente & Fruit");
    expect(categorizeIngredient("Cherrytomaatjes")).toBe("Groente & Fruit");
  });

  it("does not let the short 'ui' keyword hijack mid-word matches", () => {
    expect(categorizeIngredient("suiker")).toBe("Houdbaar & Voorraad");
    expect(categorizeIngredient("Italiaanse kruiden")).toBe("Kruiden, Olie & Sauzen");
  });

  it("categorizes meat/fish/vega", () => {
    expect(categorizeIngredient("kipfilet")).toBe("Vlees, Vis & Vega");
    expect(categorizeIngredient("gerookte zalm")).toBe("Vlees, Vis & Vega");
  });

  it("categorizes bread and dairy", () => {
    expect(categorizeIngredient("volkorenbrood")).toBe("Brood & Bakkerij");
    expect(categorizeIngredient("3 eieren")).toBe("Zuivel & Eieren");
    expect(categorizeIngredient("geraspte kaas")).toBe("Zuivel & Eieren");
  });

  it("categorizes condiments, frozen, drinks and non-food", () => {
    expect(categorizeIngredient("olijfolie")).toBe("Kruiden, Olie & Sauzen");
    expect(categorizeIngredient("diepvrieserwten")).toBe("Diepvries");
    expect(categorizeIngredient("koffie")).toBe("Drinken");
    expect(categorizeIngredient("wc-papier")).toBe("Non-food");
  });

  it("falls back to Overig for unknown items", () => {
    expect(categorizeIngredient("batterijen")).toBe("Overig");
    expect(categorizeIngredient("")).toBe("Overig");
  });

  it("only returns categories from CATEGORY_ORDER", () => {
    const cats = CATEGORY_ORDER as readonly string[];
    for (const name of ["ui", "kip", "brood", "melk", "rijst", "olie", "ijs", "cola", "zeep", "???"]) {
      expect(cats).toContain(categorizeIngredient(name));
    }
  });
});
