import { supabase } from "@/lib/supabase";
import type { Recipe } from "../types";

// All groceries data lives in the `boodschappen` schema on the shared project.
// Recipes, favorites, meal_plans and the shopping list are all shared across
// allow-listed users (household). RLS enforces access (see
// migration/boodschappen_schema.sql + migration/boodschappen_shared_realtime.sql).

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

// Favorites are household-wide: the union of both partners' rows.
export async function listFavoriteIds(): Promise<Set<string>> {
  const { data } = await gdb().from("favorites").select("recipe_id");
  return new Set((data ?? []).map((f) => (f as Row).recipe_id as string));
}

export async function addFavorite(userId: string, recipeId: string): Promise<void> {
  await gdb().from("favorites").insert({ user_id: userId, recipe_id: recipeId });
}

// Deletes by recipe_id only — unfavoriting removes the partner's row too.
export async function removeFavorite(recipeId: string): Promise<void> {
  await gdb().from("favorites").delete().eq("recipe_id", recipeId);
}

// "Cooked" = ever planned by anyone in the household.
export async function listCookedRecipeIds(): Promise<Set<string>> {
  const { data } = await gdb().from("meal_plans").select("recipe_id");
  return new Set((data ?? []).map((mp) => (mp as Row).recipe_id as string));
}

// ---- Shopping list: shared + persisted + realtime (household-wide, not per-user) ----

export type ShoppingListItemRow = {
  itemKey: string;
  kind: "recipe" | "manual";
  recipeId: string | null;
  label: string | null;
  checked: boolean;
  removed: boolean;
};

function rowToShoppingListItem(r: Row): ShoppingListItemRow {
  return {
    itemKey: r.item_key as string,
    kind: r.kind as "recipe" | "manual",
    recipeId: (r.recipe_id as string | null) ?? null,
    label: (r.label as string | null) ?? null,
    checked: r.checked as boolean,
    removed: r.removed as boolean,
  };
}

export async function listShoppingListItems(): Promise<ShoppingListItemRow[]> {
  const { data, error } = await gdb().from("shopping_list_items").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToShoppingListItem);
}

export async function upsertShoppingListItem(item: {
  itemKey: string;
  kind: "recipe" | "manual";
  recipeId?: string | null;
  label?: string | null;
  checked: boolean;
  removed: boolean;
}): Promise<void> {
  const { error } = await gdb()
    .from("shopping_list_items")
    .upsert(
      {
        item_key: item.itemKey,
        kind: item.kind,
        recipe_id: item.recipeId ?? null,
        label: item.label ?? null,
        checked: item.checked,
        removed: item.removed,
      },
      { onConflict: "item_key" },
    );
  if (error) throw new Error(error.message);
}

export async function deleteShoppingListItem(itemKey: string): Promise<void> {
  const { error } = await gdb().from("shopping_list_items").delete().eq("item_key", itemKey);
  if (error) throw new Error(error.message);
}

// Realtime subscription — fires once with the current rows, then again on
// every insert/update/delete from any device. Returns an unsubscribe fn.
export function subscribeToShoppingListItems(
  callback: (items: ShoppingListItemRow[]) => void,
): () => void {
  if (!supabase) throw new Error("Supabase client not configured");
  let cancelled = false;

  listShoppingListItems()
    .then((items) => {
      if (!cancelled) callback(items);
    })
    .catch(() => {
      // Stay silent on a failed initial load — the caller keeps whatever it
      // had (or an empty list), rather than treating a transient error as
      // "the list is genuinely empty."
    });

  const channel = supabase
    .channel("boodschappen-shopping-list")
    .on(
      "postgres_changes",
      { event: "*", schema: "boodschappen", table: "shopping_list_items" },
      () => {
        if (cancelled) return;
        listShoppingListItems().then((items) => {
          if (!cancelled) callback(items);
        });
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase!.removeChannel(channel);
  };
}

// Realtime recipes — fires once with the current recipes, then again on every
// insert/update/delete from any device. Returns an unsubscribe fn.
export function subscribeToRecipes(callback: (recipes: Recipe[]) => void): () => void {
  if (!supabase) throw new Error("Supabase client not configured");
  let cancelled = false;

  listRecipes()
    .then((recipes) => {
      if (!cancelled) callback(recipes);
    })
    .catch(() => {
      // Stay silent on a failed initial load — the caller keeps whatever it
      // had rather than treating a transient error as "there are no recipes."
    });

  const channel = supabase
    .channel("boodschappen-recipes")
    .on(
      "postgres_changes",
      { event: "*", schema: "boodschappen", table: "recipes" },
      () => {
        if (cancelled) return;
        listRecipes()
          .then((recipes) => {
            if (!cancelled) callback(recipes);
          })
          .catch(() => {});
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase!.removeChannel(channel);
  };
}

// Realtime meal plans — only signals "something changed"; the caller
// (MealPlanner) refetches whatever slice (its week) it cares about.
// Returns an unsubscribe fn.
export function subscribeToMealPlans(callback: () => void): () => void {
  if (!supabase) throw new Error("Supabase client not configured");
  let cancelled = false;

  const channel = supabase
    .channel("boodschappen-meal-plans")
    .on(
      "postgres_changes",
      { event: "*", schema: "boodschappen", table: "meal_plans" },
      () => {
        if (!cancelled) callback();
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase!.removeChannel(channel);
  };
}
