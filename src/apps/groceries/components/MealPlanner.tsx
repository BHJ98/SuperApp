
import { useState, useEffect } from "react";
import { Recipe } from "../types";
import { gdb } from "../lib/data";

interface MealPlan {
  id: string;
  recipeId: string;
  date: string;
  servings: number;
}

interface MealPlannerProps {
  recipes: Recipe[];
  userId: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onServingsChange: (recipeId: string, servings: number) => void;
  onAddToShoppingList: (recipeIds: string[]) => void;
  onRecipeCooked: (recipeId: string) => void;
}

const DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const FULL_DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

function getWeekDates(): Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function MealPlanner({
  recipes, userId, favoriteIds, onToggleFavorite, onServingsChange, onAddToShoppingList, onRecipeCooked,
}: MealPlannerProps) {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addSearch, setAddSearch] = useState("");

  const weekDates = getWeekDates();
  const supabase = gdb();

  useEffect(() => {
    async function load() {
      const startDate = formatDate(weekDates[0]);
      const endDate = formatDate(weekDates[6]);
      const { data } = await supabase
        .from("meal_plans").select("*").eq("user_id", userId)
        .gte("date", startDate).lte("date", endDate);
      if (data) {
        setMealPlans(data.map((mp) => ({
          id: mp.id, recipeId: mp.recipe_id, date: mp.date, servings: mp.servings,
        })));
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function addMealPlan(recipeId: string, date: string) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const servings = recipe?.servings || 4;
    const { data, error } = await supabase
      .from("meal_plans")
      .insert({ user_id: userId, recipe_id: recipeId, date, servings })
      .select().single();
    if (data && !error) {
      setMealPlans((prev) => [...prev, { id: data.id, recipeId: data.recipe_id, date: data.date, servings: data.servings }]);
      onRecipeCooked(recipeId);
    }
    setAddSearch("");
  }

  async function removeMealPlan(id: string) {
    await supabase.from("meal_plans").delete().eq("id", id);
    setMealPlans((prev) => prev.filter((mp) => mp.id !== id));
  }

  async function updateServings(id: string, servings: number) {
    await supabase.from("meal_plans").update({ servings }).eq("id", id);
    setMealPlans((prev) => prev.map((mp) => (mp.id === id ? { ...mp, servings } : mp)));
    const plan = mealPlans.find((mp) => mp.id === id);
    if (plan) onServingsChange(plan.recipeId, servings);
  }

  function getMealsForDate(date: string): Array<MealPlan & { recipe: Recipe }> {
    return mealPlans
      .filter((mp) => mp.date === date)
      .map((mp) => ({ ...mp, recipe: recipes.find((r) => r.id === mp.recipeId)! }))
      .filter((mp) => mp.recipe);
  }

  function getAllWeekRecipeIds(): string[] {
    const seen = new Set<string>();
    return mealPlans.map((mp) => mp.recipeId).filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function getDayRecipeIds(date: string): string[] {
    return getMealsForDate(date).map((mp) => mp.recipeId);
  }

  const weekHasMeals = mealPlans.length > 0;

  if (loading) {
    return (
      <div className="text-center mt-20">
        <p className="text-muted text-xs uppercase tracking-widest">Laden…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Week actions */}
      {weekHasMeals && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => onAddToShoppingList(getAllWeekRecipeIds())}
            className="text-xs font-semibold uppercase tracking-widest bg-gold text-bg px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
          >
            → Hele week naar boodschappenlijst
          </button>
        </div>
      )}

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-1.5 mb-5">
        {weekDates.map((date, i) => {
          const dateStr = formatDate(date);
          const isToday = formatDate(new Date()) === dateStr;
          const meals = getMealsForDate(dateStr);
          const isSelected = selectedDay === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => { setSelectedDay(selectedDay === dateStr ? null : dateStr); setAddSearch(""); }}
              className={`p-2 rounded-md text-center transition-all border ${
                isSelected
                  ? "bg-gold border-gold text-bg"
                  : isToday
                    ? "bg-surface border-gold/50 text-ink"
                    : "bg-surface border-border hover:border-muted text-ink"
              }`}
            >
              <div className={`text-xs uppercase tracking-widest font-semibold ${isSelected ? "text-bg/70" : "text-muted"}`}>
                {DAYS[i]}
              </div>
              <div className="font-bebas text-2xl leading-tight tracking-wide">{date.getDate()}</div>
              {meals.length > 0 && (
                <div className={`text-xs font-semibold mt-0.5 ${isSelected ? "text-bg/80" : "text-gold"}`}>
                  {meals.length}×
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Day detail */}
      {selectedDay && (
        <div className="bg-surface border border-border rounded-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bebas text-xl tracking-widest text-ink">
              {FULL_DAYS[weekDates.findIndex((d) => formatDate(d) === selectedDay)]}
            </h3>
            {getDayRecipeIds(selectedDay).length > 0 && (
              <button
                onClick={() => onAddToShoppingList(getDayRecipeIds(selectedDay))}
                className="text-xs font-semibold uppercase tracking-widest text-gold border border-gold/40 rounded-md px-3 py-1.5 hover:bg-gold/10 transition-colors"
              >
                → Naar boodschappenlijst
              </button>
            )}
          </div>

          {/* Planned meals */}
          {getMealsForDate(selectedDay).map((mp) => (
            <div key={mp.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink font-semibold truncate">{mp.recipe.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => updateServings(mp.id, Math.max(1, mp.servings - 1))}
                    className="w-5 h-5 rounded border border-border text-xs hover:border-gold hover:text-gold transition-colors text-ink"
                  >−</button>
                  <span className="text-xs text-muted">{mp.servings}p</span>
                  <button
                    onClick={() => updateServings(mp.id, mp.servings + 1)}
                    className="w-5 h-5 rounded border border-border text-xs hover:border-gold hover:text-gold transition-colors text-ink"
                  >+</button>
                </div>
              </div>
              {/* Favorite toggle */}
              <button
                onClick={() => onToggleFavorite(mp.recipe.id)}
                className={`text-base transition-colors shrink-0 ${
                  favoriteIds.has(mp.recipe.id) ? "text-gold" : "text-border hover:text-gold"
                }`}
                title={favoriteIds.has(mp.recipe.id) ? "Verwijder uit favorieten" : "Favoriet"}
              >
                {favoriteIds.has(mp.recipe.id) ? "★" : "☆"}
              </button>
              <button
                onClick={() => removeMealPlan(mp.id)}
                className="text-xs text-muted hover:text-red-500 transition-colors shrink-0"
              >✕</button>
            </div>
          ))}

          {/* Add recipe with search */}
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-gold font-semibold mb-2">Toevoegen</p>
            <input
              type="text"
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Zoek recept…"
              className="w-full bg-raised border border-border rounded-md px-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-gold transition-colors mb-2"
            />
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {recipes
                .filter((r) =>
                  !getMealsForDate(selectedDay).some((mp) => mp.recipeId === r.id) &&
                  r.title.toLowerCase().includes(addSearch.toLowerCase())
                )
                .map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => addMealPlan(recipe.id, selectedDay)}
                    className="w-full text-left flex items-center justify-between gap-2 text-xs py-2 px-2 rounded hover:bg-raised text-ink transition-colors"
                  >
                    <span>+ {recipe.title}</span>
                    {favoriteIds.has(recipe.id) && <span className="text-gold text-xs">★</span>}
                  </button>
                ))}
              {recipes.filter((r) => r.title.toLowerCase().includes(addSearch.toLowerCase())).length === 0 && (
                <p className="text-xs text-muted uppercase tracking-widest">Geen recepten gevonden</p>
              )}
              {recipes.length === 0 && (
                <p className="text-xs text-muted uppercase tracking-widest">Voeg eerst recepten toe</p>
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedDay && (
        <div className="text-center mt-10">
          <p className="text-muted text-xs uppercase tracking-widest">Klik op een dag om te plannen</p>
        </div>
      )}
    </div>
  );
}
