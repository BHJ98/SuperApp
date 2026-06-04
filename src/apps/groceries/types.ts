export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl: string;
  servings: number | null;
  ingredients: Ingredient[];
  instructions: string[];
  addedAt: string;
  userId?: string;
  favorited?: boolean;
}
