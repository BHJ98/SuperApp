import { useState, useEffect, useCallback } from "react";
import type { Recipe } from "./types";
import { RecipeCard } from "./components/RecipeCard";
import { ShoppingList } from "./components/ShoppingList";
import { MealPlanner } from "./components/MealPlanner";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/auth";
import {
  addFavorite,
  addRecipe,
  listCookedRecipeIds,
  listFavoriteIds,
  listRecipes,
  removeFavorite,
  removeRecipe,
  type ExtractedRecipe,
} from "./lib/data";

type Tab = "recipes" | "planner" | "list";

export default function Groceries() {
  const user = useCurrentUser();
  const configured = isSupabaseConfigured;

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("recipes");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [adjustedServings, setAdjustedServings] = useState<Record<string, number>>({});
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeFilter, setRecipeFilter] = useState<"all" | "new" | "made">("all");
  const [cookedRecipeIds, setCookedRecipeIds] = useState<Set<string>>(new Set());
  const [shoppingListRecipeIds, setShoppingListRecipeIds] = useState<Set<string>>(new Set());
  const [randomRecipe, setRandomRecipe] = useState<Recipe | null>(null);

  const loadRecipes = useCallback(async () => {
    if (!user || !configured) return;
    try {
      setRecipes(await listRecipes());
      setFavoriteIds(await listFavoriteIds(user.id));
      setCookedRecipeIds(await listCookedRecipeIds(user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon recepten niet laden");
    }
  }, [user, configured]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !user || !configured) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Er ging iets mis");
      const extracted: ExtractedRecipe = {
        title: data.title,
        servings: data.servings ?? null,
        ingredients: data.ingredients ?? [],
        instructions: data.instructions ?? [],
      };
      const saved = await addRecipe(user.id, extracted, url.trim());
      setRecipes((prev) => [saved, ...prev]);
      setUrl("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveRecipe(id: string) {
    try {
      await removeRecipe(id);
      setRecipes((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon recept niet verwijderen");
    }
  }

  async function toggleFavorite(recipeId: string) {
    if (!user) return;
    if (favoriteIds.has(recipeId)) {
      await removeFavorite(user.id, recipeId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
    } else {
      await addFavorite(user.id, recipeId);
      setFavoriteIds((prev) => new Set(prev).add(recipeId));
    }
  }

  function handleServingsChange(recipeId: string, servings: number) {
    setAdjustedServings((prev) => ({ ...prev, [recipeId]: servings }));
  }

  function markRecipeCooked(recipeId: string) {
    setCookedRecipeIds((prev) => new Set(prev).add(recipeId));
  }

  function addRecipesToShoppingList(ids: string[]) {
    setShoppingListRecipeIds(new Set(ids));
    setActiveTab("list");
  }

  function pickRandomRecipe() {
    if (!recipes.length) return;
    const pool = recipes.filter((r) => r.id !== randomRecipe?.id);
    const source = pool.length ? pool : recipes;
    setRandomRecipe(source[Math.floor(Math.random() * source.length)]);
  }

  const filteredRecipes = recipes.filter((r) => {
    if (!r.title.toLowerCase().includes(recipeSearch.toLowerCase())) return false;
    if (recipeFilter === "new") return !cookedRecipeIds.has(r.id);
    if (recipeFilter === "made") return cookedRecipeIds.has(r.id);
    return true;
  });

  if (!configured || !user) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold">Boodschappen</h2>
        <p className="mt-1 text-sm text-slate-400">
          {configured
            ? "Sign in to use Boodschappen."
            : "Supabase isn't configured in this environment, so groceries data can't load."}
        </p>
      </div>
    );
  }

  const tabLabels: Record<Tab, string> = {
    recipes: `Recepten${recipes.length > 0 ? ` (${recipes.length})` : ""}`,
    planner: "Weekplanner",
    list: "Boodschappen",
  };

  return (
    <div className="groceries-app -mx-4 -mt-4 min-h-[calc(100vh-3.25rem)] bg-bg font-sans text-ink">
      <div className="h-1 bg-gold" />
      <div className="mx-auto max-w-2xl px-5">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border pb-6 pt-6">
          <div>
            <h1 className="font-bebas text-5xl leading-none tracking-widest text-ink">
              Boodschappen
            </h1>
            <p className="mt-1.5 text-xs uppercase tracking-widest text-muted">
              Recepten · Planner · Lijst
            </p>
          </div>
        </header>

        {/* URL input */}
        <form onSubmit={handleSubmit} className="mb-6 mt-6">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Plak een recept-URL…"
              className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="flex shrink-0 items-center gap-2 rounded-md bg-gold px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-bg hover:opacity-90 disabled:opacity-30"
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
              ) : (
                "Ophalen"
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs uppercase tracking-wide text-red-500">{error}</p>
          )}
        </form>

        {/* Tabs */}
        <div className="mb-6 flex gap-0 border-b border-border">
          {(["recipes", "planner", "list"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`mr-7 pb-3 text-xs font-semibold uppercase tracking-widest transition-colors ${
                activeTab === tab
                  ? "-mb-px border-b-2 border-gold text-gold"
                  : "text-muted hover:text-ink"
              }`}
            >
              {tabLabels[tab]}
              {tab === "list" && shoppingListRecipeIds.size > 0 && (
                <span className="ml-1.5 rounded-full bg-gold px-1.5 py-0.5 text-xs font-bold text-bg">
                  {shoppingListRecipeIds.size}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="pb-16">
          {activeTab === "recipes" && (
            <div>
              {recipes.length > 0 && (
                <>
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      value={recipeSearch}
                      onChange={(e) => setRecipeSearch(e.target.value)}
                      placeholder="Zoek recept…"
                      className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none"
                    />
                    <button
                      onClick={pickRandomRecipe}
                      className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:border-gold hover:text-gold"
                      title="Verras me"
                    >
                      🎲 Verras me
                    </button>
                  </div>
                  <div className="mb-4 flex gap-2">
                    {(["all", "new", "made"] as const).map((f) => {
                      const count =
                        f === "all"
                          ? recipes.length
                          : f === "new"
                            ? recipes.filter((r) => !cookedRecipeIds.has(r.id)).length
                            : recipes.filter((r) => cookedRecipeIds.has(r.id)).length;
                      const labels = { all: "Alle", new: "Nieuw", made: "Al gemaakt" };
                      return (
                        <button
                          key={f}
                          onClick={() => setRecipeFilter(f)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                            recipeFilter === f
                              ? "border-gold bg-gold text-bg"
                              : "border-border text-muted hover:border-muted hover:text-ink"
                          }`}
                        >
                          {labels[f]} ({count})
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {filteredRecipes.length === 0 ? (
                <div className="mt-20 text-center">
                  <p className="font-bebas text-3xl tracking-widest text-border">
                    {recipeSearch ? "Geen resultaten" : "Geen recepten"}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-widest text-muted">
                    {recipeSearch
                      ? "Probeer een andere zoekterm"
                      : "Plak een URL hierboven om te beginnen"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRecipes.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      isFavorited={favoriteIds.has(recipe.id)}
                      isNew={!cookedRecipeIds.has(recipe.id)}
                      onToggleFavorite={() => toggleFavorite(recipe.id)}
                      onRemove={() => handleRemoveRecipe(recipe.id)}
                      canDelete={recipe.userId === user.id}
                      onServingsChange={(s) => handleServingsChange(recipe.id, s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "planner" && (
            <MealPlanner
              recipes={recipes}
              userId={user.id}
              favoriteIds={favoriteIds}
              onToggleFavorite={toggleFavorite}
              onServingsChange={handleServingsChange}
              onAddToShoppingList={addRecipesToShoppingList}
              onRecipeCooked={markRecipeCooked}
            />
          )}

          {activeTab === "list" && (
            <ShoppingList
              recipes={recipes}
              adjustedServings={adjustedServings}
              filterRecipeIds={shoppingListRecipeIds}
              onClearFilter={() => setShoppingListRecipeIds(new Set())}
            />
          )}
        </main>
      </div>

      {/* Random recipe modal */}
      {randomRecipe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5"
          onClick={() => setRandomRecipe(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-gold/40 bg-bg p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">
              Verrassing
            </p>
            <h2 className="mb-1 font-bebas text-4xl leading-tight tracking-widest text-ink">
              {randomRecipe.title.toUpperCase()}
            </h2>
            <p className="mb-5 text-xs text-muted">
              {randomRecipe.servings ?? 4} personen · {randomRecipe.ingredients.length}{" "}
              ingrediënten
            </p>
            <ul className="mb-6 max-h-40 space-y-1 overflow-y-auto">
              {randomRecipe.ingredients.slice(0, 8).map((ing, i) => (
                <li key={i} className="flex gap-2 text-xs text-ink">
                  <span className="text-gold">·</span>
                  <span>
                    {(ing.amount || ing.unit) && (
                      <span className="text-muted">
                        {[ing.amount, ing.unit].filter(Boolean).join(" ")}{" "}
                      </span>
                    )}
                    {ing.name}
                  </span>
                </li>
              ))}
              {randomRecipe.ingredients.length > 8 && (
                <li className="text-xs text-muted">
                  + {randomRecipe.ingredients.length - 8} meer…
                </li>
              )}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={pickRandomRecipe}
                className="flex-1 rounded-md border border-border py-2 text-xs font-semibold uppercase tracking-widest text-muted hover:border-muted hover:text-ink"
              >
                🎲 Andere
              </button>
              <button
                onClick={() => {
                  addRecipesToShoppingList([randomRecipe.id]);
                  setRandomRecipe(null);
                }}
                className="flex-1 rounded-md bg-gold py-2 text-xs font-semibold uppercase tracking-widest text-bg hover:opacity-90"
              >
                → Boodschappenlijst
              </button>
              <button
                onClick={() => setRandomRecipe(null)}
                className="w-10 rounded-md border border-border py-2 text-xs text-muted hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
