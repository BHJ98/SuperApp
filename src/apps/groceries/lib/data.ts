import { supabase } from "@/lib/supabase";
import type { Recipe } from "../types";

// All groceries data lives in the `boodschappen` schema on the shared project.
// Recipes are shared across allow-listed users (household); favorites and
// meal_plans are per-user. RLS enforces both (see migration/boodschappen_schema.sql).

export function gdb() {
  if (!supabase) throw new Error("Supabase client not configured");
  return supabase.schema("boodschappen");
}

type Row = Record<string, unknown>;

export function rowToRecipe(r: Row): Recipe {
  return {
    id: r.id as string,
    title: r.title as string,
    sourceUrl: (r.source_url as string) ?? "",
    servings: (r.servings as number | null) ?? null,
    ingredients: (r.ingredients as Recipe["ingredients"]) ?? [],
    instructions: (r.instructions as string[]) ?? [],
    addedAt: r.created_at as string,
    userId: r.user_id as string,
  };
}

export interface ExtractedRecipe {
  title: string;
  servings: number | null;
  ingredients: Recipe["ingredients"];
  instructions: string[];
}

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await gdb()
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRecipe);
}

export async function addRecipe(
  userId: string,
  extracted: ExtractedRecipe,
  sourceUrl: string,
): Promise<Recipe> {
  const { data, error } = await gdb()
    .from("recipes")
    .insert({
      user_id: userId,
      title: extracted.title,
      servings: extracted.servings,
      ingredients: extracted.ingredients,
      instructions: extracted.instructions,
      source_url: sourceUrl,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToRecipe(data as Row);
}

export async function removeRecipe(id: string): Promise<void> {
  const { error } = await gdb().from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listFavoriteIds(userId: string): Promise<Set<string>> {
  const { data } = await gdb().from("favorites").select("recipe_id").eq("user_id", userId);
  return new Set((data ?? []).map((f) => (f as Row).recipe_id as string));
}

export async function addFavorite(userId: string, recipeId: string): Promise<void> {
  await gdb().from("favorites").insert({ user_id: userId, recipe_id: recipeId });
}

export async function removeFavorite(userId: string, recipeId: string): Promise<void> {
  await gdb().from("favorites").delete().eq("user_id", userId).eq("recipe_id", recipeId);
}

export async function listCookedRecipeIds(userId: string): Promise<Set<string>> {
  const { data } = await gdb().from("meal_plans").select("recipe_id").eq("user_id", userId);
  return new Set((data ?? []).map((mp) => (mp as Row).recipe_id as string));
}
