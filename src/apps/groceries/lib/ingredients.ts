import { Ingredient } from "../types";

/**
 * Schaalt een hoeveelheid string (bijv. "200", "1/2", "2-3") met een factor.
 * Retourneert de geschaalde waarde als string.
 */
// Rond af op max 2 decimalen, zonder trailing zeros (1, 1.5, 0.75).
function formatScaled(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

export function scaleAmount(amount: string, factor: number): string {
  if (!amount || factor === 1) return amount;

  // Breuk (bijv. "1/2") — MOET vóór de getal-branch, want
  // parseFloat("1/2") === 1 en zou de breuk als heel getal schalen.
  const fractionMatch = amount.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1]) * factor;
    const denominator = parseInt(fractionMatch[2]);
    return formatScaled(numerator / denominator);
  }

  // Range (bijv. "2-3") — MOET vóór de getal-branch, want
  // parseFloat("2-3") === 2 en zou alleen de ondergrens schalen.
  const rangeMatch = amount.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const low = formatScaled(parseInt(rangeMatch[1]) * factor);
    const high = formatScaled(parseInt(rangeMatch[2]) * factor);
    return `${low}-${high}`;
  }

  // Simpel getal (accepteert komma-decimaal)
  const num = parseFloat(amount.replace(",", "."));
  if (!isNaN(num)) {
    const scaled = num * factor;
    // Rond af op 1 decimaal, verwijder trailing zeros
    const rounded = Math.round(scaled * 10) / 10;
    return rounded.toString().replace(".", ",");
  }

  // Onbekend formaat, return origineel
  return amount;
}

/**
 * Schaalt alle ingrediënten van een recept.
 */
export function scaleIngredients(
  ingredients: Ingredient[],
  originalServings: number,
  newServings: number
): Ingredient[] {
  if (!originalServings || originalServings === newServings) {
    return ingredients;
  }

  const factor = newServings / originalServings;

  return ingredients.map((ing) => ({
    ...ing,
    amount: scaleAmount(ing.amount, factor),
  }));
}

/**
 * Formatteert ingrediënten als tekst voor kopiëren.
 */
export function formatIngredientsAsText(
  ingredients: Array<Ingredient & { recipeTitle?: string }>
): string {
  const lines = ingredients.map((ing) => {
    let line = "";
    if (ing.amount) line += `${ing.amount} `;
    if (ing.unit) line += `${ing.unit} `;
    line += ing.name;
    if (ing.recipeTitle) line += ` (${ing.recipeTitle})`;
    return `- ${line}`;
  });
  return lines.join("\n");
}
