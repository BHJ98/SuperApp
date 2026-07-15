import { useState, useEffect, useMemo } from "react";
import type { Recipe } from "./types";
import { RecipeCard } from "./components/RecipeCard";
import { ShoppingList } from "./components/ShoppingList";
import { MealPlanner } from "./components/MealPlanner";
import { isSupabaseConfigured } from "@/lib/supabase";
import { apiUrl } from "@/lib/apiBase";
import { useCurrentUser } from "@/lib/auth";
import {
  addFavorite,
  addRecipe,
  listCookedRecipeIds,
  listFavoriteIds,
  removeFavorite,
  removeRecipe,
  subscribeToRecipes,
  type ExtractedRecipe,
} from "./lib/data";
import { recipeItemKey, useShoppingList } from "./lib/useShoppingList";

type Tab = "recipes" | "planner" | "list";

// Recipes on these hosts keep the actual recipe in the video, so /api/extract
// can't read them — catch that before making a doomed request.
const SOCIAL_MEDIA_HOSTS = ["instagram.com", "tiktok.com", "facebook.com", "youtube.com"];

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

  // Shopping-list state lives up here (one realtime subscription) so both the
  // list tab and the open-items badge on the tab bar can use it.
  const shoppingList = useShoppingList();

  // Realtime recipes: fires with the current list right away, then again on
  // every change from any device — both partners see each other's recipes,
  // favorites and "already made" status live.
  useEffect(() => {
    if (!user || !configured) return;
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToRecipes((rs) => {
        setRecipes(rs);
        listFavoriteIds().then(setFavoriteIds).catch(() => {});
        listCookedRecipeIds().then(setCookedRecipeIds).catch(() => {});
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon recepten niet laden");
    }
    return () => unsub?.();
  }, [user, configured]);

  // Unchecked, non-removed items (recipe-derived + manual) for the tab badge.
  const openItemCount = useMemo(() => {
    let count = 0;
    for (const row of shoppingList.dbItems.values()) {
      if (row.kind === "manual" && !row.removed && !row.checked) count++;
    }
    for (const recipe of recipes) {
      recipe.ingredients.forEach((_ing, i) => {
        const row = shoppingList.dbItems.get(recipeItemKey(recipe.id, i));
        if (!row?.removed && !row?.checked) count++;
      });
    }
    return count;
  }, [shoppingList.dbItems, recipes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !user || !configured) return;
    let host = "";
    try {
      host = new URL(url.trim()).hostname.toLowerCase();
    } catch {
      // Not parseable as a URL — let /api/extract report what's wrong.
    }
    if (SOCIAL_MEDIA_HOSTS.some((domain) => host.includes(domain))) {
      setError(
        "Recepten van Instagram/TikTok kunnen helaas niet automatisch gelezen worden — de tekst zit in de video. Plak een link van een receptenwebsite (bijv. AH, Jumbo, 24Kitchen).",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/extract"), {
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
      await removeFavorite(recipeId);
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
        <p className="mt-1 text-sm text-muted">
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
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-3.25rem)]" data-app="groceries">
      <div className="h-0.5 bg-gold" />
      <div className="px-5">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border pb-6 pt-6">
          <div>
            <h1 className="font-display text-5xl font-bold leading-none tracking-tight text-ink">
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
            <p className="mt-2 text-xs uppercase tracking-wide text-danger">{error}</p>
          )}
        </form>

        {/* Tabs — sticky below the shell header so you can always jump to the
            list while scrolling in the store (matches the finance sub-nav). */}
        <div
          className="sticky top-[3.25rem] z-[5] mb-6 backdrop-blur-md"
          style={{ background: "color-mix(in srgb, var(--base) 92%, transparent)" }}
        >
          <div className="flex gap-0 border-b border-border">
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
                {tab === "list" && !shoppingList.loading && openItemCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-gold px-1.5 py-0.5 text-xs font-bold text-bg">
                    {openItemCount}
                  </span>
                )}
              </button>
            ))}
          </div>
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
                  <p className="font-display text-3xl font-bold tracking-tight text-border">
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
                      servings={adjustedServings[recipe.id] ?? recipe.servings ?? 4}
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
              dbItems={shoppingList.dbItems}
              loading={shoppingList.loading}
              persistItem={shoppingList.persistItem}
              removeItem={shoppingList.removeItem}
              addManualItem={shoppingList.addManualItem}
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
            <h2 className="mb-1 font-display text-4xl font-bold leading-tight tracking-tight text-ink">
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
