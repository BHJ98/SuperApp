
import { useState, useRef } from "react";
import { Recipe, Ingredient } from "../types";
import { scaleIngredients, formatIngredientsAsText } from "../lib/ingredients";

interface ShoppingItem extends Ingredient {
  checked: boolean;
  recipeTitle: string;
  recipeId: string;
}

const SWIPE_THRESHOLD = 80; // px before delete triggers

export function ShoppingList({
  recipes,
  adjustedServings,
  filterRecipeIds,
  onClearFilter,
}: {
  recipes: Recipe[];
  adjustedServings: Record<string, number>;
  filterRecipeIds?: Set<string>;
  onClearFilter?: () => void;
}) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [deletedItems, setDeletedItems] = useState<Set<string>>(new Set());
  const [exitingKeys, setExitingKeys] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Swipe state — only one item at a time
  const [swipingKey, setSwipingKey] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);

  const activeRecipes = filterRecipeIds && filterRecipeIds.size > 0
    ? recipes.filter((r) => filterRecipeIds.has(r.id))
    : recipes;

  const allItems: ShoppingItem[] = activeRecipes.flatMap((recipe) => {
    const originalServings = recipe.servings || 4;
    const newServings = adjustedServings[recipe.id] || originalServings;
    const scaled = scaleIngredients(recipe.ingredients, originalServings, newServings);
    return scaled.map((ing) => ({
      ...ing,
      checked: checkedItems.has(`${recipe.id}-${ing.name}`),
      recipeTitle: recipe.title,
      recipeId: recipe.id,
    }));
  });

  const items = allItems.filter((item) => !deletedItems.has(`${item.recipeId}-${item.name}`));

  function toggleCheck(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function selectAll() { setSelectedItems(new Set(items.map((i) => `${i.recipeId}-${i.name}`))); }
  function selectNone() { setSelectedItems(new Set()); }

  function deleteSelected() {
    setDeletedItems((prev) => { const next = new Set(prev); selectedItems.forEach((k) => next.add(k)); return next; });
    setSelectedItems(new Set());
    setManageMode(false);
  }

  // Animate item off-screen then remove it
  function deleteOne(key: string) {
    setExitingKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setDeletedItems((prev) => new Set(prev).add(key));
      setExitingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }, 280);
  }

  // ── Touch handlers ──────────────────────────────────────
  function onTouchStart(key: string, e: React.TouchEvent) {
    if (manageMode) return;
    touchStartX.current = e.touches[0].clientX;
    setSwipingKey(key);
    setSwipeOffset(0);
  }

  function onTouchMove(key: string, e: React.TouchEvent) {
    if (swipingKey !== key) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    setSwipeOffset(Math.min(0, dx)); // left only
  }

  function onTouchEnd(key: string) {
    if (swipingKey !== key) return;
    if (swipeOffset < -SWIPE_THRESHOLD) {
      deleteOne(key);
    }
    setSwipingKey(null);
    setSwipeOffset(0);
  }

  async function copyToClipboard() {
    const unchecked = items.filter((i) => !checkedItems.has(`${i.recipeId}-${i.name}`));
    const text = formatIngredientsAsText(unchecked);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Kon niet kopiëren:", err);
    }
  }

  if (items.length === 0 && allItems.length === 0) {
    return (
      <div className="text-center mt-20">
        <p className="font-bebas text-3xl tracking-widest text-border">Geen boodschappen</p>
        <p className="text-muted text-xs mt-2 uppercase tracking-widest">Voeg recepten toe om een lijst te maken</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center mt-20">
        <p className="font-bebas text-3xl tracking-widest text-border">Lijst leeg</p>
        <p className="text-muted text-xs mt-2 uppercase tracking-widest">Alle items zijn verwijderd</p>
      </div>
    );
  }

  const uncheckedCount = items.filter((i) => !checkedItems.has(`${i.recipeId}-${i.name}`)).length;
  const allSelected = items.length > 0 && selectedItems.size === items.length;

  return (
    <div>
      {/* Active filter banner */}
      {filterRecipeIds && filterRecipeIds.size > 0 && (
        <div className="flex items-center justify-between mb-4 px-3 py-2 bg-surface border border-gold/30 rounded-md">
          <p className="text-xs text-gold uppercase tracking-widest font-semibold">
            {filterRecipeIds.size} {filterRecipeIds.size === 1 ? "recept" : "recepten"} geselecteerd
          </p>
          <button
            onClick={onClearFilter}
            className="text-xs text-muted hover:text-ink uppercase tracking-widest transition-colors"
          >
            Toon alles
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-bebas text-2xl tracking-widest text-ink">Boodschappenlijst</h2>
          <p className="text-xs text-muted uppercase tracking-widest mt-0.5">
            {manageMode
              ? `${selectedItems.size} geselecteerd`
              : `${uncheckedCount} van ${items.length} over`}
          </p>
        </div>

        {manageMode ? (
          <div className="flex items-center gap-2">
            <button
              onClick={allSelected ? selectNone : selectAll}
              className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink transition-colors"
            >
              {allSelected ? "Niets" : "Alles"}
            </button>
            <button
              onClick={deleteSelected}
              disabled={selectedItems.size === 0}
              className="text-xs font-semibold uppercase tracking-widest text-white bg-red-600 px-3 py-1.5 rounded-md hover:bg-red-700 transition-colors disabled:opacity-30"
            >
              Verwijder{selectedItems.size > 0 ? ` (${selectedItems.size})` : ""}
            </button>
            <button
              onClick={() => { setSelectedItems(new Set()); setManageMode(false); }}
              className="text-xs font-semibold uppercase tracking-widest text-muted hover:text-ink transition-colors"
            >
              Klaar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setManageMode(true)}
              className="text-xs font-semibold uppercase tracking-widest text-muted border border-border rounded-md px-3 py-1.5 hover:border-muted hover:text-ink transition-colors"
            >
              Beheren
            </button>
            <button
              onClick={copyToClipboard}
              className="text-xs font-semibold uppercase tracking-widest text-gold border border-gold/40 rounded-md px-3 py-1.5 hover:bg-gold/10 transition-colors"
            >
              {copied ? "✓ Klaar" : "↗ Kopieer"}
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {items.map((item, i) => {
          const key = `${item.recipeId}-${item.name}`;
          const isChecked = checkedItems.has(key);
          const isSelected = selectedItems.has(key);
          const isSwiping = swipingKey === key;
          const isExiting = exitingKeys.has(key);

          // How far left the item is sliding
          const offset = isExiting ? -400 : isSwiping ? swipeOffset : 0;
          // Show red bg once dragging meaningfully
          const swipeProgress = isSwiping ? Math.min(1, Math.abs(swipeOffset) / SWIPE_THRESHOLD) : 0;

          return (
            <div
              key={`${key}-${i}`}
              className="relative rounded-md overflow-hidden"
              style={{
                // Collapse height smoothly when exiting
                maxHeight: isExiting ? 0 : 48,
                opacity: isExiting ? 0 : 1,
                transition: isExiting ? "max-height 0.28s ease, opacity 0.28s ease" : undefined,
              }}
            >
              {/* Red delete background (revealed on swipe) */}
              <div
                className="absolute inset-0 bg-red-600 flex items-center justify-end pr-4"
                style={{ opacity: swipeProgress }}
              >
                <span className="text-white text-xs font-semibold uppercase tracking-widest">
                  Verwijder
                </span>
              </div>

              {/* Item row */}
              <div
                className={`group relative flex items-center gap-3 py-2 px-3 rounded-md transition-colors bg-bg ${
                  manageMode
                    ? isSelected
                      ? "bg-surface border border-border"
                      : "hover:bg-surface cursor-pointer"
                    : isChecked
                      ? "opacity-40"
                      : ""
                }`}
                style={{
                  transform: `translateX(${offset}px)`,
                  transition: isSwiping ? "none" : isExiting ? "transform 0.28s ease" : "transform 0.2s ease",
                  touchAction: manageMode ? undefined : "pan-y",
                }}
                onClick={() => {
                  // Don't fire click if we just finished a meaningful swipe
                  if (Math.abs(swipeOffset) > 5) return;
                  if (manageMode) toggleSelect(key); else toggleCheck(key);
                }}
                onTouchStart={(e) => onTouchStart(key, e)}
                onTouchMove={(e) => onTouchMove(key, e)}
                onTouchEnd={() => onTouchEnd(key)}
                role="button"
              >
                {/* Checkbox */}
                <span
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    manageMode
                      ? isSelected ? "bg-red-600 border-red-600" : "border-border"
                      : isChecked  ? "bg-gold border-gold"       : "border-border"
                  }`}
                >
                  {(manageMode ? isSelected : isChecked) && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke={manageMode ? "white" : "#0D1A0F"}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs text-ink ${!manageMode && isChecked ? "line-through" : ""}`}>
                    {(item.amount || item.unit) && (
                      <span className="text-muted">{[item.amount, item.unit].filter(Boolean).join(" ")} </span>
                    )}
                    {item.name}
                  </p>
                </div>

                <span className="text-xs text-muted truncate max-w-[90px] shrink-0">{item.recipeTitle}</span>

                {/* Desktop-only hover × */}
                {!manageMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteOne(key); }}
                    className="text-xs text-muted hover:text-red-500 hidden sm:block opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!manageMode && (
        <p className="text-muted text-xs uppercase tracking-widest mt-5 text-center">
          Veeg links om te verwijderen
        </p>
      )}
    </div>
  );
}
